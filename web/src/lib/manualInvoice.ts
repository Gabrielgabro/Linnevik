/**
 * Fakturor som skapas för hand i admin.
 *
 * Samma väg som kassans fakturaköp, steg för steg: en order med frysta rader,
 * en strikt lagerreservation, en Stripe-faktura ställd på företaget med
 * bankgiro och OCR, och vårt eget fakturamejl. Därefter vet webhooken,
 * avstämningen, påminnelserna och "Registrera bankbetalning" inte skillnad på
 * en manuell faktura och en från kassan — de är samma sorts order.
 *
 * Det som skiljer: mottagaren väljs ur kundregistret i stället för att vara den
 * inloggade, och admin får sätta eget styckpris och egen frakt. Priset utan
 * eget värde är katalogens, genom samma prissättning som korgen använder.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { clientContacts, clients, customers, orderEvents, orders, products, productVariants } from '@/lib/db/schema';
import { getStripe, stripeFailureIsAmbiguous } from '@/lib/stripe';
import { ensureStripeProducts } from '@/lib/stripeCatalog';
import { getPricingConfig } from '@/lib/pricing';
import { priceOrder } from '@/lib/pricingRules';
import { landedCostMinorForSku } from '@/lib/landedCostLookup';
import { checkoutTaxMode, vatBps, vatOn, vatPercent } from '@/lib/vat';
import { abandonPendingOrder, attachSession, createPendingOrder, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { resolveShipping, upsertCustomerFromCheckout } from '@/lib/commerceOperations';
import { invoicePaymentDetails } from '@/lib/invoicePayment';
import { INVOICE_COUNTRY, resolveCompanyProfile, STRIPE_TAX_ID_TYPE, type CompanyProfileGap } from '@/lib/companyProfile';
import { createInvoiceDraft, finishInvoice, syncStripeInvoiceCustomer } from '@/lib/invoiceIssue';
import { checkStripeKey } from '@/lib/stripeHealth';
import {
  manualInvoiceReference,
  type ManualInvoiceInput,
  type ManualInvoiceLineInput,
  type ManualInvoiceShipping,
} from '@/lib/manualInvoiceInput';

/** Ett fel som admin kan rätta, med HTTP-status för rutten. */
export class ManualInvoiceError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = 'ManualInvoiceError';
  }
}

const PROFILE_GAP_MESSAGES: Record<CompanyProfileGap, string> = {
  email: 'Ange en giltig e-postadress som fakturan ska skickas till.',
  organizationNumber: 'Ange ett giltigt organisationsnummer. Fakturan ställs ut på företaget.',
  companyName: 'Ange företagets namn som det ska stå på fakturan.',
  address: 'Ange en fullständig fakturaadress: gatuadress, postnummer och ort.',
  country: 'Fakturor kan för närvarande bara ställas till svenska adresser.',
};

// ── Underlag till formuläret ────────────────────────────────────────────────

export type InvoiceClientOption = {
  id: number;
  customerNo: string;
  name: string;
  /** Taggarna, till exempel Tvätterikund. Visas bara, styr ingenting. */
  tags: string[];
  orgNumber: string | null;
  invoiceEmail: string | null;
  address: { line1: string; line2: string; postalCode: string; city: string; country: string };
  /** Adresser att välja mottagare bland: fakturamejl, webbkonton, kontakter. */
  emails: string[];
  /** Förval för "Er referens": en kontaktperson eller kontoinnehavare. */
  contactName: string | null;
};

export async function listInvoiceClients(): Promise<InvoiceClientOption[]> {
  const db = getDb();
  const [clientRows, contactRows, accountRows] = await Promise.all([
    // Hela registret. Ett företag med taggen Tvätterikund faktureras som
    // vilket annat som helst (§10.2).
    db.select().from(clients).orderBy(asc(clients.name)),
    db
      .select({
        clientId: clientContacts.clientId,
        email: clientContacts.email,
        firstName: clientContacts.firstName,
        lastName: clientContacts.lastName,
      })
      .from(clientContacts)
      .orderBy(asc(clientContacts.id)),
    db
      .select({
        clientId: customers.clientId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
      })
      .from(customers)
      .orderBy(asc(customers.id)),
  ]);
  const people = new Map<number, Array<{ email: string | null; name: string }>>();
  for (const row of [...accountRows, ...contactRows]) {
    if (row.clientId === null) continue;
    const list = people.get(row.clientId) ?? [];
    list.push({
      email: row.email?.trim().toLowerCase() || null,
      name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim(),
    });
    people.set(row.clientId, list);
  }
  return clientRows.map(client => {
    const list = people.get(client.id) ?? [];
    const emails = [client.invoiceEmail?.trim().toLowerCase() || null, ...list.map(person => person.email)]
      .filter((email): email is string => Boolean(email));
    return {
      id: client.id,
      customerNo: client.customerNo,
      name: client.name,
      tags: client.tags,
      orgNumber: client.orgNumber,
      invoiceEmail: client.invoiceEmail,
      address: {
        line1: client.addressLine1 ?? '',
        line2: client.addressLine2 ?? '',
        postalCode: client.postalCode ?? '',
        city: client.city ?? '',
        country: client.country,
      },
      emails: [...new Set(emails)],
      contactName: list.find(person => person.name)?.name ?? null,
    };
  });
}

