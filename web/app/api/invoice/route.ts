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
import { customers } from '@/lib/db/schema';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { GOODS_TAX_CODE, SHIPPING_TAX_CODE, checkoutTaxMode, vatBps, VatConfigurationError } from '@/lib/vat';
import { createPendingOrder, attachSession, abandonPendingOrder, getOrderByCartVersion, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { CartError, getOwnedCart, markOwnedCartCheckoutStarted, validateOwnedCartForCheckout } from '@/lib/cartDb';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { DiscountError, ensureStripeCoupon, resolveDiscount, resolveShipping, upsertCustomerFromCheckout } from '@/lib/commerceOperations';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { CartRuleError } from '@/lib/cartRules';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import {
  isValidCompanyRegistrationNumber,
  normalizeCompanyRegistrationNumber,
} from '@/lib/companyRegistration';

export const runtime = 'nodejs';

const ALLOWED_COUNTRY = 'SE';
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
  address: Record<string, string | null>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readAddress(input: AddressInput | undefined): Record<string, string | null> | null {
  const line1 = text(input?.line1);
  const city = text(input?.city);
  const postalCode = text(input?.postalCode);
  if (!line1 || !city || !postalCode) return null;
  return {
    line1,
    line2: text(input?.line2) || null,
    city,
    postal_code: postalCode,
    state: null,
    country: ALLOWED_COUNTRY,
  };
}

type InvoiceAccount = Awaited<ReturnType<typeof loadInvoiceAccount>>;

async function loadInvoiceAccount() {
  const session = await getCurrentCustomerFromCookies();
  if (!session) return null;
  const [customer] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.id, Number(session.id)))
    .limit(1);
  return customer ?? null;
}

/**
 * The invoice recipient is the signed-in account: its e-mail and its
 * organisation number are authoritative and cannot be overridden from the
 * request. The buyer may only adjust the company name and the address printed
 * on this particular invoice.
 */
function resolveProfile(body: InvoiceBody, account: NonNullable<InvoiceAccount>): InvoiceProfile {
  const supplied = body.profile;
  const email = text(account.email).toLowerCase();
  const organizationNumber = normalizeCompanyRegistrationNumber(account.taxId);
  const companyName = text(supplied?.companyName) || text(account.company);
  const storedAddress = account.defaultBillingAddress as Record<string, string | null> | null | undefined;
  const address = readAddress(supplied?.address) ?? storedAddress ?? null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CartError('Ditt företagskonto saknar en giltig e-postadress.', 400);
  if (!isValidCompanyRegistrationNumber(organizationNumber)) {
    throw new CartError('Ditt företagskonto saknar ett giltigt organisationsnummer. Uppdatera kontot först.', 400);
  }
  if (!companyName) throw new CartError('Företagsnamn krävs för faktura.', 400);
  if (!address?.line1 || !address?.city || !address?.postal_code || address.country !== ALLOWED_COUNTRY) {
    throw new CartError('En svensk faktura- och leveransadress krävs för faktura.', 400);
  }
  return { email, organizationNumber, companyName, address };
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
      }
      return NextResponse.json({ error: 'Checkout has already started.' }, { status: 409 });
    }

    const locale = await getServerLanguage();
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

    const expiresAt = new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
    if (!(await reserveOrderStockStrict(orderId, 'invoice', expiresAt))) {
      await abandonPendingOrder(orderId, 'Insufficient stock before invoice');
      pendingOrderId = null;
      throw new CartError('Lagret ändrades. Kontrollera korgen och försök igen.', 409);
    }

    const customerId = await (async () => {
      if (account.stripeCustomerId) {
        await getStripe().customers.update(account.stripeCustomerId, {
          email: profile.email, name: profile.companyName, address: profile.address,
          metadata: { linnevik_org_no: profile.organizationNumber },
        });
        return account.stripeCustomerId;
      }
      const customer = await getStripe().customers.create({
        email: profile.email, name: profile.companyName, address: profile.address,
        metadata: { linnevik_org_no: profile.organizationNumber },
      }, { idempotencyKey: `linnevik_invoice_customer_${profile.email}` });
      return customer.id;
    })();
    const localCustomerId = await upsertCustomerFromCheckout({
      email: profile.email, stripeCustomerId: customerId, name: profile.companyName,
      shippingAddress: profile.address, billingAddress: profile.address,
      taxId: { type: 'org_no', value: profile.organizationNumber },
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
      custom_fields: [{ name: 'Organisationsnummer', value: profile.organizationNumber }],
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

    const itemTaxRates = taxMode.kind === 'explicit' ? [taxMode.taxRateId] : undefined;
    for (const line of priced) {
      await getStripe().invoiceItems.create({
        customer: customerId, invoice: invoice.id, currency: line.currency, description: line.title,
        amount: line.unitAmountMinor * line.quantity,
        tax_behavior: 'exclusive', tax_code: GOODS_TAX_CODE, ...(itemTaxRates ? { tax_rates: itemTaxRates } : {}),
      }, { idempotencyKey: `linnevik_invoice_item_${orderId}_${line.variantId}` });
    }
    if (shipping.amountMinor > 0) {
      await getStripe().invoiceItems.create({
        customer: customerId, invoice: invoice.id, currency: shipping.currency, description: shipping.name,
        amount: shipping.amountMinor,
        tax_behavior: 'exclusive', tax_code: SHIPPING_TAX_CODE, ...(itemTaxRates ? { tax_rates: itemTaxRates } : {}),
      }, { idempotencyKey: `linnevik_invoice_shipping_${orderId}` });
    }
    const sent = await getStripe().invoices.sendInvoice(
      invoice.id,
      {},
      { idempotencyKey: `linnevik_invoice_send_${orderId}` }
    );
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
    if (error instanceof DiscountError) return NextResponse.json({ error: message, code: 'DISCOUNT_REJECTED' }, { status: 409 });
    if (ambiguousStripeFailure) return NextResponse.json({ error: 'Invoice checkout is temporarily unavailable. Try again.' }, { status: 503 });
    return NextResponse.json({ error: 'Invoice checkout failed.' }, { status: 500 });
  }
}
