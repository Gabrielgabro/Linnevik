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
import { ensureStripeProducts } from '@/lib/stripeCatalog';
import {
  createInvoiceDraft,
  finishInvoice,
  INVOICE_DUE_DAYS,
  stripeProductIdsForVariants,
  syncStripeInvoiceCustomer,
  type InvoiceProfile,
} from '@/lib/invoiceIssue';
import { getDb } from '@/lib/db';
import { clients, customers } from '@/lib/db/schema';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { checkoutTaxMode, vatBps, VatConfigurationError } from '@/lib/vat';
import { createPendingOrder, attachSession, abandonPendingOrder, getOrderByCartVersion, PaymentMethodConflictError, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { CartError, getOwnedCart, markOwnedCartCheckoutStarted, validateOwnedCartForCheckout } from '@/lib/cartDb';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { raiseAlert } from '@/lib/opsAlerts';
import { InvoicePaymentConfigError, invoicePaymentDetails } from '@/lib/invoicePayment';
import { claimDiscountCapacity, DiscountError, ensureStripeCoupon, resolveDiscount, resolveShipping, upsertCustomerFromCheckout } from '@/lib/commerceOperations';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { CartRuleError } from '@/lib/cartRules';
import { isSwedishSoleTrader } from '@/lib/companyRegistration';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import {
  INVOICE_COUNTRY,
  normalizeAddress,
  resolveCompanyProfile,
  STRIPE_TAX_ID_TYPE,
  type CompanyProfileGap,
  type PostalAddress,
} from '@/lib/companyProfile';

export const runtime = 'nodejs';

const ALLOWED_COUNTRY = INVOICE_COUNTRY;
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
  companyName:
    'Fakturan ställs ut på företaget, inte på en person. Fyll i firmanamnet på Mitt konto eller i formuläret ovan; kontaktpersonen står som "Er referens".',
  address:
    'En fullständig faktureringsadress krävs. Fyll i gatuadress, postnummer och ort på Mitt konto eller i formuläret ovan.',
  country: 'Vi kan för närvarande bara fakturera svenska adresser.',
};

/** Samma luckor som ovan, men som stabila koder gränssnittet kan översätta. */
const PROFILE_GAP_CODES: Record<CompanyProfileGap, string> = {
  email: 'PROFILE_EMAIL_MISSING',
  organizationNumber: 'PROFILE_ORG_NUMBER_MISSING',
  companyName: 'PROFILE_COMPANY_MISSING',
  address: 'PROFILE_ADDRESS_MISSING',
  country: 'PROFILE_COUNTRY_UNSUPPORTED',
};

type InvoiceBody = {
  cartId?: unknown;
  discountCode?: unknown;
  // E-mail and organisation number come from the signed-in account and are
  // never read from the request; only these two are buyer-adjustable.
  profile?: {
    companyName?: unknown;
    address?: AddressInput;
    /** "Er referens" och köparens eget inköpsordernummer/kostnadsställe. */
    reference?: unknown;
    purchaseOrder?: unknown;
  };
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Ett fel köparen kan läsa på sitt eget språk.
 *
 * `error` är loggens text och står kvar på svenska; `code` är det stabila som
 * gränssnittet slår upp i sina översättningar. Utan koden visades den svenska
 * serversträngen rakt av för en engelsk köpare — se `messageForCode`.
 */
function fail(code: string, error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error, code }, { status, ...(headers ? { headers } : {}) });
}

/** Ett avbrott med en färdig kod, kastat inifrån fakturaflödet. */
class InvoiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'InvoiceError';
  }
}


type InvoiceAccountData = {
  id: number;
  email: string;
  status: string;
  stripeCustomerId: string | null;
  companyName: string;
  organizationNumber: string;
  address: PostalAddress | null;
  /** Kontaktpersonen på kontot. Förval för "Er referens" på fakturan. */
  contactName: string;
  /**
   * Företagets fakturaadress för e-post, när kundregistret har en.
   *
   * Stora köpare tar emot fakturor på en delad brevlåda hos ekonomi, inte på
   * den anställdas adress. Kontots egen adress är fortfarande identiteten —
   * det är den ordern, rabattspärrarna och kundposten hänger på — men brevet
   * med fakturan går hit.
   */
  invoiceEmail: string | null;
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
    contactName: [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim(),
    invoiceEmail: client?.invoiceEmail?.trim() || null,
  };
}

/**
 * "Er referens" på fakturan.
 *
 * En svensk leverantörsfaktura ställs ut på ett företag men hanteras av en
 * människa, och det är referensen köparens ekonomiavdelning sorterar på — utan
 * den blir fakturan liggande. Personen på kontot är förvalet; köparen får
 * skriva om den för den här ordern, eftersom den som beställer inte alltid är
 * den som attesterar.
 *
 * Inköpsordernumret läggs i samma fält i stället för ett eget: Stripe tar emot
 * högst fyra `custom_fields` på en faktura, och organisationsnummer, momsnummer
 * och vårt ordernummer upptar redan tre.
 */
