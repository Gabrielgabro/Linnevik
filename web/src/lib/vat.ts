/**
 * Momsen.
 *
 * Sajten visar priser **exklusive moms** — det är B2B-priset hotellet jämför
 * med — och momsen läggs på i kassan. Så var det inte förut: produktsidan
 * skrev "Exkl. moms" bredvid samma siffra som kassan skickade till Stripe med
 * `tax_behavior: 'inclusive'`. Med automatisk moms avstängd innebar det att
 * kunden betalade exakt det utsatta beloppet och att en fjärdedel av det var
 * moms Linnevik skulle redovisa — alltså en femtedel av intäkten uppäten på
 * varje order.
 *
 * Två vägar lägger på momsen, och de kan inte kombineras i Stripe:
 *
 * 1. `automatic_tax` när den svenska registreringen är bekräftad
 *    (`STRIPE_TAX_REGISTRATION_CONFIRMED`). Stripe Tax räknar då ut satsen och
 *    hanterar omvänd skattskyldighet mot giltiga VAT-nummer.
 * 2. En uttrycklig skattesats tills dess. Utan den skulle kassan lägga på noll
 *    moms på ett pris som skyltas som exklusive moms, vilket är just den tysta
 *    nolluppbörden migreringsplanen varnar för.
 *
 * Att flaggan är satt räcker inte. Stripe Tax med **noll registreringar**
 * räknar fram 0 % överallt och tar tyst in ingen moms alls — sämre än den
 * uttryckliga satsen, och omöjligt att se på en order i efterhand. Därför
 * kontrolleras registreringen mot Stripe innan automatisk moms används, och
 * kassan vägrar hellre än att sälja utan moms.
 */

import { getStripe } from '@/lib/stripe';
import { stripeTaxEnabled } from '@/lib/commerceConfig';

/** Svensk normalmoms. Textilier är normalbeskattade. */
export const DEFAULT_VAT_PERCENT = 25;

/**
 * Stripes skattekod för vanliga fysiska varor, respektive för frakt.
 * Används av Stripe Tax för att välja sats; utan dem faller Stripe tillbaka på
 * kontots standardkod, vilket är rätt för textil men inte något vi vill lita
 * på tyst. Frakt följer varans sats i Sverige — koden gör det uttryckligt.
 */
export const GOODS_TAX_CODE = 'txcd_99999999';
export const SHIPPING_TAX_CODE = 'txcd_92010001';

/**
 * Kassan får inte gå vidare med en momsuppsättning som skulle ta in fel belopp.
 * Egen typ så att routen kan svara 503 (fel på vår konfiguration) i stället för
 * att låta felet se ut som ett kundfel.
 */
export class VatConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VatConfigurationError';
  }
}

export function vatPercent(): number {
  const raw = process.env.VAT_PERCENT;
  if (!raw) return DEFAULT_VAT_PERCENT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return DEFAULT_VAT_PERCENT;
  return parsed;
}

/**
 * Satsen i hundradels procent. Ordern sparar den som heltal — samma skäl som
 * att belopp sparas i ören: ett heltal kan inte tappa en decimal på vägen
 * genom drivrutinen, och 25 % blir 2500.
 */
export function vatBps(percent = vatPercent()): number {
  return Math.round(percent * 100);
}

/**
 * Momsen på ett belopp exklusive moms. Avrundas till hela ören på samma sätt
 * som Stripe gör, så att vår förhandsberäkning stämmer med det som debiteras.
 */
export function vatOn(amountExVatMinor: number, percent = vatPercent()): number {
  return Math.round(amountExVatMinor * (percent / 100));
}

export function withVat(amountExVatMinor: number, percent = vatPercent()): number {
  return amountExVatMinor + vatOn(amountExVatMinor, percent);
}

