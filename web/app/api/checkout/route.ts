/**
 * Skapar en Stripe-kassa ur en korg.
 *
 * Klienten skickar SKU och antal — aldrig belopp. Priset räknas fram på
 * servern i pricing.ts, annars kan vem som helst posta sitt eget pris.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { priceLines, type PriceableRequest } from '@/lib/pricing';
import {
  attachSession,
  createPendingOrder,
  getOrderByCartVersion,
} from '@/lib/ordersDb';
import {
  CartError,
  getOwnedCart,
  markOwnedCartCheckoutStarted,
  validateOwnedCartForCheckout,
} from '@/lib/cartDb';
import { CartRuleError } from '@/lib/cartRules';
import {
  ownedCommerceEnabled,
  stripeIntegrationIdentifier,
  stripeTaxEnabled,
} from '@/lib/commerceConfig';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { ensureStripeCoupon, resolveDiscount, resolveShipping } from '@/lib/commerceOperations';

export const runtime = 'nodejs';

type CheckoutBody = {
  lines?: Array<{ sku?: unknown; shopifyVariantId?: unknown; quantity?: unknown }>;
  cartId?: unknown;
  customerNo?: unknown;
  discountCode?: unknown;
  email?: unknown;
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
  let ownedCartId: string | null = null;
  let customerNo: string | null = null;
  let discountCode: string | null = null;
  let email: string | null = null;
  try {
    const body = (await request.json()) as CheckoutBody;
    ownedCartId = typeof body.cartId === 'string' ? body.cartId.trim() : null;
    if (ownedCartId && !/^[0-9a-f-]{36}$/i.test(ownedCartId)) {
      throw new Error('Invalid cartId.');
    }
    if (ownedCartId && !ownedCommerceEnabled()) {
      return NextResponse.json({ error: 'Owned commerce is not enabled.' }, { status: 503 });
    }
    lines = ownedCartId ? [] : parseLines(body);
    customerNo = typeof body.customerNo === 'string' ? body.customerNo : null;
    discountCode = typeof body.discountCode === 'string' ? body.discountCode : null;
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request.' },
      { status: 400 }
    );
  }

  try {
    const locale = await getServerLanguage();
    const currentCart = ownedCartId ? await getOwnedCart(ownedCartId) : null;
    if (ownedCartId && !currentCart) {
      return NextResponse.json({ error: 'Cart not found.' }, { status: 404 });
    }

    // Ett dubbelklick efter att den första förfrågan hunnit låsa korgen ska
    // återanvända samma Stripe-session, inte ge ett fel eller en extra order.
    if (ownedCartId && currentCart?.status === 'checkout_started') {
      const existing = await getOrderByCartVersion(ownedCartId, currentCart.version);
      if (existing?.stripeSessionId.startsWith('cs_')) {
        const session = await getStripe().checkout.sessions.retrieve(existing.stripeSessionId);
        if (session.url) {
          return NextResponse.json({ url: session.url, sessionId: session.id, reused: true });
        }
      }
      return NextResponse.json({ error: 'Checkout has already started.' }, { status: 409 });
    }

    const ownedCart = ownedCartId ? await validateOwnedCartForCheckout(ownedCartId) : null;
    const priced = ownedCart
      ? ownedCart.lines.map(line => ({
          variantId: line.variantId,
          sku: line.sku,
          title: `${line.productTitle} (${line.sku})`,
          quantity: line.quantity,
          unitAmountMinor: line.unitAmountMinor,
          currency: line.currency,
          stripeProductId: line.stripeProductId,
        }))
      : await priceLines(lines, { customerNo });
    const subtotalMinor = priced.reduce(
      (sum, line) => sum + line.unitAmountMinor * line.quantity,
      0
    );
    const discount = await resolveDiscount({
      code: discountCode,
      subtotalMinor,
      currency: priced[0].currency,
      email,
    });
    const shipping = await resolveShipping({
      subtotalMinor,
      discountMinor: discount?.amountMinor,
      currency: priced[0].currency,
      countryCode: 'SE',
      freeShipping: discount?.freeShipping,
    });
    if (!shipping) throw new Error('No shipping rule supports this order.');
    const stripeCouponId = discount ? await ensureStripeCoupon(discount) : null;
    const orderId = await createPendingOrder(
      priced,
      locale,
      ownedCart ? { id: ownedCart.id, version: ownedCart.version } : undefined,
      {
        customerNo,
        discount: discount
          ? { id: discount.id, code: discount.code, amountMinor: discount.amountMinor }
          : null,
        shipping: { id: shipping.id, name: shipping.name, amountMinor: shipping.amountMinor },
      }
    );

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      // Slås bara på efter en uttrycklig bekräftelse att den svenska
      // registreringen faktiskt har status Collecting i Stripe.
      ...(stripeTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
      integration_identifier: stripeIntegrationIdentifier(),
      locale: locale === 'en' ? 'en' : 'sv',
      currency: priced[0].currency,
      customer_creation: 'always',
      ...(email ? { customer_email: email } : {}),
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
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: shipping.name,
            fixed_amount: { amount: shipping.amountMinor, currency: shipping.currency },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['SE'] },
      billing_address_collection: 'required',
      // Krävs för att kunna dra av moms mot ett giltigt VAT-nummer vid B2B.
      tax_id_collection: { enabled: true },
      // Bara ordernumret. Raderna ligger i vår databas — Stripes metadata
      // rymmer 500 tecken per fält och en stor korg får inte plats.
      metadata: {
        linnevik_order_id: String(orderId),
        ...(customerNo ? { linnevik_customer_no: customerNo } : {}),
        ...(discount ? { linnevik_discount_id: String(discount.id) } : {}),
        linnevik_shipping_rule_id: String(shipping.id),
      },
      success_url: getSiteUrl(`${locale}/checkout/klar?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: getSiteUrl(`${locale}/cart`),
    }, ownedCart
      ? { idempotencyKey: `linnevik_cart_${ownedCart.id}_${ownedCart.version}` }
      : undefined);

    await attachSession(orderId, session.id);
    if (ownedCart) await markOwnedCartCheckoutStarted(ownedCart.id, ownedCart.version);
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Checkout] Failed to create session:', error);
    const message = error instanceof Error ? error.message : 'Checkout failed.';
    if (error instanceof CartError) {
      return NextResponse.json({ error: message }, { status: error.status });
    }
    if (error instanceof CartRuleError) {
      return NextResponse.json({ error: message, code: error.code }, { status: 400 });
    }
    // Okända SKU:er och utsålda varianter är kundfel, inte serverfel.
    const status = /Unknown SKU|not for sale|Quantity|mix currencies/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