const REFERENCE_MAX = 140;

/** Samma namn så när som på versaler och mellanslag. */
function sameName(a: string, b: string): boolean {
  const key = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return key(a) !== '' && key(a) === key(b);
}

function invoiceReference(body: InvoiceBody, account: InvoiceAccountData): string | null {
  const reference = text(body.profile?.reference) || account.contactName;
  const purchaseOrder = text(body.profile?.purchaseOrder);
  const parts = [reference, purchaseOrder ? `Ert ordernr ${purchaseOrder}` : ''].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(' · ').slice(0, REFERENCE_MAX);
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
  const companyName = text(supplied?.companyName) || account.companyName;
  // Mottagaren är organisationen — noden org-numret pekar ut — och människan
  // står som "Er referens" längre ned. Ett webbkonto som skapades i kassan utan
  // firmanamn fick beställarens eget namn som kundnamn (fillClientProfileGaps),
  // och ställs fakturan ut på det får köparens ekonomiavdelning en faktura
  // adresserad till en anställd. En enskild firma undantas: den heter faktiskt
  // sin innehavare, och då är personnamnet rätt mottagare.
  if (
    companyName &&
    sameName(companyName, account.contactName) &&
    !isSwedishSoleTrader(account.organizationNumber)
  ) {
    throw new InvoiceError(
      PROFILE_GAP_CODES.companyName,
      PROFILE_GAP_MESSAGES.companyName,
      400
    );
  }
  const resolved = resolveCompanyProfile({
    email: account.email,
    organizationNumber: account.organizationNumber,
    companyName,
    address: normalizeAddress(supplied?.address) ?? account.address,
  });
  if (!resolved.ok) {
    throw new InvoiceError(PROFILE_GAP_CODES[resolved.missing], PROFILE_GAP_MESSAGES[resolved.missing], 400);
  }
  return resolved.profile;
}

