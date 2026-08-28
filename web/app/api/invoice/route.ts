/**
 * Creates a Stripe `send_invoice` order for a company customer.
 *
 * This is intentionally separate from /api/checkout: Checkout collects and
 * confirms payment immediately, while an invoice creates a receivable due in
 * 30 days. Both paths use the same server-priced cart and stock reservation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { getStripe, stripeConfigured, stripeFailureIsAmbiguous } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { clients, customers, products, productVariants } from '@/lib/db/schema';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { GOODS_TAX_CODE, SHIPPING_TAX_CODE, checkoutTaxMode, vatBps, VatConfigurationError } from '@/lib/vat';
import { createPendingOrder, attachSession, abandonPendingOrder, getOrderByCartVersion, PaymentMethodConflictError, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { CartError, getOwnedCart, markOwnedCartCheckoutStarted, validateOwnedCartForCheckout } from '@/lib/cartDb';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { getSiteUrl } from '@/lib/site';
import { getServerLanguage } from '@/lib/language';
import { getTranslations } from '@/lib/i18n';
import { sendInvoiceCreatedNotice } from '@/lib/orderEmails';
import { claimDiscountCapacity, DiscountError, ensureStripeCoupon, resolveDiscount, resolveShipping, upsertCustomerFromCheckout, usableStripeCustomerId } from '@/lib/commerceOperations';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { CartRuleError } from '@/lib/cartRules';
import { swedishOrganizationNumber } from '@/lib/companyRegistration';
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

type InvoiceProfile = {
  email: string;
  organizationNumber: string;
  companyName: string;
  address: PostalAddress;
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
  const resolved = resolveCompanyProfile({
    email: account.email,
    organizationNumber: account.organizationNumber,
    companyName: text(supplied?.companyName) || account.companyName,
    address: normalizeAddress(supplied?.address) ?? account.address,
  });
  if (!resolved.ok) {
    throw new InvoiceError(PROFILE_GAP_CODES[resolved.missing], PROFILE_GAP_MESSAGES[resolved.missing], 400);
  }
  return resolved.profile;
}

type InvoiceLine = {
  title: string;
  currency: string;
  unitAmountMinor: number;
  quantity: number;
  variantId: number;
  stripeProductId?: string | null;
};

/**
 * Ett pris för en fakturarad.
 *
 * Stripe vägrar ta emot `amount` och `quantity` på samma fakturarad — och med
 * bara `amount` skrevs 18 täcken ut som "1 st à 4 320,00 kr", vilket är rätt
 * summa på en rad ingen ekonomiavdelning kan stämma av. Ett pris bär styckpris
 * och antal var för sig, och då står 18 × 240,00 kr på fakturan.
 *
 * Produkten återanvänds när varan finns i Stripe; annars skapas den med raden,
 * precis som kortkassan gör för samma katalog.
 */
/**
 * Stripe-produkterna bakom ett antal varianter.
 *
 * Fakturaraderna prissätts en gång per order under en idempotensnyckel som bär
 * ordernumret och varianten. Stripe spelar bara om en nyckel för *exakt* samma
 * parametrar, så en återupptagen faktura måste bygga raden ur samma källa som
 * första försöket gjorde — utan produkt-id:t skickas `product_data` i stället
 * för `product`, och då avvisar Stripe återupptagandet i just det läge det
 * fanns till för.
 */
async function stripeProductIdsForVariants(variantIds: number[]): Promise<Map<number, string | null>> {
  if (!variantIds.length) return new Map();
  const rows = await getDb()
    .select({ variantId: productVariants.id, stripeProductId: products.stripeProductId })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));
  return new Map(rows.map(row => [row.variantId, row.stripeProductId]));
}

async function priceForLine(line: InvoiceLine, orderId: number): Promise<string> {
  const price = await getStripe().prices.create(
    {
      currency: line.currency,
      unit_amount: line.unitAmountMinor,
      tax_behavior: 'exclusive',
      ...(line.stripeProductId
        ? { product: line.stripeProductId }
        : { product_data: { name: line.title, tax_code: GOODS_TAX_CODE } }),
    },
    { idempotencyKey: `linnevik_invoice_price_${orderId}_${line.variantId}` }
  );
  return price.id;
}

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
 * Vilket språk Stripe ska rendera fakturan på.
 *
 * Stripe lokaliserar faktura-PDF:en, fakturamejlet och kvittot efter kundens
 * `preferred_locales` — inte efter vilket språk sajten stod på när ordern
 * lades. Listan är en prioritetsordning, så en svensk kund får svenska först
 * och engelska som andrahandsval om Stripe någon gång saknar en översättning.
 *
 * Språket följer faktureringslandet och inte sajtens språkval: en svensk
 * ekonomiavdelning ska ha sin faktura på svenska även när beställaren råkade
 * surfa på den engelska versionen av butiken.
 */
