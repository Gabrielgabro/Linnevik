/**
 * Creates a Stripe `send_invoice` order for a company customer.
 *
 * This is intentionally separate from /api/checkout: Checkout collects and
 * confirms payment immediately, while an invoice creates a receivable due in
 * 30 days. Both paths use the same server-priced cart and stock reservation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getStripe, stripeConfigured, stripeFailureIsAmbiguous } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { clients, customers } from '@/lib/db/schema';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { GOODS_TAX_CODE, SHIPPING_TAX_CODE, checkoutTaxMode, vatBps, VatConfigurationError } from '@/lib/vat';
import { createPendingOrder, attachSession, abandonPendingOrder, getOrderByCartVersion, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { CartError, getOwnedCart, markOwnedCartCheckoutStarted, validateOwnedCartForCheckout } from '@/lib/cartDb';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { getTranslations } from '@/lib/i18n';
import { claimDiscountCapacity, DiscountError, ensureStripeCoupon, resolveDiscount, resolveShipping, upsertCustomerFromCheckout, usableStripeCustomerId } from '@/lib/commerceOperations';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { CartRuleError } from '@/lib/cartRules';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import {
  INVOICE_COUNTRY,
  normalizeAddress,
  resolveCompanyProfile,
  stripeAddress,
  STRIPE_TAX_ID_TYPE,
  type CompanyProfileGap,
  type PostalAddress,
} from '@/lib/companyProfile';

export const runtime = 'nodejs';

const ALLOWED_COUNTRY = INVOICE_COUNTRY;
const INVOICE_DUE_DAYS = 30;
// An invoice is unsecured 30-day credit against reserved stock, so it is gated
// harder than card checkout: only a signed-in company account can raise one,
// and the number it can raise is capped per IP and per account.
const INVOICE_RATE_PER_IP = 5;
const INVOICE_RATE_PER_ACCOUNT = 5;
const INVOICE_RATE_WINDOW_SECONDS = 24 * 60 * 60;

type AddressInput = {
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  postalCode?: unknown;
};

/** Vilket fält som fattas, sagt så att kunden vet vad hen ska gå och fylla i. */
const PROFILE_GAP_MESSAGES: Record<CompanyProfileGap, string> = {
  email: 'Ditt företagskonto saknar en giltig e-postadress.',
  organizationNumber:
    'Ditt företagskonto saknar ett giltigt organisationsnummer. Uppdatera uppgifterna på Mitt konto först.',
  companyName: 'Företagsnamn krävs för faktura. Fyll i det på Mitt konto eller i formuläret ovan.',
  address:
    'En fullständig faktureringsadress krävs. Fyll i gatuadress, postnummer och ort på Mitt konto eller i formuläret ovan.',
  country: 'Vi kan för närvarande bara fakturera svenska adresser.',
};

type InvoiceBody = {
  cartId?: unknown;
  discountCode?: unknown;
  // E-mail and organisation number come from the signed-in account and are
  // never read from the request; only these two are buyer-adjustable.
  profile?: {
    companyName?: unknown;
    address?: AddressInput;
  };
};

type InvoiceProfile = {
  email: string;
  organizationNumber: string;
  companyName: string;
  address: PostalAddress;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}


type InvoiceAccountData = {
  id: number;
  email: string;
  status: string;
  stripeCustomerId: string | null;
  companyName: string;
  organizationNumber: string;
  address: PostalAddress | null;
};

/**
 * The signed-in account together with the company record it belongs to.
 *
 * The company record is the owning one for the invoice identity; the web
 * account's own columns remain as a fallback for accounts whose company record
 * predates them being filled in.
 */
