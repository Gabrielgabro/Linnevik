/**
 * Fakturor som skapas för hand i admin (source_of_truth §10).
 *
 * Samma sorts order som kassans fakturaköp: frysta rader, en strikt
 * lagerreservation, vår egen faktura med nummer, bankgiro och OCR, och
 * fakturamejlet med pdf:en. Därefter vet påminnelserna och "Registrera
 * bankbetalning" inte skillnad på en manuell faktura och en från kassan.
 *
 * Det som skiljer: mottagaren väljs ur företagsregistret, admin får sätta eget
 * styckpris och egen frakt, och inget webbkonto skapas (§10.8).
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { clientContacts, clients, customers, orderEvents, products, productVariants } from '@/lib/db/schema';
import { getPricingConfig } from '@/lib/pricing';
import { priceOrder } from '@/lib/pricingRules';
import { landedCostMinorForSku } from '@/lib/landedCostLookup';
import { vatBps, vatOn, vatPercent } from '@/lib/vat';
import { abandonPendingOrder, createPendingOrder, setPendingOrderCustomerDetails } from '@/lib/ordersDb';
import { releaseExpiredReservations, reserveOrderStockStrict } from '@/lib/inventoryDb';
import { resolveShipping } from '@/lib/commerceOperations';
import { invoicePaymentDetails } from '@/lib/invoicePayment';
import { INVOICE_COUNTRY, resolveCompanyProfile, type CompanyProfileGap } from '@/lib/companyProfile';
import { buyerSnapshot, issueInvoiceForOrder } from '@/lib/invoicesDb';
import { sendInvoiceEmail } from '@/lib/orderEmails';
import { addComment } from '@/lib/adminComments';
import {
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
  number: number;
  totalMinor: number;
  /** Mejlet med pdf:en gick fram. Fakturan finns oavsett. */
  emailed: boolean;
};

/**
 * Skapar ordern, reserverar lagret, gör fakturan och mejlar den.
 *
 * Ordern kopplas till företaget direkt. Mottagarens e-post är en adress för
 * fakturan, inte en inloggning: inget webbkonto skapas och inget befintligt
 * flyttas (§10.8, A12).
 *
 * Ett fel före fakturan släpper ordern och lagret. Efter fakturan står allt
 * kvar: fakturan har ett nummer i serien och ska makuleras, inte försvinna.
 */
export async function createManualInvoice(input: ManualInvoiceInput, actor: string): Promise<ManualInvoiceResult> {
  // Först: utan bankgiro går fakturan inte att betala. Kastar
  // InvoicePaymentConfigError, som rutten gör om till ett larm och 503.
  invoicePaymentDetails();

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
  const priced = quote.lines.map(line => ({
    variantId: line.variantId,
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    unitAmountMinor: line.unitAmountMinor,
    currency: line.currency,
    stripeProductId: null,
  }));

  let orderId: number | null = null;
  let issued = false;
  try {
    orderId = await createPendingOrder(priced, 'sv', undefined, {
      paymentMethod: 'invoice',
      shipping: quote.shipping,
      vat: { mode: 'explicit', bps: vatBps(), rateId: null },
    });

    // Lagret hålls tills fakturan är betald eller ordern avbokad (§3.3, §10.7).
    if (!(await reserveOrderStockStrict(orderId, 'admin_invoice', null))) {
      throw new ManualInvoiceError('Lagret ändrades medan fakturan skapades. Kontrollera antalen och försök igen.');
    }

    await setPendingOrderCustomerDetails({
      orderId,
      customerId: null,
      clientId: client.id,
      email: profile.email,
      customerName: profile.companyName,
      shippingAddress: profile.address,
      billingAddress: profile.address,
      taxId: profile.organizationNumber,
    });
    // Den interna anteckningen (§10.6) blir orderns första kommentar, med vem
    // som skapade fakturan (§15.6).
    if (input.note?.trim()) {
      await addComment({ subject: 'order', subjectId: orderId, author: actor, body: input.note });
    }

    const invoice = await issueInvoiceForOrder({
      orderId,
      buyer: buyerSnapshot({
        companyName: profile.companyName,
        organizationNumber: profile.organizationNumber,
        address: profile.address,
        email: profile.email,
        customerNo: client.customerNo,
        reference: input.reference,
        purchaseOrder: input.purchaseOrder,
      }),
      dueDays: input.daysUntilDue,
      memo: input.memo || null,
      actor,
    });
    issued = true;

    // Fakturan finns. Ett fel i spåret efteråt får inte se ut som att fakturan
    // misslyckades, då skapar någon en till.
    await getDb()
      .insert(orderEvents)
      .values({
        orderId,
        kind: 'invoice.created_manually',
        actor,
        detail: {
          number: invoice.number,
          clientId: client.id,
          overriddenPrices: quote.lines.filter(line => line.priceOverridden).map(line => line.sku),
          daysUntilDue: input.daysUntilDue,
        },
      })
      .catch(error => console.error('[ManualInvoice] Could not record the order event:', error));

    const emailed = await sendInvoiceEmail(invoice);
    return { orderId, number: invoice.number, totalMinor: invoice.totalMinor, emailed };
  } catch (error) {
    if (orderId && !issued) {
      await abandonPendingOrder(orderId, 'Manual invoice creation failed').catch(cleanupError => {
        console.error('[ManualInvoice] Failed to release pending order:', cleanupError);
      });
    }
    throw error;
  }
}