export type InvoiceVariantOption = {
  variantId: number;
  sku: string;
  title: string;
  options: string;
  listPriceMinor: number;
  currency: string;
  /** Säljbart antal just nu; null när lagret inte följs. */
  available: number | null;
  tags: string[];
};

export async function listInvoiceVariants(): Promise<InvoiceVariantOption[]> {
  const rows = await getDb()
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      title: products.title,
      optionValues: productVariants.optionValues,
      listPriceMinor: productVariants.priceMinor,
      currency: productVariants.currency,
      tracked: productVariants.inventoryTracked,
      quantity: productVariants.inventoryQuantity,
      reserved: productVariants.inventoryReserved,
      tags: products.tags,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.active, true), eq(products.active, true)))
    .orderBy(asc(products.title), asc(productVariants.position), asc(productVariants.id));
  return rows.map(row => ({
    variantId: row.variantId,
    sku: row.sku,
    title: row.title,
    options: row.optionValues.map(option => option.value).join(' · '),
    listPriceMinor: row.listPriceMinor,
    currency: row.currency,
    available: row.tracked ? row.quantity - row.reserved : null,
    tags: row.tags ?? [],
  }));
}

// ── Prissättning ────────────────────────────────────────────────────────────

export type ManualQuoteLine = {
  variantId: number;
  sku: string;
  productHandle: string;
  /** Som på fakturan och orderraden: "Produkt (SKU)". */
  title: string;
  quantity: number;
  currency: string;
  listPriceMinor: number;
  /** Katalogens pris för det här antalet, efter mängdrabatt. */
  catalogUnitMinor: number;
  /** Det som faktureras: eget pris om ett satts, annars katalogens. */
  unitAmountMinor: number;
  priceOverridden: boolean;
  available: number | null;
};

export type ManualQuote = {
  currency: string;
  lines: ManualQuoteLine[];
  subtotalMinor: number;
  shipping: { id: number | null; name: string; amountMinor: number } | null;
  vatPercent: number;
  vatMinor: number;
  totalMinor: number;
  /** Rader där lagret inte räcker. Fakturan kan inte skapas förrän de rättats. */
  stockProblems: string[];
};

async function priceLines(lines: ManualInvoiceLineInput[]): Promise<ManualQuoteLine[]> {
  const ids = lines.map(line => line.variantId);
  const rows = await getDb()
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productHandle: products.handle,
      productTitle: products.title,
      listPriceMinor: productVariants.priceMinor,
      currency: productVariants.currency,
      tracked: productVariants.inventoryTracked,
      quantity: productVariants.inventoryQuantity,
      reserved: productVariants.inventoryReserved,
      tags: products.tags,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(inArray(productVariants.id, ids), eq(productVariants.active, true), eq(products.active, true)));
  const byId = new Map(rows.map(row => [row.variantId, row]));
  const missing = lines.find(line => !byId.has(line.variantId));
  if (missing) throw new ManualInvoiceError('En produkt på fakturan finns inte längre eller är inaktiv.', 404);

  // Hela ordern i ett svep, precis som korgen: mängdtrappan mäts på
  // ordervärdet och går inte att räkna rad för rad.
  const config = await getPricingConfig();
  const ordered = lines.map(line => ({ line, row: byId.get(line.variantId)! }));
  const priced = priceOrder(
    config,
    ordered.map(({ line, row }) => ({
      sku: row.sku,
      listPriceMinor: row.listPriceMinor,
      quantity: line.quantity,
      isMto: row.tags?.includes('MTO') ?? false,
      landedCostMinor: landedCostMinorForSku(row.sku),
    }))
  );
  const currencies = new Set(rows.map(row => row.currency));
  if (currencies.size > 1) throw new ManualInvoiceError('Produkterna har olika valutor och kan inte stå på samma faktura.');

  return ordered.map(({ line, row }, index) => {
    const catalogUnitMinor = priced.lines[index].unitAmountMinor;
    return {
      variantId: row.variantId,
      sku: row.sku,
      productHandle: row.productHandle,
      title: `${row.productTitle} (${row.sku})`,
      quantity: line.quantity,
      currency: row.currency,
      listPriceMinor: row.listPriceMinor,
      catalogUnitMinor,
      unitAmountMinor: line.unitAmountMinor ?? catalogUnitMinor,
      priceOverridden: line.unitAmountMinor !== null && line.unitAmountMinor !== catalogUnitMinor,
      available: row.tracked ? row.quantity - row.reserved : null,
    };
  });
}

