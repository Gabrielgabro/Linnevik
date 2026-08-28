/**
 * Kreditnotor på fakturaordrar.
 *
 * En återbetalning flyttar pengar. På en order som betalats med kort räcker
 * det: kvittot är Stripes, och det rättas av återbetalningen. På en order som
 * betalats mot **faktura** gör det inte det. Fakturan är en utställd handling
 * med ett löpnummer, och när beloppet ändras i efterhand kräver 17 kap 22 §
 * mervärdesskattelagen en ändringsfaktura — en kreditnota — med en otvetydig
 * hänvisning till den ursprungliga fakturan.
 *
 * Förut fanns ingen. Återbetalningen skrevs in i `refunds` med sin momsdel och
 * pengarna gick tillbaka, men ingen handling ställdes ut: köparens
 * ekonomiavdelning satt kvar med en faktura på hela beloppet, och hos Stripe
 * stod fordran orörd. Den här filen ställer ut notan, en gång per
 * återbetalning, och sparar dess nummer på återbetalningsraden.
 *
 * **Den får aldrig fälla den som anropar den.** Pengarna har redan lämnat
 * kontot när vi kommer hit; att svara adminvyn med ett fel skulle betyda en
 * återbetalning som ser misslyckad ut men är gjord. Ett fel blir därför ett
 * driftlarm — kreditnotan går att ställa ut för hand i Stripe, och larmet är
 * det som säger att någon behöver göra det.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { raiseAlert } from '@/lib/opsAlerts';

/** Stripes egna skäl. Vårt `requested_by_customer` har ingen motsvarighet. */
function creditNoteReason(reason: string | null | undefined) {
  if (reason === 'duplicate' || reason === 'fraudulent') return reason;
  return 'order_change' as const;
}

type RefundContext = {
  orderId: number;
  invoiceId: string;
  /** Brutto, alltså inklusive moms — det är mot betalningen den görs. */
  amountMinor: number;
  taxMinor: number;
};

/**
 * Ordern och fakturan bakom en återbetalning, om den ska ha en kreditnota.
 *
 * Null betyder "ingen nota ska ställas ut", inte "något gick fel": en
 * kortorder har ingen faktura att kreditera, och en återbetalning som redan
 * har en nota ska inte få en till.
 */
async function contextForRefund(stripeRefundId: string): Promise<RefundContext | null> {
  const result = await getDb().execute(sql`
    select r.order_id, r.amount_minor, r.tax_minor, r.stripe_credit_note_id,
           o.payment_method, o.stripe_session_id
      from refunds r
      join orders o on o.id = r.order_id
     where r.stripe_refund_id = ${stripeRefundId}
     limit 1
  `);
  const row = result.rows[0] as
    | {
        order_id: number;
        amount_minor: number;
        tax_minor: number;
        stripe_credit_note_id: string | null;
        payment_method: string;
        stripe_session_id: string;
      }
    | undefined;
  if (!row) return null;
  if (row.stripe_credit_note_id) return null;
  if (row.payment_method !== 'invoice') return null;
  if (!row.stripe_session_id?.startsWith('in_')) return null;
  return {
    orderId: Number(row.order_id),
    invoiceId: row.stripe_session_id,
    amountMinor: Number(row.amount_minor),
    taxMinor: Number(row.tax_minor),
  };
}

/** En fakturarad och hur mycket av den som ännu går att kreditera. */
type CreditableLine = { id: string; remaining: number };

/**
 * Fakturans rader med det som återstår att kreditera på var och en.
 *
 * Stripe säger inte själv hur mycket en rad har kvar, bara vad den var. En
 * andra återbetalning på samma faktura måste ändå veta det — krediteras en rad
 * över sitt belopp avvisas hela anropet — så tidigare notors rader räknas av.
 */
