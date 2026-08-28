/**
 * Återbetalningar och tvister som börjar hos Stripe i stället för hos oss.
 *
 * Adminvyns egen återbetalning skriver först i vår databas och sedan i Stripe,
 * och den vägen är väl täckt. Den andra vägen fanns inte: en återbetalning
 * gjord i Stripes egen kontrollpanel — vilket är det naturliga att göra under
 * tidspress — kom tillbaka som `refund.updated`, hittade ingen rad med det
 * `stripe_refund_id`:t, och hela satsen blev tyst en nullhändelse. Ordern stod
 * kvar som betald, `refunded_minor` som noll, och den utgående moms som vänts
 * tillbaka fanns inte antecknad någonstans.
 *
 * En tvist var ännu tystare: `charge.dispute.*` hanterades inte alls. Stripe
 * drog beloppet, vi fick veta ingenting, och tidsfristen för att svara med
 * underlag gick ut medan ordern såg normal ut i listan.
 *
 * Båda vägarna landar därför här, och båda slutar i samma tabeller som den
 * interna vägen använder — plus ett driftlarm, eftersom ingen av dem har en
 * människa framför sig när den händer.
 */

import type Stripe from 'stripe';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { raiseAlert } from '@/lib/opsAlerts';
import { disputeOutcome } from '@/lib/orderChecks';
import { recordRefund, updateRefundStatus } from '@/lib/ordersDb';
import { ensureCreditNoteForRefund } from '@/lib/creditNotes';
import { refundVatMinor } from '@/lib/vat';

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

type OrderMatch = {
  id: number;
  totalMinor: number;
  taxMinor: number;
  currency: string;
  refundedMinor: number;
};

/** Ordern bakom en betalning. Nyckeln är den enda Stripe skickar med här. */
async function orderByPaymentIntent(paymentIntentId: string): Promise<OrderMatch | null> {
  const result = await getDb().execute(sql`
    select id, total_minor, tax_minor, currency, refunded_minor
      from orders
     where stripe_payment_intent_id = ${paymentIntentId}
     limit 1
  `);
  const row = result.rows[0] as
    | { id: number; total_minor: number; tax_minor: number; currency: string; refunded_minor: number }
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    totalMinor: Number(row.total_minor),
    taxMinor: Number(row.tax_minor),
    currency: String(row.currency),
    refundedMinor: Number(row.refunded_minor),
  };
}

/**
 * Speglar en Stripe-återbetalning till vår databas, oavsett var den startade.
 *
 * Idempotent i båda riktningarna: känd återbetalning uppdaterar bara status,
 * okänd skapas med samma momsuppdelning som adminvyn hade räknat fram. Att
 * `recordRefund` är en upsert på `stripe_refund_id` gör att två webhookar för
 * samma återbetalning inte kan bli två rader.
 */
export async function syncStripeRefund(refund: Stripe.Refund): Promise<void> {
  const status = refund.status ?? 'pending';
  const known = await getDb().execute(sql`
    select id from refunds where stripe_refund_id = ${refund.id} limit 1
  `);
  if (known.rows.length > 0) {
    await updateRefundStatus(refund.id, status);
    return;
  }

  const paymentIntentId = idOf(refund.payment_intent);
  const order = paymentIntentId ? await orderByPaymentIntent(paymentIntentId) : null;
  if (!order) {
    // Pengar har lämnat kontot för något vi inte kan koppla till en order.
    // Det går inte att laga automatiskt, men det får inte passera tyst.
    await raiseAlert({
      kind: 'order.refund_outside_admin',
      key: `refund:${refund.id}`,
      subject: 'Återbetalning i Stripe utan order hos oss',
      detail: {
        refund: refund.id,
        betalning: paymentIntentId,
        belopp: refund.amount,
        valuta: refund.currency,
      },
    });
    return;
  }

  const taxMinor = refundVatMinor({
    refundMinor: refund.amount,
    orderTaxMinor: order.taxMinor,
    orderTotalMinor: order.totalMinor,
  });

  await recordRefund({
    orderId: order.id,
    stripeRefundId: refund.id,
    amountMinor: refund.amount,
    taxMinor,
    currency: refund.currency ?? order.currency,
    reason: refund.reason ?? null,
    status,
    note: 'Skapad i Stripe, inte i /admin.',
    actor: 'stripe',
  });
  // Normaliserar summan efter samma regel som alla andra statusändringar:
  // en misslyckad eller makulerad återbetalning ska inte räknas.
  await updateRefundStatus(refund.id, status);
  // Betalades ordern mot faktura ska beloppet också krediteras som en
  // handling, inte bara flyttas tillbaka. Sväljer sina egna fel och larmar.
  await ensureCreditNoteForRefund({
    stripeRefundId: refund.id,
    status,
    reason: refund.reason ?? null,
  });

  await raiseAlert({
    kind: 'order.refund_outside_admin',
    key: `refund:${refund.id}`,
    subject: `Order ${order.id} återbetalades i Stripe`,
    detail: {
      order: order.id,
      refund: refund.id,
      belopp: refund.amount,
      moms: taxMinor,
      status,
    },
    href: `/admin/orders/${order.id}`,
  });
}

