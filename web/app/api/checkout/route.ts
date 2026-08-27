/**
 * Skapar en Stripe-kassa ur en korg.
 *
 * Klienten skickar bara vårt korg-id — aldrig rader eller belopp. Korgen,
 * orderbarheten och priset läses om på servern innan Stripe öppnas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, stripeConfigured, stripeFailureIsAmbiguous } from '@/lib/stripe';
import {
  assertEveryAmountIsTaxed,
  checkoutTaxMode,
  GOODS_TAX_CODE,
  SHIPPING_TAX_CODE,
  vatBps,
  VatConfigurationError,
} from '@/lib/vat';
import {
  attachSession,
  abandonPendingOrder,
  createPendingOrder,
  getOrderByCartVersion,
} from '@/lib/ordersDb';
import {
  CartError,
  getOwnedCart,
  markOwnedCartCheckoutStarted,
  validateOwnedCartForCheckout,
} from '@/lib/cartDb';
import {
  checkoutReservationMinutes,
  ownedCommerceEnabled,
  stripeIntegrationIdentifier,
} from '@/lib/commerceConfig';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { DiscountError, ensureStripeCoupon, resolveDiscount, resolveShipping } from '@/lib/commerceOperations';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { CartRuleError } from '@/lib/cartRules';
import { parseCheckoutInput } from '@/lib/checkoutInput';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';

export const runtime = 'nodejs';

/**
 * Sverige och inget annat. En uttrycklig momssats kan varken hantera omvänd
 * skattskyldighet mot ett EU-VAT-nummer eller ett annat lands sats, så en
 * utvidgning hit måste gå hand i hand med att Stripe Tax slås på —
 * `assertEveryAmountIsTaxed` stoppar kassan om någon ändrar bara det ena.
 */
const ALLOWED_SHIPPING_COUNTRIES = ['SE'] as const satisfies readonly ['SE'];

const CHECKOUT_RATE_PER_IP = 20;
const CHECKOUT_RATE_PER_CART = 8;
const CHECKOUT_RATE_WINDOW_SECONDS = 60 * 60;

