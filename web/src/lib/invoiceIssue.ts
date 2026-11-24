/**
 * Att ställa ut en Stripe-faktura för en order — delat mellan kassans
 * fakturaköp (/api/invoice) och fakturor som skapas för hand i admin
 * (/api/admin/invoices).
 *
 * Allt som syns på fakturan bor här: raderna med styckpris och antal, momsen,
 * säljarens identitet i foten, bankgiro och OCR, mottagarens org- och
 * momsnummer och "Er referens". En faktura ska se likadan ut och gå samma väg
 * genom Stripe, webhooken och avstämningen oavsett var den skapades.
 *
 * Det som skiljer vägarna åt stannar i rutterna: vem som får beställa, var
 * raderna och priserna kommer ifrån, och hur ett avbrutet försök tas upp igen.
 */

import type Stripe from 'stripe';
import { eq, inArray } from 'drizzle-orm';
import { getStripe } from '@/lib/stripe';
import { ensureStripeProducts } from '@/lib/stripeCatalog';
import { getDb } from '@/lib/db';
import { products, productVariants } from '@/lib/db/schema';
import { GOODS_TAX_CODE, SHIPPING_TAX_CODE, type CheckoutTaxMode } from '@/lib/vat';
import { getTranslations } from '@/lib/i18n';
import { sendInvoiceCreatedNotice } from '@/lib/orderEmails';
import { ocrForOrder, paymentInstructions, type InvoicePaymentDetails } from '@/lib/invoicePayment';
import { usableStripeCustomerId } from '@/lib/commerceOperations';
import { normalizeCompanyRegistrationNumber, swedishOrganizationNumber } from '@/lib/companyRegistration';
import { INVOICE_COUNTRY, stripeAddress, STRIPE_TAX_ID_TYPE, type PostalAddress } from '@/lib/companyProfile';

/** Betalningsvillkoret på sajten (köpvillkoren §4) och förvalet i admin. */
export const INVOICE_DUE_DAYS = 30;

/** Mottagaren som den står på fakturan. Validerad av `resolveCompanyProfile`. */
export type InvoiceProfile = {
  email: string;
  organizationNumber: string;
  companyName: string;
  address: PostalAddress;
};