async function priceShipping(
  shipping: ManualInvoiceShipping,
  subtotalMinor: number,
  currency: string
): Promise<ManualQuote['shipping']> {
  if (shipping.mode === 'none') return null;
  if (shipping.mode === 'manual') return { id: null, name: shipping.name, amountMinor: shipping.amountMinor };
  const rule = await resolveShipping({ subtotalMinor, currency, countryCode: INVOICE_COUNTRY });
  if (!rule) throw new ManualInvoiceError('Ingen fraktregel passar ordern. Ange frakten för hand eller välj ingen frakt.');
  return { id: rule.id, name: rule.name, amountMinor: rule.amountMinor };
}

export async function quoteManualInvoice(input: {
  lines: ManualInvoiceLineInput[];
  shipping: ManualInvoiceShipping;
}): Promise<ManualQuote> {
  const lines = await priceLines(input.lines);
  const currency = lines[0].currency;
  const subtotalMinor = lines.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0);
  const shipping = await priceShipping(input.shipping, subtotalMinor, currency);
  // Samma förhandsmoms som createPendingOrder skriver på ordern: frakten är
  // momspliktig och ingår i underlaget.
  const percent = vatPercent();
  const netMinor = subtotalMinor + (shipping?.amountMinor ?? 0);
  const vatMinor = vatOn(netMinor, percent);
  return {
    currency,
    lines,
    subtotalMinor,
    shipping,
    vatPercent: percent,
    vatMinor,
    totalMinor: netMinor + vatMinor,
    stockProblems: lines
      .filter(line => line.available !== null && line.quantity > line.available)
      .map(line => `${line.title}: ${line.quantity} st beställda, ${Math.max(0, line.available ?? 0)} st i lager.`),
  };
}

// ── Skapa ───────────────────────────────────────────────────────────────────

export type ManualInvoiceResult = {
  orderId: number;
  invoiceId: string;
  number: string | null;
  hostedUrl: string | null;
  totalMinor: number;
};

/**
 * Skapar ordern, reserverar lagret och skickar fakturan.
 *
 * Ett avbrott före utskicket städar efter sig som kassan gör: ett säkert fel
 * raderar utkastet i Stripe och släpper ordern och lagret. Ett tvetydigt fel —
 * ett tappat svar från Stripe — lämnar allt bundet, eftersom fakturan kan ha
 * gått i väg ändå; nattens avstämning tar upp utkast som blev liggande.
 */