async function creditableLines(invoiceId: string): Promise<CreditableLine[]> {
  const stripe = getStripe();
  const lines = await stripe.invoices.listLineItems(invoiceId, { limit: 100 });
  const credited = new Map<string, number>();
  const notes = await stripe.creditNotes.list({ invoice: invoiceId, limit: 100 });
  for (const note of notes.data) {
    const noteLines = await stripe.creditNotes.listLineItems(note.id, { limit: 100 });
    for (const line of noteLines.data) {
      const target = line.invoice_line_item;
      if (!target) continue;
      credited.set(target, (credited.get(target) ?? 0) + line.amount);
    }
  }
  return lines.data
    .map(line => ({ id: line.id, remaining: line.amount - (credited.get(line.id) ?? 0) }))
    .filter(line => line.remaining > 0);
}

/**
 * Fördelar ett nettobelopp över fakturaraderna.
 *
 * Proportionellt mot vad varje rad har kvar, och öret som blir över efter
 * avrundningen läggs på den största raden. Beloppet kan inte överstiga det
 * raderna har kvar — den som anropar har redan kontrollerat det mot ordern,
 * men taket ligger här också, eftersom det är Stripes tak.
 *
 * Exporterad för att den går att pröva utan att fråga Stripe.
 */
export function allocateAcrossLines(
  lines: CreditableLine[],
  netMinor: number
): Array<{ id: string; amount: number }> {
  const capacity = lines.reduce((sum, line) => sum + line.remaining, 0);
  const target = Math.min(netMinor, capacity);
  if (target <= 0) return [];
  const shares = lines.map(line => ({
    id: line.id,
    remaining: line.remaining,
    amount: Math.min(line.remaining, Math.floor((target * line.remaining) / capacity)),
  }));
  let left = target - shares.reduce((sum, share) => sum + share.amount, 0);
  // Störst rad först: den tål ett öre till utan att slå i sitt eget tak.
  for (const share of [...shares].sort((a, b) => b.remaining - a.remaining)) {
    if (left <= 0) break;
    const room = Math.min(left, share.remaining - share.amount);
    share.amount += room;
    left -= room;
  }
  return shares.filter(share => share.amount > 0).map(({ id, amount }) => ({ id, amount }));
}

/**
 * Notans rader, och hur mycket av återbetalningen de bär.
 *
 * Här ligger den detalj som gör att den här filen inte kan skrivas ur
 * dokumentationen. Ett platt `amount` på en kreditnota är **inte** ett netto
 * som Stripe lägger moms på — det blir notans hela summa, med noll moms
 * redovisad. En kreditnota utan momsrad är precis det dokumentet inte får
 * vara: den ska visa hur mycket utgående moms som vänds tillbaka. Krediteras
 * raderna i stället räknar Stripe momsen ur radernas egna satser, och notan
 * bär sin momsuppdelning.
 *
 * Summan av de kopplade återbetalningarna måste dessutom gå jämnt upp mot
 * notans totalsumma — Stripe avvisar en nota vars återbetalning är större än
 * den själv. Vår momsdel är proportionell mot orderns faktiska moms medan
 * Stripe räknar om den ur satsen, så de två kan skilja sig ett öre. Därför får
 * förhandsvisningen bestämma: nettot justeras tills totalen ligger på det
 * återbetalade beloppet, och kan den inte nå ända fram läggs notan strax under
 * i stället för över.
 */
async function creditNoteLines(context: RefundContext): Promise<{
  lines: Array<{ type: 'invoice_line_item'; invoice_line_item: string; amount: number }>;
  amountRefunded: number;
} | null> {
  const lines = await creditableLines(context.invoiceId);
  if (!lines.length) return null;
  const shape = (allocation: Array<{ id: string; amount: number }>) =>
    allocation.map(share => ({
      type: 'invoice_line_item' as const,
      invoice_line_item: share.id,
      amount: share.amount,
    }));

  let net = Math.max(1, context.amountMinor - context.taxMinor);
  let best: { lines: ReturnType<typeof shape>; amountRefunded: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allocation = allocateAcrossLines(lines, net);
    if (!allocation.length) break;
    const shaped = shape(allocation);
    const preview = await getStripe().creditNotes.preview({ invoice: context.invoiceId, lines: shaped });
    if (preview.total === context.amountMinor) return { lines: shaped, amountRefunded: preview.total };
    // En nota som är mindre än återbetalningen går att ställa ut; en som är
    // större gör det inte. Den största som ryms sparas medan vi provar vidare.
    if (preview.total < context.amountMinor && (!best || preview.total > best.amountRefunded)) {
      best = { lines: shaped, amountRefunded: preview.total };
    }
    const delta = context.amountMinor - preview.total;
    const adjusted = net + delta;
    if (adjusted < 1 || adjusted === net) break;
    net = adjusted;
  }
  return best;
}

