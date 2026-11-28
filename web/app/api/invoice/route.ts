/**
 * Creates a Stripe `send_invoice` order for a company customer.
 *
 * This is intentionally separate from /api/checkout: Checkout collects and
 * confirms payment immediately, while an invoice creates a receivable due in
 * 30 days. Both paths use the same server-priced cart and stock reservation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  buyerSnapshot,
  INVOICE_DUE_DAYS,
  invoiceReference,
  issueInvoiceForOrder,
  type InvoiceProfile,
} from '@/lib/invoicesDb';
import { sendInvoiceEmail } from '@/lib/orderEmails';
import { getDb } from '@/lib/db';
import { clients, customers } from '@/lib/db/schema';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { vatBps } from '@/lib/vat';
import { createPendingOrder, abandonPendingOrder, getOrderByCartVersion, PaymentMethodConflictError, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { CartError, getOwnedCart, markOwnedCartCheckoutStarted, validateOwnedCartForCheckout } from '@/lib/cartDb';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { reopenCartFromCheckout } from '@/lib/checkoutAttempts';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { raiseAlert } from '@/lib/opsAlerts';
import { InvoicePaymentConfigError, invoicePaymentDetails } from '@/lib/invoicePayment';
import { claimDiscountCapacity, DiscountError, resolveDiscount, resolveShipping } from '@/lib/commerceOperations';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { CartRuleError } from '@/lib/cartRules';
import { isSwedishSoleTrader } from '@/lib/companyRegistration';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import {
  INVOICE_COUNTRY,
  normalizeAddress,
  resolveCompanyProfile,
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
  /** Företaget kontot hör till. Ordern kopplas dit (§10.8, 0047). */
  clientId: number;
  customerNo: string | null;
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
    clientId: customer.clientId,
    customerNo: client?.customerNo ?? null,
    companyName: client?.name ?? customer.company ?? '',
    // Org-numret finns bara på företaget (§11.1, §11.6).
    organizationNumber: client?.orgNumber ?? '',
    address: clientAddress ?? normalizeAddress(customer.defaultBillingAddress),
    contactName: [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim(),
    invoiceEmail: client?.invoiceEmail?.trim() || null,
  };
}

/** Samma namn så när som på versaler och mellanslag. */
function sameName(a: string, b: string): boolean {
  const key = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return key(a) !== '' && key(a) === key(b);
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
  if (!ownedCommerceEnabled()) {
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
  let invoiceIssued = false;
  try {
    // Först av allt, före order och reservation: en faktura utan bankgiro
    // eller konto går inte att betala, och ska då inte gå i väg alls (§7.8).
    // Kastar InvoicePaymentConfigError, som blir 503 och ett larm.
    invoicePaymentDetails();

    await releaseExpiredReservations('invoice').catch(error => {
      console.error('[Invoice] Could not release expired reservations:', error);
    });

    const profile = resolveProfile(body, account);
    const buyer = buyerSnapshot({
      companyName: profile.companyName,
      organizationNumber: profile.organizationNumber,
      address: profile.address,
      email: account.invoiceEmail || profile.email,
      customerNo: account.customerNo,
      reference: text(body.profile?.reference) || account.contactName,
      purchaseOrder: text(body.profile?.purchaseOrder),
    });
    const currentCart = await getOwnedCart(cartId);
    if (!currentCart) return fail('CART_NOT_FOUND', 'Cart not found.', 404);
    if (currentCart.status === 'checkout_started') {
      // Ett omsänt anrop, eller ett som avbröts efter att ordern skapats.
      // Fakturan görs högst en gång per order (issueInvoiceForOrder), och
      // mejlet skickas högst en gång (sendInvoiceEmail).
      const existing = await getOrderByCartVersion(cartId, currentCart.version);
      if (existing?.paymentMethod === 'invoice' && existing.status === 'pending') {
        const invoice = await issueInvoiceForOrder({ orderId: existing.id, buyer, dueDays: INVOICE_DUE_DAYS, actor: `webbkonto:${account.id}` });
        await sendInvoiceEmail(invoice);
        return NextResponse.json({
          redirectUrl: getSiteUrl(`${await getServerLanguage()}/checkout/klar?session_id=${invoiceReference(invoice.number)}`),
          invoiceNumber: invoice.number,
          reused: true,
        });
      }
      // Kunden avbröt kortkassan och väljer faktura i stället (§5.5). Samma
      // väg som när korgen ändras: kortförsöket avslutas och korgen öppnas.
      // Förr stod korgen låst tills Stripes session gick ut.
      if (!(await reopenCartFromCheckout(cartId, currentCart.version))) {
        return fail('CHECKOUT_IN_PROGRESS', 'Checkout has already started.', 409);
      }
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
      stripeProductId: null,
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
    const orderId = await createPendingOrder(priced, locale, { id: ownedCart.id, version: ownedCart.version }, {
      paymentMethod: 'invoice',
      discount: discount ? { id: discount.id, code: discount.code, amountMinor: discount.amountMinor } : null,
      shipping: { id: shipping.id, name: shipping.name, amountMinor: shipping.amountMinor },
      // Vår egen faktura bär vår egen sats. Stripe Tax räknar bara kortköp.
      vat: { mode: 'explicit', bps: vatBps(), rateId: null },
    });
    pendingOrderId = orderId;

    // A limited code is only truly claimed once the order holding it exists.
    if (discount) {
      await claimDiscountCapacity({ orderId, discountCodeId: discount.id, email: profile.email });
    }

    // Lagret hålls tills fakturan är betald eller ordern avbokad (§3.3).
    if (!(await reserveOrderStockStrict(orderId, 'invoice', null))) {
      await abandonPendingOrder(orderId, 'Insufficient stock before invoice');
      pendingOrderId = null;
      throw new InvoiceError('STOCK_CHANGED', 'Lagret ändrades. Kontrollera korgen och försök igen.', 409);
    }

    await setPendingOrderCustomerDetails({
      orderId, customerId: account.id, clientId: account.clientId, email: profile.email, customerName: profile.companyName,
      shippingAddress: profile.address, billingAddress: profile.address, taxId: profile.organizationNumber,
    });

    const invoice = await issueInvoiceForOrder({ orderId, buyer, dueDays: INVOICE_DUE_DAYS, actor: `webbkonto:${account.id}` });
    invoiceIssued = true;
    await markOwnedCartCheckoutStarted(ownedCart.id, ownedCart.version);
    await sendInvoiceEmail(invoice);
    return NextResponse.json({
      redirectUrl: getSiteUrl(`${locale}/checkout/klar?session_id=${invoiceReference(invoice.number)}`),
      invoiceNumber: invoice.number,
    });
  } catch (error) {
    console.error('[Invoice] Failed to create invoice:', error);
    // Utan utfärdad faktura finns ingen fordran: ordern släpps och lagret med
    // den. Med en utfärdad faktura står allt kvar, den är redan bokförd.
    if (pendingOrderId && !invoiceIssued) {
      await abandonPendingOrder(pendingOrderId, 'Invoice creation failed').catch(cleanupError => {
        console.error('[Invoice] Failed to release pending reservation:', cleanupError);
      });
    }
    const message = error instanceof Error ? error.message : 'Invoice checkout failed.';
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
    return fail('CHECKOUT_FAILED', 'Invoice checkout failed.', 500);
  }
}