export async function createManualInvoice(input: ManualInvoiceInput, actor: string): Promise<ManualInvoiceResult> {
  // Först: utan bankgiro går fakturan inte att betala. Kastar
  // InvoicePaymentConfigError, som rutten gör om till ett larm och 503.
  const payment = invoicePaymentDetails();
  // Och nyckeln ska fungera innan något skrivs: en utgången nyckel ska stoppa
  // här, inte efter att ordern skapats och lagret reserverats.
  const stripe = await checkStripeKey({ fresh: true });
  if (!stripe.ok) throw new ManualInvoiceError(`${stripe.message} Ingenting skapades.`, 503);

  const [client] = await getDb().select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!client) throw new ManualInvoiceError('Företaget finns inte.', 404);

  const resolved = resolveCompanyProfile({
    email: input.recipient.email,
    organizationNumber: input.recipient.organizationNumber,
    companyName: input.recipient.companyName,
    address: { ...input.recipient.address, country: client.country },
  });
  if (!resolved.ok) throw new ManualInvoiceError(PROFILE_GAP_MESSAGES[resolved.missing], 400);
  const profile = resolved.profile;

  await releaseExpiredReservations('admin_invoice').catch(error => {
    console.error('[ManualInvoice] Could not release expired reservations:', error);
  });

  const quote = await quoteManualInvoice({ lines: input.lines, shipping: input.shipping });
  if (quote.stockProblems.length) {
    throw new ManualInvoiceError(`Lagret räcker inte. ${quote.stockProblems.join(' ')}`);
  }
  // Samma spärr som kassan: varan ska finnas i Stripe i nyckelns läge.
  const stripeProductIds = await ensureStripeProducts(quote.lines.map(line => line.productHandle));
  const priced = quote.lines.map(line => ({
    variantId: line.variantId,
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    unitAmountMinor: line.unitAmountMinor,
    currency: line.currency,
    stripeProductId: stripeProductIds.get(line.productHandle) ?? null,
  }));
  const taxMode = await checkoutTaxMode();

  let orderId: number | null = null;
  let stripeInvoiceId: string | null = null;
  let sent = false;
  try {
    orderId = await createPendingOrder(priced, 'sv', undefined, {
      paymentMethod: 'invoice',
      shipping: quote.shipping,
      vat: { mode: taxMode.kind, bps: vatBps(taxMode.percent), rateId: taxMode.kind === 'explicit' ? taxMode.taxRateId : null },
    });

    const dueAt = new Date(Date.now() + input.daysUntilDue * 24 * 60 * 60 * 1000);
    if (!(await reserveOrderStockStrict(orderId, 'admin_invoice', dueAt))) {
      throw new ManualInvoiceError('Lagret ändrades medan fakturan skapades. Kontrollera antalen och försök igen.');
    }

    // Kundposten först, knuten till den valda kunden i registret, så att
    // ordern och Stripe-kunden hänger ihop med samma företag.
    const localCustomerId = await upsertCustomerFromCheckout({
      email: profile.email,
      name: profile.companyName,
      customerNo: client.customerNo,
      shippingAddress: profile.address,
      billingAddress: profile.address,
      taxId: { type: STRIPE_TAX_ID_TYPE, value: profile.organizationNumber },
    });
    const [localCustomer] = await getDb()
      .select({ stripeCustomerId: customers.stripeCustomerId })
      .from(customers)
      .where(eq(customers.id, localCustomerId))
      .limit(1);
    const customerId = await syncStripeInvoiceCustomer({
      localCustomerId,
      stripeCustomerId: localCustomer?.stripeCustomerId ?? null,
      profile,
    });
    await getDb()
      .update(customers)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(customers.id, localCustomerId));
    await setPendingOrderCustomerDetails({
      orderId,
      customerId: localCustomerId,
      email: profile.email,
      customerName: profile.companyName,
      shippingAddress: profile.address,
      billingAddress: profile.address,
      taxId: profile.organizationNumber,
    });
    if (input.note) {
      await getDb().update(orders).set({ notes: input.note, updatedAt: new Date() }).where(eq(orders.id, orderId));
    }

    const invoice = await createInvoiceDraft({
      orderId,
      customerId,
      currency: quote.currency,
      profile,
      reference: manualInvoiceReference(input.reference, input.purchaseOrder),
      payment,
      taxMode,
      shippingMinor: quote.shipping?.amountMinor ?? 0,
      daysUntilDue: input.daysUntilDue,
      idempotencyKey: `linnevik_admin_invoice_${orderId}`,
      memo: input.memo || null,
      metadata: { linnevik_source: 'admin', linnevik_created_by: actor.slice(0, 200) },
    });
    stripeInvoiceId = invoice.id;
    await attachSession(orderId, invoice.id);

    const finished = await finishInvoice({
      invoiceId: invoice.id,
      orderId,
      customerId,
      lines: priced,
      shipping: {
        name: quote.shipping?.name ?? 'Frakt',
        currency: quote.currency,
        amountMinor: quote.shipping?.amountMinor ?? 0,
      },
      taxMode,
      // Mottagaren som admin valde, inte kundregistrets brevlåda: den adressen
      // är redan ett av valen i formuläret.
      notifyEmail: profile.email,
      payment,
    });
    sent = true;

    // Fakturan är skickad. Ett fel i spåret efteråt får inte se ut som att
    // fakturan misslyckades — då skapar någon en till.
    await getDb()
      .insert(orderEvents)
      .values({
        orderId,
        kind: 'invoice.created_manually',
        actor,
        detail: {
          stripeInvoiceId: finished.id,
          number: finished.number ?? null,
          clientId: client.id,
          overriddenPrices: quote.lines.filter(line => line.priceOverridden).map(line => line.sku),
          daysUntilDue: input.daysUntilDue,
        },
      })
      .catch(error => console.error('[ManualInvoice] Could not record the order event:', error));

    return {
      orderId,
      invoiceId: finished.id,
      number: finished.number ?? null,
      hostedUrl: finished.hosted_invoice_url ?? null,
      totalMinor: finished.total,
    };
  } catch (error) {
    const ambiguous = stripeFailureIsAmbiguous(error);
    if (stripeInvoiceId && !sent && !ambiguous) {
      await getStripe().invoices.del(stripeInvoiceId).catch(deleteError => {
        console.error('[ManualInvoice] Failed to delete unfinished invoice:', deleteError);
      });
    }
    if (orderId && !sent && !ambiguous) {
      await abandonPendingOrder(orderId, 'Manual invoice creation failed').catch(cleanupError => {
        console.error('[ManualInvoice] Failed to release pending order:', cleanupError);
      });
    }
    throw error;
  }
}
