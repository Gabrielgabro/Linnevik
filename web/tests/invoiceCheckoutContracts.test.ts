import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const invoiceRoute = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
const invoices = readFileSync(resolve('src/lib/stripeInvoices.ts'), 'utf8');
const webhook = readFileSync(resolve('app/api/stripe/webhook/route.ts'), 'utf8');
const inventory = readFileSync(resolve('src/lib/inventoryDb.ts'), 'utf8');
const ordersDb = readFileSync(resolve('src/lib/ordersDb.ts'), 'utf8');
const migration = readFileSync(resolve('drizzle/0034_stripe_invoice_payment_method.sql'), 'utf8');
const cartRoute = readFileSync(resolve('app/api/store/cart/[id]/route.ts'), 'utf8');
const orderEmails = readFileSync(resolve('src/lib/orderEmails.ts'), 'utf8');
const creditNotes = readFileSync(resolve('src/lib/creditNotes.ts'), 'utf8');
const adminRefunds = readFileSync(resolve('app/api/admin/orders/[id]/refunds/route.ts'), 'utf8');
const stripeRefunds = readFileSync(resolve('src/lib/stripeRefunds.ts'), 'utf8');
const creditNoteMigration = readFileSync(resolve('drizzle/0037_refund_credit_notes.sql'), 'utf8');