/**
 * Hur mycket moms som ligger i en del av ett bruttobelopp — för
 * återbetalningar. En återbetalning görs mot betalningen, alltså inklusive
 * moms, men bokföringen behöver veta hur mycket utgående moms som vänds
 * tillbaka.
 *
 * Proportionellt mot orderns faktiska moms i stället för en ny beräkning på
 * satsen: ordern kan ha omvänd skattskyldighet, blandade satser eller ett
 * öresavrundat momsbelopp från Stripe, och då är orderns egen kvot det enda
 * som stämmer mot vad som redovisats.
 *
 * En full återbetalning ger tillbaka exakt orderns hela moms — inte ett
 * avrundat närmevärde.
 */
export function refundVatMinor(input: {
  refundMinor: number;
  orderTaxMinor: number;
  orderTotalMinor: number;
}): number {
  const { refundMinor, orderTaxMinor, orderTotalMinor } = input;
  if (orderTaxMinor <= 0 || orderTotalMinor <= 0 || refundMinor <= 0) return 0;
  if (refundMinor >= orderTotalMinor) return orderTaxMinor;
  return Math.min(orderTaxMinor, Math.round((refundMinor * orderTaxMinor) / orderTotalMinor));
}

let cachedTaxRateId: string | null = null;

/**
 * Skattesatsen att hänga på orderraderna när Stripe Tax inte är påslagen.
 *
 * Letar upp en befintlig aktiv sats med rätt procent innan en ny skapas —
 * skattesatser går inte att ta bort i Stripe, bara arkivera, så en ny per
 * kassabesök vore en läcka. Resultatet cachas per process.
 */
export async function ensureVatTaxRateId(): Promise<string> {
  if (cachedTaxRateId) return cachedTaxRateId;

  const percent = vatPercent();
  const stripe = getStripe();
  const existing = await stripe.taxRates.list({ active: true, limit: 100 });
  const match = existing.data.find(
    rate =>
      rate.percentage === percent &&
      rate.inclusive === false &&
      rate.metadata?.linnevik_vat === 'se'
  );
  if (match) {
    cachedTaxRateId = match.id;
    return match.id;
  }

  const created = await stripe.taxRates.create(
    {
      display_name: 'Moms',
      description: `Svensk moms ${percent} %`,
      percentage: percent,
      inclusive: false,
      country: 'SE',
      metadata: { linnevik_vat: 'se' },
    },
    { idempotencyKey: `linnevik_vat_se_${percent}` }
  );
  cachedTaxRateId = created.id;
  return created.id;
}

// En bekräftad registrering kan inte försvinna mitt under en process, så ett
// jakande svar cachas. Ett nekande cachas inte: den dagen registreringen går
// igenom ska en omdeploy inte behövas.
let cachedSwedishRegistration = false;

/**
 * Sant när kontot faktiskt har en aktiv svensk registrering i Stripe Tax.
 *
 * Det här är skillnaden mellan "Stripe Tax är påslaget" och "Stripe Tax tar in
 * svensk moms". Utan registrering svarar Stripe med 0 kr moms på varje rad,
 * utan att något går fel.
 */
export async function swedishTaxRegistrationActive(): Promise<boolean> {
  if (cachedSwedishRegistration) return true;
  const registrations = await getStripe().tax.registrations.list({
    status: 'active',
    limit: 100,
  });
  const swedish = registrations.data.filter(registration => registration.country === 'SE');

  // Fler än en aktiv svensk registrering är inget vi kan avgöra åt Stripe, men
  // det är värt att veta om: två registreringar med olika `place_of_supply_scheme`
  // beskriver olika sätt att beskatta samma försäljning, och vilken som vinner
  // syns bara i det belopp Stripe räknar fram. Loggas en gång per process —
  // ett jakande svar cachas ändå.
  if (swedish.length > 1) {
    console.warn(
      '[VAT] Kontot har fler än en aktiv svensk registrering i Stripe Tax:',
      swedish.map(registration => registration.id).join(', '),
      '— kontrollera vilken som gäller och låt bara den vara aktiv.'
    );
  }

  if (swedish.length) cachedSwedishRegistration = true;
  return swedish.length > 0;
}

