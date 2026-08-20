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
 */

import { getStripe } from '@/lib/stripe';
import { stripeTaxEnabled } from '@/lib/commerceConfig';

/** Svensk normalmoms. Textilier är normalbeskattade. */
export const DEFAULT_VAT_PERCENT = 25;

export function vatPercent(): number {
  const raw = process.env.VAT_PERCENT;
  if (!raw) return DEFAULT_VAT_PERCENT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return DEFAULT_VAT_PERCENT;
  return parsed;
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

/**
 * Hur kassan ska lägga på moms just nu. `automatic` när Stripe Tax är
 * bekräftad, annars en uttrycklig sats.
 */
export async function checkoutTaxMode(): Promise<
  { kind: 'automatic' } | { kind: 'explicit'; taxRateId: string; percent: number }
> {
  if (stripeTaxEnabled()) return { kind: 'automatic' };
  return {
    kind: 'explicit',
    taxRateId: await ensureVatTaxRateId(),
    percent: vatPercent(),
  };
}