async function loadInvoiceAccount(): Promise<InvoiceAccountData | null> {
  const session = await getCurrentCustomerFromCookies();
  if (!session) return null;
  const [row] = await getDb()
    .select({ customer: customers, client: clients })
    .from(customers)
    .leftJoin(clients, eq(clients.id, customers.clientId))
    .where(eq(customers.id, Number(session.id)))
    .limit(1);
  if (!row) return null;

  const { customer, client } = row;
  const clientAddress = client
    ? normalizeAddress({
        line1: client.addressLine1,
        line2: client.addressLine2,
        postal_code: client.postalCode,
        city: client.city,
        country: client.country,
      })
    : null;
  return {
    id: customer.id,
    email: customer.email,
    status: customer.status,
    stripeCustomerId: customer.stripeCustomerId,
    companyName: client?.name ?? customer.company ?? '',
    organizationNumber: client?.orgNumber ?? customer.taxId ?? '',
    address: clientAddress ?? normalizeAddress(customer.defaultBillingAddress),
  };
}

/**
 * The invoice recipient is the signed-in account: its e-mail and its
 * organisation number are authoritative and cannot be overridden from the
 * request. The buyer may only adjust the company name and the address printed
 * on this particular invoice.
 *
 * Company name and address fall back to the company record — the one the
 * account page writes and admin curates — so an account that has never been
 * through a card checkout can still be invoiced. Validation is
 * `resolveCompanyProfile`, the same call the account page makes, so this route
 * cannot reject what that page just accepted.
 */
function resolveProfile(body: InvoiceBody, account: InvoiceAccountData): InvoiceProfile {
  const supplied = body.profile;
  const resolved = resolveCompanyProfile({
    email: account.email,
    organizationNumber: account.organizationNumber,
    companyName: text(supplied?.companyName) || account.companyName,
    address: normalizeAddress(supplied?.address) ?? account.address,
  });
  if (!resolved.ok) throw new CartError(PROFILE_GAP_MESSAGES[resolved.missing], 400);
  return resolved.profile;
}

type InvoiceLine = {
  title: string;
  currency: string;
  unitAmountMinor: number;
  quantity: number;
  variantId: number;
};

/**
 * Register the buyer's VAT number as a Stripe tax ID on the customer.
 *
 * The number already travels in `custom_fields` and in metadata, but only a
 * real tax-ID object makes Stripe print it as a VAT registration on the
 * invoice and feed it to automatic tax. Existing ids are checked first: Stripe
 * has no upsert here, and creating the same one twice is an error.
 *
 * A failure is logged and swallowed. This is presentation on a receivable that
 * already carries the number in a custom field, and it is not worth failing an
 * order over — Stripe may reject a structurally valid number that VIES cannot
 * confirm, which says nothing about whether the sale is good.
 */
async function ensureStripeTaxId(customerId: string, organizationNumber: string): Promise<void> {
  try {
    const existing = await getStripe().customers.listTaxIds(customerId, { limit: 100 });
    if (existing.data.some(taxId => taxId.value === organizationNumber)) return;
    await getStripe().customers.createTaxId(
      customerId,
      { type: STRIPE_TAX_ID_TYPE, value: organizationNumber },
      { idempotencyKey: `linnevik_tax_id_${customerId}_${organizationNumber}` }
    );
  } catch (error) {
    console.error('[Invoice] Could not attach the VAT number to the Stripe customer:', error);
  }
}

/**
 * Add the items to a draft invoice and send it.
 *
 * Split out so an attempt interrupted anywhere in here can be replayed by the
 * next request rather than dead-ending on "checkout has already started".
 * Every call is keyed on the order id, so a replay adds nothing twice.
 */