export async function POST(request: NextRequest) {
  if (!ownedCommerceEnabled() || !stripeConfigured()) {
    return fail('NOT_CONFIGURED', 'Invoice checkout is not configured.', 503);
  }

  const ipLimit = await checkRateLimit({
    scope: 'invoice',
    identity: clientIp(request.headers),
    limit: INVOICE_RATE_PER_IP,
    windowSeconds: INVOICE_RATE_WINDOW_SECONDS,
  });
  if (!ipLimit.allowed) {
    return fail('RATE_LIMITED', 'För många fakturaförsök. Försök igen senare.', 429, {
      'Retry-After': String(ipLimit.retryAfterSeconds),
    });
  }

  const account = await loadInvoiceAccount();
  if (!account) {
    return fail('SIGN_IN_REQUIRED', 'Logga in med ditt företagskonto för att betala mot faktura.', 401);
  }
  if (account.status !== 'active') {
    return fail('ACCOUNT_INACTIVE', 'Ditt företagskonto kan inte betala mot faktura. Kontakta oss.', 403);
  }

  const accountLimit = await checkRateLimit({
    scope: 'invoice_account',
    identity: String(account.id),
    limit: INVOICE_RATE_PER_ACCOUNT,
    windowSeconds: INVOICE_RATE_WINDOW_SECONDS,
  });
  if (!accountLimit.allowed) {
    return fail('RATE_LIMITED', 'Kontot har nått gränsen för antal fakturor. Försök igen senare.', 429, {
      'Retry-After': String(accountLimit.retryAfterSeconds),
    });
  }

  let body: InvoiceBody;
  let cartId: string;
  try {
    body = (await request.json()) as InvoiceBody;
    cartId = text(body.cartId);
    if (!/^[0-9a-f-]{36}$/i.test(cartId)) throw new Error('A valid cartId is required.');
  } catch (error) {
    return fail('INVALID_REQUEST', error instanceof Error ? error.message : 'Invalid request.', 400);
  }

  let pendingOrderId: number | null = null;
  let stripeInvoiceId: string | null = null;
  let invoiceSent = false;
  try {
    // Först av allt, före order och reservation: en faktura utan bankgiro
    // eller konto går inte att betala för en svensk företagskund, och ska då
    // inte gå i väg alls. Kastar InvoicePaymentConfigError, som blir 503.
    const payment = invoicePaymentDetails();

    await releaseExpiredReservations('invoice').catch(error => {
      console.error('[Invoice] Could not release expired reservations:', error);
    });

    const profile = resolveProfile(body, account);
    const currentCart = await getOwnedCart(cartId);
    if (!currentCart) return fail('CART_NOT_FOUND', 'Cart not found.', 404);
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
        // Varje rad måste kunna peka ut sin variant: idempotensnyckeln bakom
        // priset bär variantnumret, och en rad vars variant hunnit tas bort
        // kan inte spela om nyckeln första försöket använde. Då är 409 rätt
        // svar — avstämningen städar bort utkastet och släpper lagret.
        const recoverable = existing.items.every(item => item.variantId !== null);
        if (invoice.status === 'draft' && existing.status === 'pending' && recoverable) {
          const productIds = await stripeProductIdsForVariants(
            existing.items.map(item => item.variantId as number)
          );
          const finished = await finishInvoice({
            invoiceId: invoice.id,
            orderId: existing.id,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? '',
            lines: existing.items.map(item => ({
              title: item.title,
              currency: existing.currency,
              unitAmountMinor: item.unitAmountMinor,
              quantity: item.quantity,
              variantId: item.variantId as number,
              stripeProductId: productIds.get(item.variantId as number) ?? null,
            })),
            shipping: {
              name: existing.shippingMethod ?? 'Frakt',
              currency: existing.currency,
              amountMinor: existing.shippingMinor,
            },
            taxMode: await checkoutTaxMode(),
            notifyEmail: account.invoiceEmail,
            payment,
          });
          invoiceSent = true;
          return NextResponse.json({
            redirectUrl: getSiteUrl(`${await getServerLanguage()}/checkout/klar?session_id=${finished.id}`),
            invoiceId: finished.id,
            reused: true,
          });
        }
      }
      return fail('CHECKOUT_IN_PROGRESS', 'Checkout has already started.', 409);
    }

    const locale = await getServerLanguage();
    const ownedCart = await validateOwnedCartForCheckout(cartId);
    // Samma spärr som kortkassan: varan ska finnas i Stripe i nyckelns läge.
    const stripeProductIds = await ensureStripeProducts(
      ownedCart.lines.map(line => line.productHandle)
    );
    const priced = ownedCart.lines.map(line => ({
      variantId: line.variantId,
      sku: line.sku,
      title: `${line.productTitle} (${line.sku})`,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
      currency: line.currency,
      stripeProductId: stripeProductIds.get(line.productHandle) ?? null,
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
      throw new InvoiceError('STOCK_CHANGED', 'Lagret ändrades. Kontrollera korgen och försök igen.', 409);
    }

    const customerId = await syncStripeInvoiceCustomer({
      localCustomerId: account.id,
      stripeCustomerId: account.stripeCustomerId,
      profile,
    });
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
    const reference = invoiceReference(body, account);
    const invoice = await createInvoiceDraft({
      orderId,
      customerId,
      currency: priced[0].currency,
      profile,
      reference,
      payment,
      taxMode,
      couponId,
      shippingMinor: shipping.amountMinor,
      daysUntilDue: INVOICE_DUE_DAYS,
      idempotencyKey: `linnevik_invoice_${ownedCart.id}_${ownedCart.version}`,
    });
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
      notifyEmail: account.invoiceEmail,
      payment,
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
    if (error instanceof VatConfigurationError) return fail('NOT_CONFIGURED', 'Invoice checkout is not configured.', 503);
    if (error instanceof InvoicePaymentConfigError) {
      // Ett konfigurationsfel stoppar varje fakturaköp tills någon rättar det,
      // så det ska inte bara ligga i en logg.
      await raiseAlert({
        kind: 'invoice.config',
        key: 'invoice:payment-config',
        subject: 'Fakturaköp stoppade: bankgiro/konto saknas eller är fel',
        detail: { fel: error.message },
      });
      return fail('NOT_CONFIGURED', 'Invoice checkout is not configured.', 503);
    }
    if (error instanceof InvoiceError) return fail(error.code, message, error.status);
    // Kortkassan hann först på den här korgversionen. Två betalbara objekt på
    // en order är ett dubbelsålt lager — försöket slutar här i stället för att
    // ta över kassans order.
    if (error instanceof PaymentMethodConflictError) return fail('CHECKOUT_IN_PROGRESS', message, 409);
    if (error instanceof CartError) return fail('CART_INVALID', message, error.status);
    if (error instanceof CartRuleError) return NextResponse.json({ error: message, code: error.code }, { status: 409 });
    if (error instanceof DiscountError) return NextResponse.json({ error: message, code: `DISCOUNT_${error.reason}` }, { status: 409 });
    if (ambiguousStripeFailure) return fail('STRIPE_UNAVAILABLE', 'Invoice checkout is temporarily unavailable. Try again.', 503);
    return fail('CHECKOUT_FAILED', 'Invoice checkout failed.', 500);
  }
}
