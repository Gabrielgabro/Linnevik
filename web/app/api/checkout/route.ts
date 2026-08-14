/**
 * Skapar en Stripe-kassa ur en korg.
 *
 * Klienten skickar SKU och antal — aldrig belopp. Priset räknas fram på
 * servern i pricing.ts, annars kan vem som helst posta sitt eget pris.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { priceLines, type PriceableRequest } from '@/lib/pricing';
import { attachSession, createPendingOrder } from '@/lib/ordersDb';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';

export const runtime = 'nodejs';

type CheckoutBody = {
  lines?: Array<{ sku?: unknown; shopifyVariantId?: unknown; quantity?: unknown }>;
  customerNo?: unknown;
};

function parseLines(body: CheckoutBody): PriceableRequest[] {
  if (!Array.isArray(body.lines) || !body.lines.length) {
    throw new Error('At least one line is required.');
  }
  if (body.lines.length > 100) throw new Error('Too many lines.');

  return body.lines.map(line => {
    const sku = typeof line.sku === 'string' ? line.sku.trim() : '';
    const shopifyVariantId =
      typeof line.shopifyVariantId === 'string' ? line.shopifyVariantId.trim() : '';
    const quantity = Number(line.quantity);
    if (!sku && !shopifyVariantId) throw new Error('Each line needs a sku or shopifyVariantId.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
      throw new Error(`Invalid quantity for ${sku || shopifyVariantId}.`);
    }
    return { sku: sku || undefined, shopifyVariantId: shopifyVariantId || undefined, quantity };
  });
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 });
  }

  let lines: PriceableRequest[];
  let customerNo: string | null = null;
  try {
    const body = (await request.json()) as CheckoutBody;
    lines = parseLines(body);
    customerNo = typeof body.customerNo === 'string' ? body.customerNo : null;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request.' },
      { status: 400 }
    );
  }

  try {
    const locale = await getServerLanguage();
    const priced = await priceLines(lines, { customerNo });
    const orderId = await createPendingOrder(priced, locale);

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      // Momsen räknas av Stripe Tax mot den svenska registreringen. Beloppen
      // nedan är inklusive moms, därför tax_behavior 'inclusive'.
      automatic_tax: { enabled: true },
      locale: locale === 'en' ? 'en' : 'sv',
      currency: priced[0].currency,
      line_items: priced.map(line => ({
        quantity: line.quantity,
        price_data: {
          currency: line.currency,
          unit_amount: line.unitAmountMinor,
          tax_behavior: 'inclusive',
          // Faller tillbaka på ett namn om produkten inte hunnit synkas till
          // Stripe — kassan ska inte gå sönder för att katalogen släpar.
          ...(line.stripeProductId
            ? { product: line.stripeProductId }
            : { product_data: { name: line.title } }),
        },
      })),
      shipping_address_collection: { allowed_countries: ['SE'] },
      billing_address_collection: 'required',
      // Krävs för att kunna dra av moms mot ett giltigt VAT-nummer vid B2B.
      tax_id_collection: { enabled: true },
      // Bara ordernumret. Raderna ligger i vår databas — Stripes metadata
      // rymmer 500 tecken per fält och en stor korg får inte plats.
      metadata: {
        linnevik_order_id: String(orderId),
        ...(customerNo ? { linnevik_customer_no: customerNo } : {}),
      },
      success_url: getSiteUrl(`${locale}/checkout/klar?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: getSiteUrl(`${locale}/cart`),
    });

    await attachSession(orderId, session.id);
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Checkout] Failed to create session:', error);
    const message = error instanceof Error ? error.message : 'Checkout failed.';
    // Okända SKU:er och utsålda varianter är kundfel, inte serverfel.
    const status = /Unknown SKU|not for sale|Quantity|mix currencies/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