async function finishInvoice(input: {
  invoiceId: string;
  orderId: number;
  customerId: string;
  lines: InvoiceLine[];
  shipping: { name: string; currency: string; amountMinor: number };
  taxMode: Awaited<ReturnType<typeof checkoutTaxMode>>;
}) {
  const itemTaxRates = input.taxMode.kind === 'explicit' ? [input.taxMode.taxRateId] : undefined;
  for (const line of input.lines) {
    await getStripe().invoiceItems.create({
      customer: input.customerId, invoice: input.invoiceId, currency: line.currency, description: line.title,
      amount: line.unitAmountMinor * line.quantity,
      tax_behavior: 'exclusive', tax_code: GOODS_TAX_CODE, ...(itemTaxRates ? { tax_rates: itemTaxRates } : {}),
    }, { idempotencyKey: `linnevik_invoice_item_${input.orderId}_${line.variantId}` });
  }
  if (input.shipping.amountMinor > 0) {
    await getStripe().invoiceItems.create({
      customer: input.customerId, invoice: input.invoiceId, currency: input.shipping.currency,
      description: input.shipping.name, amount: input.shipping.amountMinor,
      tax_behavior: 'exclusive', tax_code: SHIPPING_TAX_CODE, ...(itemTaxRates ? { tax_rates: itemTaxRates } : {}),
    }, { idempotencyKey: `linnevik_invoice_shipping_${input.orderId}` });
  }
  return getStripe().invoices.sendInvoice(
    input.invoiceId,
    {},
    { idempotencyKey: `linnevik_invoice_send_${input.orderId}` }
  );
}

