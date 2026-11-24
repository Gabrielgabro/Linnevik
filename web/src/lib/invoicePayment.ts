/**
 * Betalning av faktura via bank: bankgiro, bankkonto och OCR.
 *
 * Stripe tar inte emot svenska bankbetalningar — banköverföring till en
 * Stripe-faktura finns bara i EUR, GBP, JPY, MXN och USD. En svensk
 * företagskund betalar däremot sina leverantörsfakturor från Fortnox, Visma
 * eller internetbanken, till ett bankgiro med ett OCR-nummer, och har ingen
 * anledning att öppna en betalsida med kortformulär. Utan de uppgifterna på
 * fakturan gick den inte att betala alls (order #12, aug 2026).
 *
 * Därför bär fakturan vårt eget bankgiro och ett OCR-nummer härlett ur
 * ordernumret. Pengarna landar på bolagets konto, utanför Stripe, och
 * registreras i /admin — se `registerBankPayment` i stripeInvoices.
 *
 * Allt här är rena funktioner utom `invoicePaymentDetails`, som läser env.
 */

/** Luhn/modulus 10 — kontrollsiffran i både OCR-nummer och bankgironummer. */
export function luhnCheckDigit(payload: string): number {
  if (!/^\d+$/.test(payload)) throw new Error('Luhn payload must be digits only.');
  let sum = 0;
  // Siffran längst till höger i underlaget dubblas, eftersom kontrollsiffran
  // ska hamna till höger om den.
  for (let i = 0; i < payload.length; i += 1) {
    let digit = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function luhnValid(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false;
  return luhnCheckDigit(value.slice(0, -1)) === Number(value.slice(-1));
}

/**
 * OCR-nummer för en order: ordernumret, en längdsiffra och en kontrollsiffra.
 *
 * Längdsiffran (totala längden mod 10) gör numret giltigt oavsett vilken
 * OCR-kontroll bankgirot har — mjuk, hård eller variabel längd — om vi en dag
 * tecknar Bankgirots OCR-tjänst. Utan tjänsten skriver betalaren numret som
 * meddelande, och kontrollsiffran fångar då en felskriven siffra när vi
 * matchar betalningen.
 *
 * Order 12 → "1248".
 */
export function ocrForOrder(orderId: number): string {
  if (!Number.isInteger(orderId) || orderId < 1) throw new Error('Order id must be a positive integer.');
  const base = String(orderId);
  const lengthDigit = String((base.length + 2) % 10);
  return `${base}${lengthDigit}${luhnCheckDigit(base + lengthDigit)}`;
}

/** Ordernumret ur ett OCR-nummer, eller null om numret inte är ett av våra. */
export function orderIdFromOcr(value: string): number | null {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{3,25}$/.test(digits) || !luhnValid(digits)) return null;
  if (Number(digits.at(-2)) !== digits.length % 10) return null;
  const id = Number(digits.slice(0, -2));
  return Number.isSafeInteger(id) && id > 0 && ocrForOrder(id) === digits ? id : null;
}

/** "1234567" → "123-4567", "12345678" → "1234-5678"; null om ogiltigt. */
export function formatBankgiro(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{7,8}$/.test(digits) || !luhnValid(digits)) return null;
  return `${digits.slice(0, -4)}-${digits.slice(-4)}`;
}

export type InvoicePaymentDetails = {
  /** Formaterat, t.ex. "123-4567". */
  bankgiro: string | null;
  bankAccount: { bank: string | null; clearing: string; account: string } | null;
};

export class InvoicePaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoicePaymentConfigError';
  }
}

/**
 * Bolagets betalningsuppgifter ur env.
 *
 * Kastar hellre än att gissa: en faktura utan giltigt bankgiro eller konto är
 * precis den faktura kunden inte kan betala, och den ska aldrig gå i väg. Ett
 * felskrivet bankgiro fångas av kontrollsiffran redan här, innan det hamnar på
 * en faktura och kundens pengar går till fel mottagare.
 */
export function invoicePaymentDetails(env: Record<string, string | undefined> = process.env): InvoicePaymentDetails {
  const rawBankgiro = env.INVOICE_BANKGIRO?.trim() ?? '';
  const bankgiro = rawBankgiro ? formatBankgiro(rawBankgiro) : null;
  if (rawBankgiro && !bankgiro) {
    throw new InvoicePaymentConfigError(`INVOICE_BANKGIRO "${rawBankgiro}" är inte ett giltigt bankgironummer.`);
  }

  const clearing = env.INVOICE_BANK_CLEARING?.trim() ?? '';
  const account = env.INVOICE_BANK_ACCOUNT?.trim() ?? '';
  if (Boolean(clearing) !== Boolean(account)) {
    throw new InvoicePaymentConfigError('INVOICE_BANK_CLEARING och INVOICE_BANK_ACCOUNT måste sättas tillsammans.');
  }
  if (clearing && !/^\d{4}(-?\d)?$/.test(clearing.replace(/\s/g, ''))) {
    throw new InvoicePaymentConfigError(`INVOICE_BANK_CLEARING "${clearing}" är inte ett clearingnummer.`);
  }
  if (account && !/^[\d\s-]{5,20}$/.test(account)) {
    throw new InvoicePaymentConfigError(`INVOICE_BANK_ACCOUNT "${account}" är inte ett kontonummer.`);
  }
  const bankAccount = clearing ? { bank: env.INVOICE_BANK_NAME?.trim() || null, clearing, account } : null;

  if (!bankgiro && !bankAccount) {
    throw new InvoicePaymentConfigError(
      'Fakturor kräver INVOICE_BANKGIRO eller INVOICE_BANK_CLEARING + INVOICE_BANK_ACCOUNT.'
    );
  }
  return { bankgiro, bankAccount };
}