function invoiceLocales(address: PostalAddress): string[] {
  return address.country === INVOICE_COUNTRY ? ['sv', 'en'] : ['en'];
}

/**
 * Fakturans egen not, det enda löptext-utrymmet Stripe ger oss ovanför
 * raderna. PDF:en i övrigt är Stripes mall och inte vår HTML — det vi kan säga
 * till kunden på själva fakturan står här och i foten.
 */
const INVOICE_MEMO: Record<string, string> = {
  sv: 'Tack för din beställning hos Linnevik. Varorna är reserverade för dig och skickas enligt överenskommelse.',
  en: 'Thank you for your order with Linnevik. The goods are reserved for you and ship as agreed.',
};

/**
 * Säljarens egen identitet på fakturan.
 *
 * Stripes säljarblock renderar bara namn, adress och telefon från
 * kontoinställningarna. En svensk leverantörsfaktura ska dessutom bära
 * säljarens organisationsnummer och uppgiften om F-skatt, och foten är enda
 * stället i mallen där de får plats. Numret ligger i env så att en ändring av
 * bolagsuppgifterna inte kräver en deploy av den här filen.
 */
const SELLER_LEGAL_NAME = process.env.INVOICE_SELLER_NAME ?? 'Linneviken AB';
const SELLER_ORG_NUMBER = process.env.INVOICE_SELLER_ORG_NUMBER ?? '559307-2951';
const SELLER_F_TAX = (process.env.INVOICE_SELLER_F_TAX ?? 'true') === 'true';

function sellerFooterLine(locale: string): string {
  const identity = `${SELLER_LEGAL_NAME}, org.nr ${SELLER_ORG_NUMBER}.`;
  if (!SELLER_F_TAX) return identity;
  return locale === 'sv'
    ? `${identity} Godkänd för F-skatt.`
    : `${identity} Approved for Swedish F-tax.`;
}

/**
 * Säljarens egna momsregistreringar, hämtade från Stripe-kontot.
 *
 * Passerar de här med på fakturan skriver Stripe ut dem i säljarblocket; utan
 * dem stod bara namn och adress där. Listan hämtas en gång per process — den
 * ändras när bolaget registrerar sig i ett nytt land, inte per faktura. Ett
 * fel sväljs: en faktura ska inte falla på att ett presentationsfält inte gick
 * att hämta, och organisationsnumret står ändå i foten.
 */
