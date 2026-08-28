import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ordersDb = readFileSync(resolve('src/lib/ordersDb.ts'), 'utf8');
const checkout = readFileSync(resolve('app/api/checkout/route.ts'), 'utf8');
const invoice = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
const invoices = readFileSync(resolve('src/lib/stripeInvoices.ts'), 'utf8');
const inventory = readFileSync(resolve('src/lib/inventoryDb.ts'), 'utf8');
const operations = readFileSync(resolve('src/lib/commerceOperations.ts'), 'utf8');

/**
 * Tre fel som bara syns när två saker händer samtidigt, eller när ett svar
 * från Stripe kommer bort mitt i. Inget av dem märks i ett lugnt köpflöde,
 * och alla tre kostar antingen lager eller en dubbel försäljning.
 */
describe('the two checkout paths cannot race each other', () => {
  it('never hands one payment method the other one\'s order', () => {
    // Bara en order får finnas per korgversion. När insert:en förlorar loppet
    // lämnade den tillbaka den befintliga ordern utan att titta på hur den
    // skulle betalas — och då reserverade båda rutterna dess lager och byggde
    // var sitt betalbart objekt i Stripe på den.
    expect(ordersDb).toContain('export class PaymentMethodConflictError');
    expect(ordersDb).toContain('select id, payment_method from new_order');
    expect(ordersDb).toContain(
      'if (existingMethod !== requestedMethod) throw new PaymentMethodConflictError(existingMethod);'
    );
  });

  it('answers the losing attempt with a code the buyer can read', () => {
    for (const route of [checkout, invoice]) {
      expect(route).toContain('PaymentMethodConflictError');
      expect(route).toMatch(/PaymentMethodConflictError\)[\s\S]{0,200}CHECKOUT_IN_PROGRESS/);
    }
  });
});

describe('a lost Stripe response cannot strand reserved stock', () => {
  it('leaves invoice expiry to the Stripe-aware reconciliation', () => {
    // Den generella utgången rör inte fakturaordrar med flit: fakturan måste
    // voidas innan lagret släpps.
    expect(inventory).toContain("o.payment_method <> 'invoice'");
  });

  it('finds the invoice an unattached order never heard back about', () => {
    // Lagret reserveras före `invoices.create`. Går svaret förlorat står
    // ordern kvar med sin `pending_`-referens: avstämningen såg bara `in_`,
    // och utgången ovan hoppar över fakturaordrar. Reservationen låg kvar för
    // gott. Nu frågar avstämningen Stripe om fakturan finns — ordernumret
    // ligger i dess metadata — och adopterar den eller släpper ordern.
    expect(invoices).toContain("row.stripe_session_id.startsWith('pending_')");
    expect(invoices).toContain("query: `metadata['linnevik_order_id']:'${row.id}'`");
    expect(invoices).toContain('await reconcileInvoiceReference(orphan);');
    expect(invoices).toContain(
      "await abandonPendingOrder(row.id, 'Invoice was never created in Stripe');"
    );
    // Ett anrop som fortfarande pågår ska inte städas bort under fötterna på
    // sig, och Stripes sökindex ligger en aning efter skrivningarna.
    expect(invoices).toContain("created_at <= now() - interval '30 minutes'");
  });
});

describe('a draft invoice can actually be finished', () => {
  it('rebuilds the line from the same source the first attempt priced from', () => {
    // Priset per rad skapas under en idempotensnyckel som bär order och
    // variant. Stripe spelar bara om en nyckel för exakt samma parametrar, så
    // en rad utan `stripeProductId` skickar `product_data` i stället för
    // `product` — och då avvisas återupptagandet i just det avbrott det fanns
    // till för.
    expect(invoice).toContain('async function stripeProductIdsForVariants(');
    expect(invoice).toContain('stripeProductId: productIds.get(item.variantId as number) ?? null,');
    // En rad vars variant hunnit tas bort kan inte spela om sin nyckel alls.
    expect(invoice).toContain(
      'const recoverable = existing.items.every(item => item.variantId !== null);'
    );
    expect(invoice).toContain("invoice.status === 'draft' && existing.status === 'pending' && recoverable");
    expect(invoice).not.toContain('variantId: item.variantId ?? 0,');
  });
});

describe('one organisation number means one client record', () => {
  it('lets the database settle the registration race', () => {
    // Uppslagningen och insert:en var inte serialiserade: två anställda med
    // olika mejl och samma organisationsnummer kunde få var sin kundpost, och
    // därefter låg ordrar och avtalade priser på två ställen.
    expect(operations).toContain('.onConflictDoNothing()');
    expect(operations).not.toContain('.onConflictDoNothing({ target: clients.customerNo })');
    expect(operations).toMatch(/if \(!client && input\.orgNumber\)[\s\S]{0,200}eq\(clients\.orgNumber, input\.orgNumber\)/);
  });
});