/**
 * Ställer ut kreditnotan för en återbetalning, om ordern betalades mot faktura.
 *
 * Idempotent på två sätt: raden bär notans id när den väl finns, och Stripe-
 * anropet går under en nyckel som bär återbetalningens id. Två webhookar för
 * samma återbetalning kan alltså inte bli två notor.
 *
 * @param status Stripes status på återbetalningen. En som aldrig gick igenom
 * ska inte kreditera något.
 */
export async function ensureCreditNoteForRefund(input: {
  stripeRefundId: string;
  status: string;
  reason?: string | null;
}): Promise<string | null> {
  if (input.status !== 'pending' && input.status !== 'succeeded') return null;
  let context: RefundContext | null = null;
  try {
    context = await contextForRefund(input.stripeRefundId);
    if (!context) return null;

    const invoice = await getStripe().invoices.retrieve(context.invoiceId);
    // En makulerad faktura är redan utan verkan; en obetald har inget att
    // kreditera mot den här återbetalningen. Bara den betalda får en nota.
    if (invoice.status !== 'paid') return null;

    const credited = await creditNoteLines(context);
    // Ingen rad har något kvar att kreditera: fakturan är redan krediterad i
    // sin helhet, och en tom nota är inte en handling.
    if (!credited) return null;

    const creditNote = await getStripe().creditNotes.create(
      {
        invoice: context.invoiceId,
        lines: credited.lines,
        reason: creditNoteReason(input.reason),
        // Pengarna är redan återbetalade. Utan kopplingen hit skulle Stripe
        // tro att beloppet ska tillbaka en gång till.
        refunds: [{ refund: input.stripeRefundId, amount_refunded: credited.amountRefunded }],
        metadata: {
          linnevik_order_id: String(context.orderId),
          linnevik_refund_id: input.stripeRefundId,
        },
      },
      { idempotencyKey: `linnevik_credit_note_${input.stripeRefundId}` }
    );

    await getDb().execute(sql`
      with noted as (
        update refunds
           set stripe_credit_note_id = ${creditNote.id},
               credit_note_number = ${creditNote.number ?? null},
               updated_at = now()
         where stripe_refund_id = ${input.stripeRefundId}
        returning order_id
      )
      insert into order_events (order_id, kind, actor, detail)
      select order_id, 'credit_note.created', 'stripe',
             jsonb_build_object(
               'credit_note_id', ${creditNote.id}::text,
               'credit_note_number', ${creditNote.number ?? null}::text,
               'refund_id', ${input.stripeRefundId}::text,
               'amount_minor', ${creditNote.total}::int
             )
      from noted
    `);
    return creditNote.id;
  } catch (error) {
    console.error('[CreditNote] Could not issue a credit note:', error);
    await raiseAlert({
      kind: 'order.credit_note_failed',
      key: `credit_note:${input.stripeRefundId}`,
      subject: context
        ? `Order ${context.orderId} saknar kreditnota för en återbetald faktura`
        : 'Kreditnota kunde inte ställas ut',
      detail: {
        ...(context ? { order: context.orderId, faktura: context.invoiceId, belopp: context.amountMinor } : {}),
        refund: input.stripeRefundId,
        fel: error instanceof Error ? error.message : 'okänt fel',
        atgard: 'Ställ ut kreditnotan för hand i Stripe — fakturan är utställd och beloppet är återbetalat.',
      },
      ...(context ? { href: `/admin/orders/${context.orderId}` } : {}),
    });
    return null;
  }
}
