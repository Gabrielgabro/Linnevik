/**
 * Vad en manuell faktura i admin får innehålla, som ren funktion.
 *
 * Admin är inloggad och betrodd, men kroppen är fortfarande indata: ett
 * styckpris på -100 kr, ett antal på 0,5 eller samma variant på två rader hade
 * annars gått rakt in i Stripe. Två rader med samma variant slås ihop, eftersom
 * fakturaradens idempotensnyckel bär ordernumret och varianten — två rader med
 * samma nyckel hade blivit en enda i Stripe och lämnat ordern och fakturan
 * olika.
 */

export const MANUAL_INVOICE_MAX_LINES = 50;
export const MANUAL_INVOICE_MAX_QUANTITY = 100_000;
/** 10 miljoner kronor per styck — ett tak mot felskrivna nollor, inte en affärsregel. */
export const MANUAL_INVOICE_MAX_UNIT_MINOR = 1_000_000_000;
export const MANUAL_INVOICE_DUE_DAYS_MIN = 1;
export const MANUAL_INVOICE_DUE_DAYS_MAX = 120;

export type ManualInvoiceLineInput = {
  variantId: number;
  quantity: number;
  /** Eget styckpris exkl. moms i ören; `null` betyder katalogens pris. */
  unitAmountMinor: number | null;
};

export type ManualInvoiceShipping =
  | { mode: 'rule' }
  | { mode: 'none' }
  | { mode: 'manual'; name: string; amountMinor: number };

export type ManualInvoiceInput = {
  clientId: number;
  recipient: {
    email: string;
    companyName: string;
    organizationNumber: string;
    address: { line1: string; line2: string; postalCode: string; city: string };
  };
  reference: string;
  purchaseOrder: string;
  lines: ManualInvoiceLineInput[];
  shipping: ManualInvoiceShipping;
  daysUntilDue: number;
  /** Text på fakturan under betalningsanvisningen. Tom ger standardnoten. */
  memo: string;
  /** Intern notering på ordern. Syns aldrig för kunden. */
  note: string;
};

export class ManualInvoiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualInvoiceInputError';
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function integer(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) ? number : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Raderna, validerade och med dubbletter sammanslagna. Delas av offert och skapande. */
export function parseManualInvoiceLines(value: unknown): ManualInvoiceLineInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new ManualInvoiceInputError('Lägg till minst en rad.');
  if (value.length > MANUAL_INVOICE_MAX_LINES) {
    throw new ManualInvoiceInputError(`Högst ${MANUAL_INVOICE_MAX_LINES} rader per faktura.`);
  }
  const byVariant = new Map<number, ManualInvoiceLineInput>();
  for (const raw of value) {
    const line = record(raw);
    const variantId = integer(line.variantId);
    if (variantId === null || variantId < 1) throw new ManualInvoiceInputError('En rad saknar produkt.');
    const quantity = integer(line.quantity);
    if (quantity === null || quantity < 1 || quantity > MANUAL_INVOICE_MAX_QUANTITY) {
      throw new ManualInvoiceInputError('Antalet måste vara ett heltal från 1 och uppåt.');
    }
    let unitAmountMinor: number | null = null;
    if (line.unitAmountMinor !== null && line.unitAmountMinor !== undefined && line.unitAmountMinor !== '') {
      unitAmountMinor = integer(line.unitAmountMinor);
      if (unitAmountMinor === null || unitAmountMinor < 0 || unitAmountMinor > MANUAL_INVOICE_MAX_UNIT_MINOR) {
        throw new ManualInvoiceInputError('Ett styckpris är ogiltigt.');
      }
    }
    const existing = byVariant.get(variantId);
    if (existing) {
      // Samma variant två gånger med olika egna priser går inte att slå ihop
      // utan att gissa vilket pris som gäller.
      if (existing.unitAmountMinor !== unitAmountMinor) {
        throw new ManualInvoiceInputError('Samma produkt står på två rader med olika pris. Slå ihop raderna.');
      }
      existing.quantity += quantity;
      if (existing.quantity > MANUAL_INVOICE_MAX_QUANTITY) {
        throw new ManualInvoiceInputError('Antalet måste vara ett heltal från 1 och uppåt.');
      }
    } else {
      byVariant.set(variantId, { variantId, quantity, unitAmountMinor });
    }
  }
  return [...byVariant.values()];
}

export function parseManualInvoiceShipping(value: unknown): ManualInvoiceShipping {
  const shipping = record(value);
  if (shipping.mode === 'none') return { mode: 'none' };
  if (shipping.mode === 'manual') {
    const amountMinor = integer(shipping.amountMinor);
    if (amountMinor === null || amountMinor < 0 || amountMinor > MANUAL_INVOICE_MAX_UNIT_MINOR) {
      throw new ManualInvoiceInputError('Fraktbeloppet är ogiltigt.');
    }
    return { mode: 'manual', name: text(shipping.name, 80) || 'Frakt', amountMinor };
  }
  return { mode: 'rule' };
}

export function parseManualInvoiceInput(body: unknown): ManualInvoiceInput {
  const input = record(body);
  const clientId = integer(input.clientId);
  if (clientId === null || clientId < 1) throw new ManualInvoiceInputError('Välj vilken kund fakturan gäller.');
  const recipient = record(input.recipient);
  const address = record(recipient.address);
  const daysUntilDue = integer(input.daysUntilDue);
  if (
    daysUntilDue === null ||
    daysUntilDue < MANUAL_INVOICE_DUE_DAYS_MIN ||
    daysUntilDue > MANUAL_INVOICE_DUE_DAYS_MAX
  ) {
    throw new ManualInvoiceInputError(
      `Betalningsvillkoret ska vara ${MANUAL_INVOICE_DUE_DAYS_MIN}–${MANUAL_INVOICE_DUE_DAYS_MAX} dagar.`
    );
  }
  return {
    clientId,
    recipient: {
      email: text(recipient.email, 254),
      companyName: text(recipient.companyName, 120),
      organizationNumber: text(recipient.organizationNumber, 40),
      address: {
        line1: text(address.line1, 120),
        line2: text(address.line2, 120),
        postalCode: text(address.postalCode, 20),
        city: text(address.city, 120),
      },
    },
    reference: text(input.reference, 140),
    purchaseOrder: text(input.purchaseOrder, 60),
    lines: parseManualInvoiceLines(input.lines),
    shipping: parseManualInvoiceShipping(input.shipping),
    daysUntilDue,
    memo: text(input.memo, 500),
    note: text(input.note, 2_000),
  };
}