export type InvoiceLine = {
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
export async function stripeProductIdsForVariants(variantIds: number[]): Promise<Map<number, string | null>> {
  if (!variantIds.length) return new Map();
  const rows = await getDb()
    .select({
      variantId: productVariants.id,
      handle: products.handle,
      stripeProductId: products.stripeProductId,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));
  // Id:t ska vara detsamma som första försöket skickade, men produkten bakom
  // det ska finnas i nyckelns läge — annars vägrar Stripe priset.
  await ensureStripeProducts(rows.filter(row => row.stripeProductId).map(row => row.handle));
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
export async function ensureStripeTaxId(customerId: string, organizationNumber: string): Promise<void> {
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
export function invoiceLocales(address: PostalAddress): string[] {
  return address.country === INVOICE_COUNTRY ? ['sv', 'en'] : ['en'];
}

/**
 * Fakturans egen not, det enda löptext-utrymmet Stripe ger oss ovanför
 * raderna. PDF:en i övrigt är Stripes mall och inte vår HTML — det vi kan säga
 * till kunden på själva fakturan står här och i foten.
 */
export const INVOICE_MEMO: Record<string, string> = {
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
/**
 * Säljarens momsregistreringsnummer, härlett ur organisationsnumret om det
 * inte satts uttryckligen. En momsgrupp eller filial bär ett annat löpnummer
 * än `01` och sätter då env-variabeln.
 */
const SELLER_VAT_NUMBER =
  process.env.INVOICE_SELLER_VAT_NUMBER?.trim() ||
  normalizeCompanyRegistrationNumber(SELLER_ORG_NUMBER);

/**
 * @param vatPrinted Om Stripe redan skriver ut momsnumret i säljarblocket,
 * alltså om `account_tax_ids` kom med på fakturan.
 */
export function sellerFooterLine(locale: string, vatPrinted: boolean): string {
  // Säljarens momsregistreringsnummer är en obligatorisk uppgift (17 kap 24 §
  // p.4 ML) och nådde förut fakturan bara via `account_tax_ids`. Den listan
  // hämtas med ett anrop vars fel sväljs, så ett strul hos Stripe skickade i
  // väg en faktura utan numret — ett fel ingen kunde se på vägen ut. Foten bär
  // det i stället när säljarblocket inte gör det.
  const identity = vatPrinted
    ? `${SELLER_LEGAL_NAME}, org.nr ${SELLER_ORG_NUMBER}.`
    : `${SELLER_LEGAL_NAME}, org.nr ${SELLER_ORG_NUMBER}, momsreg.nr ${SELLER_VAT_NUMBER}.`;
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
export async function sellerTaxIds(): Promise<string[]> {
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
export async function finishInvoice(input: {
  invoiceId: string;
  orderId: number;
  customerId: string;
  lines: InvoiceLine[];
  shipping: { name: string; currency: string; amountMinor: number };
  taxMode: CheckoutTaxMode;
  /** Företagets fakturabrevlåda, när kundregistret har en. */
  notifyEmail?: string | null;
  /** Bankgiro/konto som står på fakturan; mejlet ska säga samma sak. */
  payment: InvoicePaymentDetails;
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
      payment: input.payment,
      ocr: ocrForOrder(input.orderId),
    },
    input.notifyEmail
  );
  return sent;
}

/**
 * Stripe-kunden fakturan ställs ut på, uppdaterad med mottagaren som den ser
 * ut på just den här fakturan.
 *
 * Det lagrade id:t verifieras i stället för att litas på: det kan peka på en
 * kund som raderats i Stripe eller skapats under en annan nyckel, och
 * `customers.update` på ett dött id är ett hårt fel som annars hade spärrat
 * all fakturering till kunden.
 */
export async function syncStripeInvoiceCustomer(input: {
  /** Den lokala kundposten, när en finns. */
  localCustomerId: number | null;
  stripeCustomerId: string | null;
  profile: InvoiceProfile;
}): Promise<string> {
  const { profile } = input;
  const existing = input.localCustomerId
    ? await usableStripeCustomerId({ customerId: input.localCustomerId, stripeCustomerId: input.stripeCustomerId })
    : null;
  const preferredLocales = invoiceLocales(profile.address);
  let customerId: string;
  if (existing) {
    await getStripe().customers.update(existing, {
      email: profile.email, name: profile.companyName, address: stripeAddress(profile.address),
      preferred_locales: preferredLocales,
      metadata: { linnevik_org_no: profile.organizationNumber },
    });
    customerId = existing;
  } else {
    const customer = await getStripe().customers.create({
      email: profile.email, name: profile.companyName, address: stripeAddress(profile.address),
      preferred_locales: preferredLocales,
      metadata: { linnevik_org_no: profile.organizationNumber },
    }, { idempotencyKey: `linnevik_invoice_customer_${profile.email}` });
    customerId = customer.id;
  }
  await ensureStripeTaxId(customerId, profile.organizationNumber);
  return customerId;
}

/**
 * Fakturautkastet: mottagare, villkor, betalningsanvisning och fot. Raderna
 * läggs till och fakturan skickas i `finishInvoice`.
 */
export async function createInvoiceDraft(input: {
  orderId: number;
  customerId: string;
  currency: string;
  profile: InvoiceProfile;
  /** "Er referens", redan sammansatt och kapad. */
  reference: string | null;
  payment: InvoicePaymentDetails;
  taxMode: CheckoutTaxMode;
  couponId?: string | null;
  shippingMinor: number;
  daysUntilDue: number;
  /** Nyckeln som gör ett omspelat anrop till samma faktura. */
  idempotencyKey: string;
  /** Egen text under betalningsanvisningen; annars fakturans standardnot. */
  memo?: string | null;
  /** Extra metadata, t.ex. vem i admin som skapade fakturan. */
  metadata?: Record<string, string>;
}): Promise<Stripe.Invoice> {
  const { profile, reference, payment, taxMode, couponId } = input;
  const orgNumber = swedishOrganizationNumber(profile.organizationNumber);
  // Fakturans språk, inte sajtens: texten på fakturan ska följa samma språk
  // som Stripe renderar resten av PDF:en på, annars får en svensk kund som
  // råkat surfa på engelska en svensk faktura med engelska villkor i foten.
  const invoiceLocale = invoiceLocales(profile.address)[0];
  const t = getTranslations(invoiceLocale);
  const accountTaxIds = await sellerTaxIds();
  const ocr = ocrForOrder(input.orderId);
  const instructions = paymentInstructions(payment, ocr, invoiceLocale);
  const memo = input.memo?.trim() || (INVOICE_MEMO[invoiceLocale] ?? INVOICE_MEMO.sv);
  return getStripe().invoices.create({
    customer: input.customerId,
    currency: input.currency,
    collection_method: 'send_invoice',
    days_until_due: input.daysUntilDue,
    auto_advance: false,
    // Betalningsanvisningen först: memot står direkt under beloppet, och det
    // är där mottagarens ekonomiavdelning letar efter bankgiro och OCR.
    description: `${instructions.memo}\n\n${memo}`,
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
      { name: 'Ordernummer', value: String(input.orderId) },
      ...(reference ? [{ name: 'Er referens', value: reference }] : []),
    ],
    // Betalningsvillkoren är desamma som köpvillkoren på sajten (§4), och
    // står på fakturan därför att det är där kunden faktiskt läser dem.
    footer: [
      instructions.footer,
      t.terms.section4Text2,
      t.terms.section4Text3,
      sellerFooterLine(invoiceLocale, accountTaxIds.length > 0),
    ].join(' '),
    metadata: {
      ...input.metadata,
      linnevik_order_id: String(input.orderId),
      linnevik_shipping_minor: String(input.shippingMinor),
      linnevik_tax_id: profile.organizationNumber,
      linnevik_ocr: ocr,
      ...(reference ? { linnevik_reference: reference } : {}),
      linnevik_vat_mode: taxMode.kind,
    },
  }, { idempotencyKey: input.idempotencyKey });
}