let accountTaxIdsCache: string[] | null = null;
async function sellerTaxIds(): Promise<string[]> {
  if (accountTaxIdsCache?.length) return accountTaxIdsCache;
  try {
    const list = await getStripe().taxIds.list({ owner: { type: 'account' }, limit: 10 });
    // Ett tomt svar cachas inte: registreras momsnumret på kontot i morgon
    // ska nästa faktura bära det, utan en omstart av processen.
    accountTaxIdsCache = list.data.map(taxId => taxId.id);
  } catch (error) {
    console.error('[Invoice] Could not read the seller tax IDs from Stripe:', error);
    return [];
  }
  return accountTaxIdsCache;
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
  /** Företagets fakturabrevlåda, när kundregistret har en. */
  notifyEmail?: string | null;
}) {
  const itemTaxRates = input.taxMode.kind === 'explicit' ? [input.taxMode.taxRateId] : undefined;
  for (const line of input.lines) {
    await getStripe().invoiceItems.create({
      customer: input.customerId, invoice: input.invoiceId, description: line.title,
      pricing: { price: await priceForLine(line, input.orderId) }, quantity: line.quantity,
      ...(itemTaxRates ? { tax_rates: itemTaxRates } : {}),
    }, { idempotencyKey: `linnevik_invoice_item_${input.orderId}_${line.variantId}` });
  }
  if (input.shipping.amountMinor > 0) {
    await getStripe().invoiceItems.create({
      customer: input.customerId, invoice: input.invoiceId, currency: input.shipping.currency,
      description: input.shipping.name, amount: input.shipping.amountMinor,
      tax_behavior: 'exclusive', tax_code: SHIPPING_TAX_CODE, ...(itemTaxRates ? { tax_rates: itemTaxRates } : {}),
    }, { idempotencyKey: `linnevik_invoice_shipping_${input.orderId}` });
  }
  const sent = await getStripe().invoices.sendInvoice(
    input.invoiceId,
    {},
    { idempotencyKey: `linnevik_invoice_send_${input.orderId}` }
  );
  // Vårt eget fakturamejl. Stripes utskick styrs av en inställning på kontot
  // och är inte vårt brev till kunden; utan det här fick köparen ingenting
  // från oss förrän fakturan betalats, alltså upp till 30 dagar senare.
  // `sendInvoiceCreatedNotice` sväljer sina fel: fakturan är redan skickad.
  await sendInvoiceCreatedNotice(
    sent.id,
    {
      hostedUrl: sent.hosted_invoice_url ?? null,
      number: sent.number ?? null,
      dueDate: sent.due_date ? new Date(sent.due_date * 1000) : null,
    },
    input.notifyEmail
  );
  return sent;
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
      throw new InvoiceError('STOCK_CHANGED', 'Lagret ändrades. Kontrollera korgen och försök igen.', 409);
    }

    const customerId = await (async () => {
      // Verified, not trusted: the stored id may name a customer deleted in
      // Stripe or created under a different key, and `customers.update` on a
      // dead id is a hard error that would block invoicing for this account.
      const existing = await usableStripeCustomerId({
        customerId: account.id,
        stripeCustomerId: account.stripeCustomerId,
      });
      const preferredLocales = invoiceLocales(profile.address);
      if (existing) {
        await getStripe().customers.update(existing, {
          email: profile.email, name: profile.companyName, address: stripeAddress(profile.address),
          preferred_locales: preferredLocales,
          metadata: { linnevik_org_no: profile.organizationNumber },
        });
        return existing;
      }
      const customer = await getStripe().customers.create({
        email: profile.email, name: profile.companyName, address: stripeAddress(profile.address),
        preferred_locales: preferredLocales,
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
    const orgNumber = swedishOrganizationNumber(profile.organizationNumber);
    const reference = invoiceReference(body, account);
    // Fakturans språk, inte sajtens: texten på fakturan ska följa samma språk
    // som Stripe renderar resten av PDF:en på, annars får en svensk kund som
    // råkat surfa på engelska en svensk faktura med engelska villkor i foten.
    const invoiceLocale = invoiceLocales(profile.address)[0];
    const t = getTranslations(invoiceLocale);
    const accountTaxIds = await sellerTaxIds();
    const invoice = await getStripe().invoices.create({
      customer: customerId,
      currency: priced[0].currency,
      collection_method: 'send_invoice',
      days_until_due: INVOICE_DUE_DAYS,
      auto_advance: false,
      description: INVOICE_MEMO[invoiceLocale] ?? INVOICE_MEMO.sv,
      // Stripe defaultar till US Letter för allt utom japansk lokal. En svensk
      // leverantörsfaktura ska vara A4 — den arkiveras och skrivs ut.
      rendering: { pdf: { page_size: 'a4' } },
      // Säljarens momsregistrering, annars står bara namn och adress i
      // säljarblocket. Tom lista utelämnas: Stripe avvisar ett tomt fält.
      ...(accountTaxIds.length ? { account_tax_ids: accountTaxIds } : {}),
      ...(taxMode.kind === 'automatic' ? { automatic_tax: { enabled: true } } : {}),
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      // Numret står kvar här även när det också gick in som ett riktigt tax_id:
      // fältet syns oavsett hur Stripe väljer att rendera momsregistreringen.
      // Det vi lagrar är momsnumret, och rubriken säger nu det — organisations-
      // numret skrivs ut som egen rad när det går att härleda, eftersom det är
      // två skilda uppgifter på en svensk faktura. Ordernumret är referensen
      // kundens ekonomiavdelning uppger när de hör av sig.
      custom_fields: [
        ...(orgNumber ? [{ name: 'Organisationsnummer', value: orgNumber }] : []),
        { name: 'Momsreg.nr', value: profile.organizationNumber },
        { name: 'Ordernummer', value: String(orderId) },
        ...(reference ? [{ name: 'Er referens', value: reference }] : []),
      ],
      // Betalningsvillkoren är desamma som köpvillkoren på sajten (§4), och
      // står på fakturan därför att det är där kunden faktiskt läser dem.
      footer: [t.terms.section4Text2, t.terms.section4Text3, sellerFooterLine(invoiceLocale)].join(' '),
      metadata: {
        linnevik_order_id: String(orderId),
        linnevik_shipping_minor: String(shipping.amountMinor),
        linnevik_tax_id: profile.organizationNumber,
        ...(reference ? { linnevik_reference: reference } : {}),
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
      notifyEmail: account.invoiceEmail,
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