describe('Stripe invoice checkout contracts', () => {
  it('prints a human reference and stays inside Stripe\'s four custom fields', () => {
    expect(invoiceRoute).toContain("{ name: 'Er referens', value: reference }");
    expect(invoiceRoute).toContain('account.contactName');
    // Organisationsnummer, Momsreg.nr, Ordernummer och Er referens är fyra —
    // Stripe tar inte fler, så inköpsordernumret delar fält med referensen.
    const fields = invoiceRoute.slice(invoiceRoute.indexOf('custom_fields: ['));
    expect(fields.slice(0, fields.indexOf('],')).match(/name: '/g)).toHaveLength(4);
    expect(invoiceRoute).toContain('Ert ordernr');
  });

  it('creates a 30-day Stripe send-invoice flow from server-priced cart data', () => {
    expect(invoiceRoute).toContain("collection_method: 'send_invoice'");
    expect(invoiceRoute).toContain('days_until_due: INVOICE_DUE_DAYS');
    expect(invoiceRoute).toContain('reserveOrderStockStrict(orderId, \'invoice\', expiresAt)');
    expect(invoiceRoute).not.toMatch(/body\.(amount|price|unitAmount)/);
    expect(invoiceRoute).toContain('linnevik_invoice_item_');
    expect(invoiceRoute).toContain('linnevik_invoice_send_');
  });

  it('only lets a signed-in, active company account raise an invoice', () => {
    expect(invoiceRoute).toContain('getCurrentCustomerFromCookies()');
    expect(invoiceRoute).toContain('if (!account) {');
    expect(invoiceRoute).toContain("'SIGN_IN_REQUIRED'");
    expect(invoiceRoute).toContain("account.status !== 'active'");
    // The organisation number and e-mail are taken from the account, never the
    // request. Both, plus the company name and address, are checked by
    // resolveCompanyProfile — the same call the account page validates with, so
    // this route cannot reject what that page just accepted.
    expect(invoiceRoute).toContain('organizationNumber: account.organizationNumber');
    expect(invoiceRoute).toContain('email: account.email');
    expect(invoiceRoute).not.toMatch(/supplied\?\.(email|organizationNumber)/);
    expect(invoiceRoute).toContain('resolveCompanyProfile({');
    expect(invoiceRoute).toContain('if (!resolved.ok) {');
    expect(invoiceRoute).toContain('throw new InvoiceError(PROFILE_GAP_CODES[resolved.missing]');
  });

  it('rate-limits invoice creation per IP and per account', () => {
    expect(invoiceRoute).toContain("scope: 'invoice',");
    expect(invoiceRoute).toContain("scope: 'invoice_account',");
    expect(invoiceRoute).toContain('clientIp(request.headers)');
    expect(invoiceRoute).toMatch(/'RATE_LIMITED', .*, 429/);
  });

  it('settles only from Stripe invoice events and handles invoice expiry before stock release', () => {
    expect(webhook).toContain("case 'invoice.paid':");
    expect(webhook).toContain("case 'invoice.voided':");
    expect(webhook).toContain("case 'invoice.marked_uncollectible':");
    expect(invoices).toContain('invoices.voidInvoice(invoice.id)');
    expect(inventory).toContain("o.payment_method <> 'invoice'");
    expect(invoices).toContain("invoice.status === 'draft'");
    expect(invoices).toContain('invoices.del(invoice.id)');
  });

  it('keeps an admin cancel and the Stripe invoice in sync', () => {
    // Cancelling an invoice order voids the receivable in Stripe first.
    expect(ordersDb).toMatch(/patch\.status === 'cancelled'[\s\S]*paymentMethod === 'invoice'[\s\S]*invoices\.voidInvoice/);
    // A late payment can no longer revive a cancelled order.
    expect(ordersDb).toMatch(/target\.status === 'cancelled'[\s\S]*newlyPaid: false/);
  });

  it('persists the payment-flow distinction for reconciliation', () => {
    expect(migration).toContain('"payment_method" text NOT NULL DEFAULT \'checkout\'');
    expect(migration).toContain('"orders_payment_method_idx"');
  });

  it('prints each line as a unit price times a quantity, not one lump sum', () => {
    // Stripe vägrar `amount` och `quantity` på samma rad. Med bara `amount`
    // blev 18 täcken "1 st à 4 320,00 kr" — rätt summa, oläsbar faktura. Ett
    // pris per rad bär styckpriset, och antalet står för sig.
    expect(invoiceRoute).toContain('prices.create(');
    expect(invoiceRoute).toContain('pricing: { price: await priceForLine(line, input.orderId) }');
    expect(invoiceRoute).toContain('quantity: line.quantity');
    expect(invoiceRoute).not.toContain('amount: line.unitAmountMinor * line.quantity');
    expect(invoiceRoute).toContain('linnevik_invoice_price_');
  });

  it('separates the organisation number from the VAT number on the invoice', () => {
    expect(invoiceRoute).toContain('swedishOrganizationNumber(profile.organizationNumber)');
    expect(invoiceRoute).toContain("{ name: 'Momsreg.nr', value: profile.organizationNumber }");
    expect(invoiceRoute).not.toContain("{ name: 'Organisationsnummer', value: profile.organizationNumber }");
  });

  it('mails the buyer the invoice when it is sent, not when it is paid', () => {
    // Stripes eget utskick styrs av en kontoinställning och är inte vårt brev.
    // Utan det här hörde köparen ingenting från oss förrän betalningen kom in.
    expect(invoiceRoute).toContain('sendInvoiceCreatedNotice(');
    expect(invoiceRoute).toContain('hostedUrl: sent.hosted_invoice_url ?? null');
    expect(orderEmails).toContain("deliver(\n      order.id,\n      'order.invoice'");
    // Fakturan går till företagets fakturabrevlåda när kundregistret har en.
    expect(orderEmails).toContain("const recipient = invoiceEmail?.trim() || order?.email;");
    expect(invoiceRoute).toContain('notifyEmail: account.invoiceEmail');
    // Ett omspelat försök får inte skicka mejlet en gång till.
    expect(orderEmails).toContain("detail->>'template' = 'order.invoice'");
  });

  it('retires a cart that has gone to checkout so the buyer gets an empty one', () => {
    // Klienten glömmer korgen bara på 404. Utan det här låg 18 täcken kvar i
    // korgen efter köpet — synliga och låsta — tills fakturan betalats.
    expect(cartRoute).toContain("cart.status !== 'active'");
    expect(cartRoute).toContain('status: 404');
  });

  it('does not let a voided invoice rewrite an order someone cancelled', () => {
    // Admin avbeställer -> vi voidar fakturan i Stripe -> `invoice.voided`
    // kommer tillbaka. Utan skyddet skrev den om "cancelled" till "failed",
    // alltså ett beslut till ett betalningsfel.
    expect(ordersDb).toContain("and status <> 'cancelled'");
    // Och avbeställningen stänger betalningen själv, så avstämningen slutar
    // plocka upp ordern som oavslutad varje natt.
    expect(ordersDb).toContain("update orders set payment_status = 'failed', updated_at = now()");
    expect(invoices).toContain("payment_status = 'pending'");
  });
  it('always prints the seller VAT number, even when Stripe cannot list it', () => {
    // Säljarens momsregistreringsnummer är obligatoriskt (17 kap 24 § p.4 ML)
    // och nådde förut fakturan bara via `account_tax_ids`, vars hämtning
    // sväljer sina fel. Ett strul hos Stripe skickade alltså i väg en faktura
    // utan numret. Foten bär det när säljarblocket inte gör det.
    expect(invoiceRoute).toContain('SELLER_VAT_NUMBER');
    expect(invoiceRoute).toContain('normalizeCompanyRegistrationNumber(SELLER_ORG_NUMBER)');
    expect(invoiceRoute).toContain('sellerFooterLine(invoiceLocale, accountTaxIds.length > 0)');
    expect(invoiceRoute).toMatch(/momsreg\.nr \$\{SELLER_VAT_NUMBER\}/);
  });
});

describe('Credit notes on refunded invoices', () => {
  it('issues a credit note only for invoice-paid orders, once per refund', () => {
    // 17 kap 22 § ML: ändras beloppet efter att fakturan ställts ut krävs en
    // handling som hänvisar till den. En kortorder har ingen faktura att
    // kreditera, och en rad som redan bär en nota ska inte få en till.
    expect(creditNotes).toContain("if (row.payment_method !== 'invoice') return null;");
    expect(creditNotes).toContain("if (!row.stripe_session_id?.startsWith('in_')) return null;");
    expect(creditNotes).toContain('if (row.stripe_credit_note_id) return null;');
    expect(creditNotes).toContain('idempotencyKey: `linnevik_credit_note_${input.stripeRefundId}`');
    expect(creditNotes).toContain("if (invoice.status !== 'paid') return null;");
    // En återbetalning som aldrig gick igenom krediterar ingenting.
    expect(creditNotes).toContain("if (input.status !== 'pending' && input.status !== 'succeeded') return null;");
  });

  it('links the existing refund instead of asking Stripe to pay again', () => {
    expect(creditNotes).toContain('refunds: [{ refund: input.stripeRefundId, amount_refunded: credited.amountRefunded }]');
    expect(creditNotes).not.toContain('refund_amount');
  });

  it('credits invoice lines, because a flat amount carries no VAT', () => {
    // Pröva mot Stripe innan den här ändras: `amount: 4000` på en faktura med
    // 25 % moms ger en nota på 4 000 med **noll** moms redovisad, medan samma
    // belopp som en raderad kreditering ger 5 000 varav 1 000 moms. En
    // kreditnota utan momsrad visar inte vilken utgående moms som vänds
    // tillbaka, och det är hela skälet till att notan ställs ut.
    expect(creditNotes).toContain('lines: credited.lines');
    expect(creditNotes).toContain("type: 'invoice_line_item' as const");
    expect(creditNotes).not.toMatch(/creditNotes\.create\(\s*\{\s*invoice: context\.invoiceId,\s*amount:/);
    // Summan av de kopplade återbetalningarna måste gå jämnt upp mot notans
    // total — en nota som är mindre än återbetalningen går att ställa ut, en
    // som är större avvisas. Förhandsvisningen får därför bestämma.
    expect(creditNotes).toContain('creditNotes.preview({');
    expect(creditNotes).toContain('const delta = context.amountMinor - preview.total;');
    expect(creditNotes).toContain('preview.total < context.amountMinor');
  });

  it('never credits a line past what it has left', () => {
    // En andra återbetalning på samma faktura: krediteras en rad över sitt
    // belopp avvisar Stripe hela anropet, och tidigare notor räknas därför av.
    expect(creditNotes).toContain('creditNotes.listLineItems(');
    expect(creditNotes).toContain('line.amount - (credited.get(line.id) ?? 0)');
  });

  it('never fails the refund it follows, and alerts when it cannot issue', () => {
    // Pengarna har redan lämnat kontot. Ett fel här får inte se ut som en
    // misslyckad återbetalning — det blir ett larm om en handling som fattas.
    expect(creditNotes).toContain("kind: 'order.credit_note_failed'");
    expect(creditNotes).toContain('return null;\n  }\n}');
    expect(adminRefunds).toContain('await ensureCreditNoteForRefund({');
    // Även en återbetalning som gjordes i Stripes egen kontrollpanel.
    expect(stripeRefunds).toContain('await ensureCreditNoteForRefund({');
  });

  it('keeps the credit note number on the refund row for the bookkeeping', () => {
    expect(creditNoteMigration).toContain('"stripe_credit_note_id" text');
    expect(creditNoteMigration).toContain('"credit_note_number" text');
    expect(creditNoteMigration).toContain('WHERE "stripe_credit_note_id" IS NOT NULL');
    expect(creditNotes).toContain("kind, actor, detail");
    expect(creditNotes).toContain("'credit_note.created'");
  });
});