/**
 * `charge.refunded` bär en Charge, inte en Refund. Raderna hämtas därför
 * separat — de kan vara flera, och `charge.refunds` följer inte alltid med
 * händelsen utan expansion.
 */
export async function syncRefundsForCharge(charge: Stripe.Charge): Promise<void> {
  const listed = await getStripe().refunds.list({ charge: charge.id, limit: 100 });
  for (const refund of listed.data) {
    await syncStripeRefund(refund);
  }
}

/**
 * En tvist. Beloppet är redan innehållet av Stripe när den här händelsen kommer.
 *
 * Vi ändrar inte betalningsstatus och rör inte lagret: en tvist är inte en
 * återbetalning, och den kan sluta med att vi vinner. Ordern får en egen status
 * så att den syns i listan, en händelse i ordertidslinjen, och ett larm — det
 * som faktiskt behöver hända är att någon lämnar underlag i Stripe före
 * tidsfristen, och det kan bara en människa göra.
 */
export async function syncStripeDispute(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId = idOf(dispute.payment_intent);
  const order = paymentIntentId ? await orderByPaymentIntent(paymentIntentId) : null;
  // Öppen, vunnen eller förlorad — se orderChecks.disputeOutcome.
  const { closed, orderStatus } = disputeOutcome(dispute.status);

  if (!order) {
    await raiseAlert({
      kind: 'order.dispute',
      key: `dispute:${dispute.id}`,
      subject: 'Tvist hos Stripe utan order hos oss',
      detail: {
        dispute: dispute.id,
        betalning: paymentIntentId,
        belopp: dispute.amount,
        status: dispute.status,
      },
    });
    return;
  }

  await getDb().execute(sql`
    with order_update as (
      update orders set
        -- Öppen tvist märker ordern; en avslutad lämnar tillbaka den till
        -- 'paid' om vi vann, och till 'refunded' om beloppet gick förlorat.
        status = ${orderStatus},
        updated_at = now()
      where id = ${order.id}
      returning id
    )
    insert into order_events (order_id, kind, actor, detail)
    select id, ${closed ? 'payment.dispute_closed' : 'payment.disputed'}, 'stripe',
           jsonb_build_object(
             'dispute_id', ${dispute.id}::text,
             'status', ${dispute.status}::text,
             'amount_minor', ${dispute.amount}::int,
             'reason', ${dispute.reason ?? null}::text,
             'evidence_due_by', ${dispute.evidence_details?.due_by ?? null}::bigint
           )
    from order_update
  `);

  const dueBy = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null;

  await raiseAlert({
    kind: 'order.dispute',
    key: `dispute:${dispute.id}:${dispute.status}`,
    subject: closed
      ? `Tvisten om order ${order.id} är avgjord: ${dispute.status}`
      : `Order ${order.id} är under tvist — svar krävs`,
    detail: {
      order: order.id,
      dispute: dispute.id,
      belopp: dispute.amount,
      orsak: dispute.reason,
      status: dispute.status,
      ...(dueBy ? { svara_senast: dueBy } : {}),
    },
    href: `/admin/orders/${order.id}`,
  });
}