export async function POST(request: NextRequest) {
  if (!ownedCommerceEnabled() || !stripeConfigured()) {
    return NextResponse.json({ error: 'Invoice checkout is not configured.' }, { status: 503 });
  }

  const ipLimit = await checkRateLimit({
    scope: 'invoice',
    identity: clientIp(request.headers),
    limit: INVOICE_RATE_PER_IP,
    windowSeconds: INVOICE_RATE_WINDOW_SECONDS,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'För många fakturaförsök. Försök igen senare.' },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
    );
  }

  const account = await loadInvoiceAccount();
  if (!account) {
    return NextResponse.json(
      { error: 'Logga in med ditt företagskonto för att betala mot faktura.' },
      { status: 401 }
    );
  }
  if (account.status !== 'active') {
    return NextResponse.json(
      { error: 'Ditt företagskonto kan inte betala mot faktura. Kontakta oss.' },
      { status: 403 }
    );
  }

  const accountLimit = await checkRateLimit({
    scope: 'invoice_account',
    identity: String(account.id),
    limit: INVOICE_RATE_PER_ACCOUNT,
    windowSeconds: INVOICE_RATE_WINDOW_SECONDS,
  });
  if (!accountLimit.allowed) {
    return NextResponse.json(
      { error: 'Kontot har nått gränsen för antal fakturor. Försök igen senare.' },
      { status: 429, headers: { 'Retry-After': String(accountLimit.retryAfterSeconds) } }
    );
  }

  let body: InvoiceBody;
  let cartId: string;
  try {
    body = (await request.json()) as InvoiceBody;
    cartId = text(body.cartId);
    if (!/^[0-9a-f-]{36}$/i.test(cartId)) throw new Error('A valid cartId is required.');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 });
  }

  let pendingOrderId: number | null = null;
  let stripeInvoiceId: string | null = null;
  let invoiceSent = false;
  try {
    await releaseExpiredReservations('invoice').catch(error => {
      console.error('[Invoice] Could not release expired reservations:', error);
    });

    const profile = resolveProfile(body, account);
    const currentCart = await getOwnedCart(cartId);
    if (!currentCart) return NextResponse.json({ error: 'Cart not found.' }, { status: 404 });
    if (currentCart.status === 'checkout_started') {
      const existing = await getOrderByCartVersion(cartId, currentCart.version);
      if (existing?.paymentMethod === 'invoice' && existing.stripeSessionId.startsWith('in_')) {
        const invoice = await getStripe().invoices.retrieve(existing.stripeSessionId);
        if (invoice.hosted_invoice_url) {
          return NextResponse.json({ redirectUrl: invoice.hosted_invoice_url, invoiceId: invoice.id, reused: true });
        }
        // A draft has no hosted URL yet: the previous attempt was interrupted
        // between creating the invoice and sending it. Finish that invoice —
        // every remaining call is keyed on the order id and replays cleanly.
        // Answering 409 here left the buyer with a frozen cart and reserved
        // stock until the daily reconciliation swept the draft away.
        if (invoice.status === 'draft' && existing.status === 'pending') {
          const finished = await finishInvoice({
            invoiceId: invoice.id,
            orderId: existing.id,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? '',
            lines: existing.items.map(item => ({
              title: item.title,
              currency: existing.currency,
              unitAmountMinor: item.unitAmountMinor,
              quantity: item.quantity,
              variantId: item.variantId ?? 0,
            })),
            shipping: {
              name: existing.shippingMethod ?? 'Frakt',
              currency: existing.currency,
              amountMinor: existing.shippingMinor,
            },
            taxMode: await checkoutTaxMode(),
          });
          invoiceSent = true;
          return NextResponse.json({
            redirectUrl: getSiteUrl(`${await getServerLanguage()}/checkout/klar?session_id=${finished.id}`),
            invoiceId: finished.id,
            reused: true,
          });
        }
      }
      return NextResponse.json({ error: 'Checkout has already started.' }, { status: 409 });
    }

    const locale = await getServerLanguage();
    const t = getTranslations(locale);
    const ownedCart = await validateOwnedCartForCheckout(cartId);
    const priced = ownedCart.lines.map(line => ({
      variantId: line.variantId,
      sku: line.sku,
      title: `${line.productTitle} (${line.sku})`,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
      currency: line.currency,
      stripeProductId: line.stripeProductId,
    }));
    const subtotalMinor = priced.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0);
    const discount = await resolveDiscount({
      code: text(body.discountCode), subtotalMinor, currency: priced[0].currency, email: profile.email,
    });
    const shipping = await resolveShipping({
      subtotalMinor, discountMinor: discount?.amountMinor, currency: priced[0].currency,
      countryCode: ALLOWED_COUNTRY, freeShipping: discount?.freeShipping,
    });
    if (!shipping) throw new Error('No shipping rule supports this order.');
    const taxMode = await checkoutTaxMode();
    const orderId = await createPendingOrder(priced, locale, { id: ownedCart.id, version: ownedCart.version }, {
      paymentMethod: 'invoice',
      discount: discount ? { id: discount.id, code: discount.code, amountMinor: discount.amountMinor } : null,
      shipping: { id: shipping.id, name: shipping.name, amountMinor: shipping.amountMinor },
      vat: { mode: taxMode.kind, bps: vatBps(taxMode.percent), rateId: taxMode.kind === 'explicit' ? taxMode.taxRateId : null },
    });
    pendingOrderId = orderId;

    // A limited code is only truly claimed once the order holding it exists.
    if (discount) {
      await claimDiscountCapacity({ orderId, discountCodeId: discount.id, email: profile.email });
    }

    const expiresAt = new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
    if (!(await reserveOrderStockStrict(orderId, 'invoice', expiresAt))) {
      await abandonPendingOrder(orderId, 'Insufficient stock before invoice');
      pendingOrderId = null;
      throw new CartError('Lagret ändrades. Kontrollera korgen och försök igen.', 409);
    }

    const customerId = await (async () => {
      // Verified, not trusted: the stored id may name a customer deleted in
      // Stripe or created under a different key, and `customers.update` on a
      // dead id is a hard error that would block invoicing for this account.
      const existing = await usableStripeCustomerId({
        customerId: account.id,
        stripeCustomerId: account.stripeCustomerId,
      });
      if (existing) {
        await getStripe().customers.update(existing, {
          email: profile.email, name: profile.companyName, address: stripeAddress(profile.address),
          metadata: { linnevik_org_no: profile.organizationNumber },
        });
        return existing;
      }
      const customer = await getStripe().customers.create({
        email: profile.email, name: profile.companyName, address: stripeAddress(profile.address),
        metadata: { linnevik_org_no: profile.organizationNumber },
      }, { idempotencyKey: `linnevik_invoice_customer_${profile.email}` });
      return customer.id;
    })();
    await ensureStripeTaxId(customerId, profile.organizationNumber);
    const localCustomerId = await upsertCustomerFromCheckout({
      email: profile.email, stripeCustomerId: customerId, name: profile.companyName,
      shippingAddress: profile.address, billingAddress: profile.address,
      taxId: { type: STRIPE_TAX_ID_TYPE, value: profile.organizationNumber },
    });
    await setPendingOrderCustomerDetails({
      orderId, customerId: localCustomerId, email: profile.email, customerName: profile.companyName,
      shippingAddress: profile.address, billingAddress: profile.address, taxId: profile.organizationNumber,
    });

    const couponId = discount ? await ensureStripeCoupon(discount) : null;
    const invoice = await getStripe().invoices.create({
      customer: customerId,
      currency: priced[0].currency,
      collection_method: 'send_invoice',
      days_until_due: INVOICE_DUE_DAYS,
      auto_advance: false,
      ...(taxMode.kind === 'automatic' ? { automatic_tax: { enabled: true } } : {}),
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      // Organisationsnumret står kvar här även när det också gick in som ett
      // riktigt tax_id: fältet syns oavsett hur Stripe väljer att rendera
      // momsregistreringen. Ordernumret är referensen kundens ekonomiavdelning
      // uppger när de hör av sig.
      custom_fields: [
        { name: 'Organisationsnummer', value: profile.organizationNumber },
        { name: 'Ordernummer', value: String(orderId) },
      ],
      // Betalningsvillkoren är desamma som köpvillkoren på sajten (§4), och
      // står på fakturan därför att det är där kunden faktiskt läser dem.
      footer: [t.terms.section4Text2, t.terms.section4Text3].join(' '),
      metadata: {
        linnevik_order_id: String(orderId),
        linnevik_shipping_minor: String(shipping.amountMinor),
        linnevik_tax_id: profile.organizationNumber,
        linnevik_vat_mode: taxMode.kind,
      },
    }, { idempotencyKey: `linnevik_invoice_${ownedCart.id}_${ownedCart.version}` });
    stripeInvoiceId = invoice.id;
    await attachSession(orderId, invoice.id);
    await markOwnedCartCheckoutStarted(ownedCart.id, ownedCart.version);

    const sent = await finishInvoice({
      invoiceId: invoice.id,
      orderId,
      customerId,
      lines: priced,
      shipping: { name: shipping.name, currency: shipping.currency, amountMinor: shipping.amountMinor },
      taxMode,
    });
    invoiceSent = true;
    return NextResponse.json({
      redirectUrl: getSiteUrl(`${locale}/checkout/klar?session_id=${sent.id}`),
      invoiceId: sent.id,
    });
  } catch (error) {
    console.error('[Invoice] Failed to create invoice:', error);
    const ambiguousStripeFailure = stripeFailureIsAmbiguous(error);
    // A lost response can mean Stripe created/sent the invoice already. Keep
    // the order and stock bound; retry/reconciliation can recover it. Deleting
    // locally and releasing stock here could leave a live receivable behind.
    if (stripeInvoiceId && !invoiceSent && !ambiguousStripeFailure) {
      await getStripe().invoices.del(stripeInvoiceId).catch(deleteError => {
        console.error('[Invoice] Failed to delete unfinished invoice:', deleteError);
      });
    }
    if (pendingOrderId && !invoiceSent && !ambiguousStripeFailure) {
      await abandonPendingOrder(pendingOrderId, 'Invoice creation failed').catch(cleanupError => {
        console.error('[Invoice] Failed to release pending reservation:', cleanupError);
      });
    }
    const message = error instanceof Error ? error.message : 'Invoice checkout failed.';
    if (error instanceof VatConfigurationError) return NextResponse.json({ error: 'Invoice checkout is not configured.' }, { status: 503 });
    if (error instanceof CartError) return NextResponse.json({ error: message }, { status: error.status });
    if (error instanceof CartRuleError) return NextResponse.json({ error: message, code: error.code }, { status: 409 });
    if (error instanceof DiscountError) return NextResponse.json({ error: message, code: `DISCOUNT_${error.reason}` }, { status: 409 });
    if (ambiguousStripeFailure) return NextResponse.json({ error: 'Invoice checkout is temporarily unavailable. Try again.' }, { status: 503 });
    return NextResponse.json({ error: 'Invoice checkout failed.' }, { status: 500 });
  }
}