export type CheckoutTaxMode =
  | { kind: 'automatic'; percent: number }
  | { kind: 'explicit'; taxRateId: string; percent: number };

/**
 * Hur kassan ska lägga på moms just nu. `automatic` när Stripe Tax är
 * bekräftad *och* registreringen finns, annars en uttrycklig sats.
 *
 * `percent` är i automatiskt läge vad vi förväntar oss, inte vad Stripe
 * bestämmer — ordern skriver ned det som antagande och webhooken skriver över
 * med Stripes faktiska belopp.
 */
export async function checkoutTaxMode(): Promise<CheckoutTaxMode> {
  const percent = vatPercent();
  if (stripeTaxEnabled()) {
    if (!(await swedishTaxRegistrationActive())) {
      throw new VatConfigurationError(
        'STRIPE_TAX_REGISTRATION_CONFIRMED är satt men kontot har ingen aktiv svensk ' +
          'registrering i Stripe Tax. Automatisk moms hade tagit in 0 kr. ' +
          'Registrera Sverige i Stripe, eller ta bort flaggan så används den uttryckliga satsen.'
      );
    }
    return { kind: 'automatic', percent };
  }
  return { kind: 'explicit', taxRateId: await ensureVatTaxRateId(), percent };
}

/**
 * Sista spärren innan sessionen skapas: inget belopp som kunden debiteras får
 * lämna oss utan moms på sig.
 *
 * Spärren finns därför att de tysta felen i den här koden alla har sett likadana
 * ut — ett belopp som råkar sakna sats och en order som ser helt normal ut i
 * efterhand. Den här funktionen kan inte veta vad Stripe Tax räknar fram, men
 * den kan slå fast att vi bett om det.
 */
export function assertEveryAmountIsTaxed(input: {
  mode: CheckoutTaxMode;
  lineItems: Array<{ quantity?: number; tax_rates?: string[]; price_data?: { unit_amount?: number } }>;
  shippingOptions?: Array<{ shipping_rate_data?: { fixed_amount?: { amount: number } } }>;
  allowedCountries: string[];
}): void {
  const { mode, lineItems, shippingOptions = [], allowedCountries } = input;

  if (mode.kind === 'automatic') {
    // Stripe Tax sätter sats på varje rad, inklusive frakt. Inget mer att kräva.
    return;
  }

  // Omvänd skattskyldighet och andra länders satser klarar bara Stripe Tax. Så
  // länge satsen hängs på för hand är svensk leverans det enda som är rätt.
  const foreign = allowedCountries.filter(country => country !== 'SE');
  if (foreign.length) {
    throw new VatConfigurationError(
      `Leverans till ${foreign.join(', ')} kräver Stripe Tax — en uttrycklig svensk momssats ` +
        'kan varken hantera omvänd skattskyldighet eller ett annat lands sats.'
    );
  }

  const untaxedLine = lineItems.find(
    item => (item.price_data?.unit_amount ?? 0) > 0 && !item.tax_rates?.length
  );
  if (untaxedLine) {
    throw new VatConfigurationError('En orderrad med belopp saknar momssats.');
  }

  // Stripe tar inte emot en uttrycklig momssats på en fraktrad — bara på
  // orderrader. Frakten skickas därför som en orderrad i det här läget, och
  // ett fraktbelopp som ändå dyker upp här vore obeskattat.
  const chargedShipping = shippingOptions.find(
    option => (option.shipping_rate_data?.fixed_amount?.amount ?? 0) > 0
  );
  if (chargedShipping) {
    throw new VatConfigurationError(
      'Ett fraktbelopp kan inte momsbeläggas som fraktrad utan Stripe Tax. ' +
        'Frakten ska skickas som en orderrad med momssats.'
    );
  }
}

/** Bara för tester: nollställer processcachen mellan fall. */
export function resetVatCaches(): void {
  cachedTaxRateId = null;
  cachedSwedishRegistration = false;
}