/** Som ovan, men null i stället för undantag — för vyer som bara visar. */
export function invoicePaymentDetailsOrNull(): InvoicePaymentDetails | null {
  try {
    return invoicePaymentDetails();
  } catch {
    return null;
  }
}

function accountText(details: InvoicePaymentDetails, locale: string): string | null {
  const bank = details.bankAccount;
  if (!bank) return null;
  const prefix = bank.bank ? `${bank.bank} ` : '';
  return locale === 'sv'
    ? `${prefix}clearing ${bank.clearing}, konto ${bank.account}`
    : `${prefix}clearing ${bank.clearing}, account ${bank.account}`;
}

/**
 * Betalningsanvisningen som den står på fakturan och i mejlen.
 *
 * `memo` hamnar högst upp på Stripe-fakturan, direkt under beloppet — där en
 * ekonomiavdelning (eller Fortnox tolkning av pdf:en) letar efter mottagare
 * och referens. `footer` upprepar det kort längst ned, där det traditionellt
 * står på en svensk faktura.
 */
export function paymentInstructions(details: InvoicePaymentDetails, ocr: string, locale: string): {
  memo: string;
  footer: string;
} {
  const sv = locale === 'sv';
  const account = accountText(details, locale);
  const to = details.bankgiro
    ? sv
      ? `bankgiro ${details.bankgiro}${account ? ` (eller ${account})` : ''}`
      : `bankgiro ${details.bankgiro}${account ? ` (or ${account})` : ''}`
    : account!;
  const memo = sv
    ? `Betala till ${to}. Ange OCR-nummer ${ocr} som referens. Betala senast på förfallodagen.`
    : `Pay to ${to}. Use OCR number ${ocr} as the payment reference. Pay no later than the due date.`;
  const parts = [
    details.bankgiro ? `Bankgiro ${details.bankgiro}` : null,
    account ? (sv ? `Bankkonto: ${account}` : `Bank account: ${account}`) : null,
    `OCR ${ocr}`,
  ].filter(Boolean);
  return { memo, footer: `${parts.join(' · ')}.` };
}

/**
 * Hur en registrerad bankbetalning förhåller sig till fakturans belopp.
 *
 * En krona åt något håll är öresavrundning hos betalaren och räknas som
 * fullt betalt. Mer än så är antingen en delbetalning — som inte får göra
 * fakturan betald — eller en överbetalning som ska tillbaka till kunden.
 */
export const BANK_PAYMENT_TOLERANCE_MINOR = 100;

export type BankPaymentAssessment =
  | { kind: 'exact'; differenceMinor: 0 }
  | { kind: 'rounding'; differenceMinor: number }
  | { kind: 'over'; differenceMinor: number }
  | { kind: 'under'; differenceMinor: number };

export function assessBankPayment(input: { amountDueMinor: number; receivedMinor: number }): BankPaymentAssessment {
  const differenceMinor = input.receivedMinor - input.amountDueMinor;
  if (differenceMinor === 0) return { kind: 'exact', differenceMinor: 0 };
  if (Math.abs(differenceMinor) <= BANK_PAYMENT_TOLERANCE_MINOR) return { kind: 'rounding', differenceMinor };
  return differenceMinor > 0 ? { kind: 'over', differenceMinor } : { kind: 'under', differenceMinor };
}

/**
 * Betalningsdagen som admin anger: ett riktigt datum, inte i framtiden och
 * inte före ordern. Returnerar ISO-datumet eller ett felmeddelande.
 */
export function validatePaidOn(
  value: unknown,
  bounds: { orderCreatedAt: Date; now?: Date }
): { ok: true; date: string } | { ok: false; error: string } {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: 'Ange betalningsdagen som ÅÅÅÅ-MM-DD.' };
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return { ok: false, error: 'Betalningsdagen är inte ett giltigt datum.' };
  }
  // Datumen jämförs som svenska kalenderdagar. En betalning bokad i dag får
  // inte nekas för att servern räknar i UTC och redan hunnit till i morgon.
  const day = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(d);
  if (text > day(bounds.now ?? new Date())) return { ok: false, error: 'Betalningsdagen kan inte ligga i framtiden.' };
  if (text < day(bounds.orderCreatedAt)) return { ok: false, error: 'Betalningsdagen kan inte ligga före ordern.' };
  return { ok: true, date: text };
}