export async function POST(request: NextRequest) {
  if (!ownedCommerceEnabled() || !stripeConfigured()) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 });
  }

  let ownedCartId: string;
  let discountCode: string | null;
  let email: string | null;
  try {
    const parsed = parseCheckoutInput(await request.json());
    ownedCartId = parsed.cartId;
    discountCode = parsed.discountCode;
    email = parsed.email;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request.' },
      { status: 400 }
    );
  }

  const [ipLimit, cartLimit] = await Promise.all([
    checkRateLimit({
      scope: 'checkout',
      identity: clientIp(request.headers),
      limit: CHECKOUT_RATE_PER_IP,
      windowSeconds: CHECKOUT_RATE_WINDOW_SECONDS,
    }),
    checkRateLimit({
      scope: 'checkout_cart',
      identity: ownedCartId,
      limit: CHECKOUT_RATE_PER_CART,
      windowSeconds: CHECKOUT_RATE_WINDOW_SECONDS,
    }),
  ]);
  if (!ipLimit.allowed || !cartLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, cartLimit.retryAfterSeconds);
    return NextResponse.json(
      { error: 'Too many checkout attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let pendingOrderId: number | null = null;
  let stripeSessionCreated = false;
  try {
    // Utgångna reservationer släpps här, i det ögonblick lagret faktiskt
    // betyder något för någon. Förr gjorde bara webhooken för en utgången
    // session det, plus avstämningen 03:00 — tappades webhooken kunde en
    // övergiven kassa hålla riktiga enheter bundna resten av dygnet, och nästa
    // kund möta "slut i lager" på något som stod på hyllan. Satsen är en enda
    // fråga mot ett index och kostar ingenting när det inte finns något att
    // släppa. Fel här får inte fälla kassan: det värsta som händer är att
    // reservationen ligger kvar tills cronen tar den.
    try {
      await releaseExpiredReservations('checkout');
    } catch (error) {
      console.error('[Checkout] Kunde inte släppa utgångna reservationer:', error);
    }

    const locale = await getServerLanguage();
    const account = await getCurrentCustomerFromCookies();
    // Only an authenticated account may select an existing Stripe Customer or
    // CRM customer number. A request body is not proof of either identity.
    const checkoutEmail = account?.email.trim().toLowerCase() || email;
    const customerNo = account?.customerNo ?? null;
    const currentCart = await getOwnedCart(ownedCartId);
    if (!currentCart) {
      return NextResponse.json({ error: 'Cart not found.' }, { status: 404 });
    }

    // Ett dubbelklick efter att den första förfrågan hunnit låsa korgen ska
    // återanvända samma Stripe-session, inte ge ett fel eller en extra order.
    if (currentCart.status === 'checkout_started') {
      const existing = await getOrderByCartVersion(ownedCartId, currentCart.version);
      if (existing?.stripeSessionId.startsWith('cs_')) {
        const session = await getStripe().checkout.sessions.retrieve(existing.stripeSessionId);
        if (session.status === 'open' && session.url) {
          return NextResponse.json({ url: session.url, sessionId: session.id, reused: true });
        }
      }
      return NextResponse.json({ error: 'Checkout has already started.' }, { status: 409 });
    }

    const ownedCart = await validateOwnedCartForCheckout(ownedCartId);
    const priced = ownedCart.lines.map(line => ({
      variantId: line.variantId,
      sku: line.sku,
      title: `${line.productTitle} (${line.sku})`,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
      currency: line.currency,
      stripeProductId: line.stripeProductId,
    }));
    const subtotalMinor = priced.reduce(
      (sum, line) => sum + line.unitAmountMinor * line.quantity,
      0
    );
    const discount = await resolveDiscount({
      code: discountCode,
      subtotalMinor,
      currency: priced[0].currency,
      email: checkoutEmail,
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
    // Läget avgörs före ordern skapas: ordern ska bära hur momsen räknades,
    // inte bara hur mycket den blev.
    const taxMode = await checkoutTaxMode();
    const lineTaxRates = taxMode.kind === 'explicit' ? [taxMode.taxRateId] : undefined;
    const orderId = await createPendingOrder(
      priced,
      locale,
      { id: ownedCart.id, version: ownedCart.version },
      {
        customerNo,
        discount: discount
          ? { id: discount.id, code: discount.code, amountMinor: discount.amountMinor }
          : null,
        shipping: { id: shipping.id, name: shipping.name, amountMinor: shipping.amountMinor },
        vat: { mode: taxMode.kind, bps: vatBps(taxMode.percent), rateId: taxMode.kind === 'explicit' ? taxMode.taxRateId : null },
      }
    );
    pendingOrderId = orderId;

    // Fail-closed stock policy: every tracked line is reserved before Stripe
    // can collect payment. Stripe and the reservation share the same expiry.
    const checkoutExpiresAt = new Date(
      Date.now() + checkoutReservationMinutes() * 60 * 1000
    );
    const reserved = await reserveOrderStockStrict(
      orderId,
      'checkout',
      checkoutExpiresAt
    );
    if (!reserved) {
      await abandonPendingOrder(orderId, 'Insufficient stock before checkout');
      pendingOrderId = null;
      throw new CartError('Lagret ändrades. Kontrollera korgen och försök igen.', 409);
    }

    // Priserna på sajten är exklusive moms, så momsen läggs på här. Stripe Tax
    // sköter det när den svenska registreringen är bekräftad *och* finns på
    // kontot; dessförinnan hängs en uttrycklig momssats på raderna. Alternativet
    // — att skicka beloppen som `inclusive` utan automatisk moms, vilket var det
    // som gjordes — innebar att det utsatta "exkl. moms"-priset var allt kunden
    // betalade, och att momsen åts ur marginalen.

    const productLineItems = priced.map(line => ({
      quantity: line.quantity,
      ...(lineTaxRates ? { tax_rates: lineTaxRates } : {}),
      price_data: {
        currency: line.currency,
        unit_amount: line.unitAmountMinor,
        tax_behavior: 'exclusive' as const,
        // Faller tillbaka på ett namn om produkten inte hunnit synkas till
        // Stripe — kassan ska inte gå sönder för att katalogen släpar.
        ...(line.stripeProductId
          ? { product: line.stripeProductId }
          : { product_data: { name: line.title, tax_code: GOODS_TAX_CODE } }),
      },
    }));

    // Frakten.
    //
    // Stripe tar inte emot en uttrycklig momssats på en fraktrad, bara på
    // orderrader. Med en avgift på en fraktrad och Stripe Tax avslaget hade
    // frakten alltså gått ut obeskattad — tyst, och rakt ur marginalen. Därför
    // skickas en fraktavgift som en vanlig orderrad så länge satsen sätts för
    // hand. Ordern behåller sin egen uppdelning: raden är frakt hos oss även
    // när Stripe ser den som en artikel, och metadatan nedan låter webhooken
    // räkna tillbaka delarna.
    const shippingAsLineItem = taxMode.kind === 'explicit' && shipping.amountMinor > 0;
    const lineItems = shippingAsLineItem
      ? [
          ...productLineItems,
          {
            quantity: 1,
            ...(lineTaxRates ? { tax_rates: lineTaxRates } : {}),
            price_data: {
              currency: shipping.currency,
              unit_amount: shipping.amountMinor,
              tax_behavior: 'exclusive' as const,
              product_data: { name: shipping.name, tax_code: SHIPPING_TAX_CODE },
            },
          },
        ]
      : productLineItems;
    const shippingOptions = shippingAsLineItem
      ? []
      : [
          {
            shipping_rate_data: {
              type: 'fixed_amount' as const,
              display_name: shipping.name,
              fixed_amount: { amount: shipping.amountMinor, currency: shipping.currency },
              // Fraktbeloppet är också exklusive moms. Med Stripe Tax påslagen
              // momsbeläggs raden av skattekoden; utan den är beloppet noll,
              // och noll kronor kan inte bära fel moms.
              tax_behavior: 'exclusive' as const,
              tax_code: SHIPPING_TAX_CODE,
            },
          },
        ];

    // Sista spärren: inget belopp kunden debiteras får gå till Stripe utan att
    // vi bett om moms på det. Kastar hellre än att sälja obeskattat.
    assertEveryAmountIsTaxed({
      mode: taxMode,
      lineItems,
      shippingOptions,
      allowedCountries: [...ALLOWED_SHIPPING_COUNTRIES],
    });

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      // Slås bara på efter en uttrycklig bekräftelse att den svenska
      // registreringen faktiskt har status Collecting i Stripe.
      ...(taxMode.kind === 'automatic' ? { automatic_tax: { enabled: true } } : {}),
      integration_identifier: stripeIntegrationIdentifier(),
      locale: locale === 'en' ? 'en' : 'sv',
      currency: priced[0].currency,
      expires_at: Math.floor(checkoutExpiresAt.getTime() / 1000),
      ...(account?.stripeCustomerId
        ? {
            customer: account.stripeCustomerId,
            customer_update: {
              address: 'auto' as const,
              name: 'auto' as const,
              shipping: 'auto' as const,
            },
          }
        : {
            customer_creation: 'always' as const,
            ...(checkoutEmail ? { customer_email: checkoutEmail } : {}),
          }),
      line_items: lineItems,
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      ...(shippingOptions.length ? { shipping_options: shippingOptions } : {}),
      shipping_address_collection: { allowed_countries: [...ALLOWED_SHIPPING_COUNTRIES] },
      billing_address_collection: 'required',
      // Linnevik säljer bara till företag. `required: 'if_supported'` gör
      // org-/VAT-numret obligatoriskt där Stripe stödjer formatet — svenska
      // köpare gör det. Utan det är fältet frivilligt (Stripes standard är
      // `never`), och en köpare som hoppade över det lämnade oss en order som
      // inte går att fakturera enligt kraven på en momsfaktura.
      //
      // Numret ändrar däremot ingen sats vid inrikes försäljning: omvänd
      // skattskyldighet gäller inte svensk varuförsäljning mellan svenska
      // företag. Det är köparen som drar av momsen, inte vi som slipper ta ut
      // den. Numret behövs för fakturan, inte för uträkningen.
      tax_id_collection: { enabled: true, required: 'if_supported' },
      // Bara ordernumret och det webhooken inte kan räkna ut själv. Raderna
      // ligger i vår databas — Stripes metadata rymmer 500 tecken per fält och
      // en stor korg får inte plats.
      metadata: {
        linnevik_order_id: String(orderId),
        ...(customerNo ? { linnevik_customer_no: customerNo } : {}),
        ...(discount ? { linnevik_discount_id: String(discount.id) } : {}),
        linnevik_shipping_rule_id: String(shipping.id),
        // Ligger frakten som en orderrad rapporterar Stripe noll frakt, och
        // webhooken skulle annars räkna in den i varusumman.
        linnevik_shipping_minor: String(shipping.amountMinor),
        linnevik_shipping_as_line_item: shippingAsLineItem ? 'true' : 'false',
        linnevik_vat_mode: taxMode.kind,
      },
      success_url: getSiteUrl(`${locale}/checkout/klar?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: getSiteUrl(`${locale}/cart`),
    }, { idempotencyKey: `linnevik_cart_${ownedCart.id}_${ownedCart.version}` });
    stripeSessionCreated = true;

    await attachSession(orderId, session.id);
    if (ownedCart) await markOwnedCartCheckoutStarted(ownedCart.id, ownedCart.version);
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Checkout] Failed to create session:', error);
    const ambiguousStripeFailure = stripeFailureIsAmbiguous(error);
    // A session that exists must keep its reservation: the customer may
    // already have received its URL and metadata reconciliation can repair the
    // missing link. A connection/5xx failure is also ambiguous: Stripe may
    // have created the idempotent Session before the response was lost, so a
    // retry must keep the same order version and reservation.
    if (pendingOrderId && !stripeSessionCreated && !ambiguousStripeFailure) {
      try {
        await abandonPendingOrder(pendingOrderId, 'Checkout session creation failed');
      } catch (cleanupError) {
        console.error('[Checkout] Failed to release pending reservation:', cleanupError);
      }
    }
    const message = error instanceof Error ? error.message : 'Checkout failed.';
    // Fel i vår egen momsuppsättning. Hellre en stängd kassa än en order utan
    // moms — och 503 så att det syns som ett driftfel, inte ett kundfel.
    if (error instanceof VatConfigurationError) {
      return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 });
    }
    if (error instanceof CartError) {
      return NextResponse.json({ error: message }, { status: error.status });
    }
    if (error instanceof CartRuleError) {
      return NextResponse.json({ error: message, code: error.code }, { status: 409 });
    }
    if (error instanceof DiscountError) {
      return NextResponse.json({ error: message, code: 'DISCOUNT_REJECTED' }, { status: 409 });
    }
    if (ambiguousStripeFailure) {
      return NextResponse.json({ error: 'Checkout is temporarily unavailable. Try again.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
