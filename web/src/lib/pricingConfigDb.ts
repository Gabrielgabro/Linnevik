/**
 * Databasvägen för prislogikens konfiguration. Ligger separat från
 * pricingRules.ts, som förblir ren och utan databasberoenden — produktsidan
 * räknar fortfarande om priset i webbläsaren med exakt samma `PricingConfig`-
 * objekt som servern, bara att objektet nu kommer härifrån i stället för från
 * en hårdkodad konstant.
 *
 * `appliesTo` är aldrig en kolumn: den är fast 'mto' i `toPricingConfig`, så
 * ett admin-sparande aldrig kan slå på mängdrabatt för lagerförda varor.
 * `strategy: 'margin'` är av samma skäl inte valbart — se `pricingRules.ts`.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pricingConfig, type PricingConfigRow } from '@/lib/db/schema';
import {
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,
  type PricingStrategy,
  type PricingTier,
} from '@/lib/pricingRules';

export class PricingConfigInputError extends Error {}

function toPricingConfig(row: PricingConfigRow): PricingConfig {
  return {
    strategy: row.strategy as PricingStrategy,
    tiers: row.tiers,
    linear: {
      startQuantity: row.linearStartQuantity,
      quantityStep: row.linearQuantityStep,
      percentPerStep: row.linearPercentPerStep,
      maxPercent: row.linearMaxPercent,
    },
    marginTargetPercent: DEFAULT_PRICING_CONFIG.marginTargetPercent,
    marginFloorPercent: null,
    minimumOrderQuantity: row.minimumOrderQuantity,
    appliesTo: 'mto',
  };
}

/**
 * Den gällande konfigurationen. Faller tillbaka på konstanten om raden
 * saknas — det gör produktsidan och kassan aldrig blinda innan migreringen
 * körts, eller om DATABASE_URL saknas i en lokal miljö.
 */
export async function getStoredPricingConfig(): Promise<PricingConfig> {
  if (!process.env.DATABASE_URL) return DEFAULT_PRICING_CONFIG;
  const [row] = await getDb().select().from(pricingConfig).where(eq(pricingConfig.id, 1)).limit(1);
  return row ? toPricingConfig(row) : DEFAULT_PRICING_CONFIG;
}

export async function getPricingConfigRow(): Promise<PricingConfigRow | null> {
  const [row] = await getDb().select().from(pricingConfig).where(eq(pricingConfig.id, 1)).limit(1);
  return row ?? null;
}

export type PricingConfigUpdate = {
  strategy: PricingStrategy;
  tiers: PricingTier[];
  linear: PricingConfig['linear'];
  minimumOrderQuantity: number;
};

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PricingConfigInputError(`${label} måste vara ett heltal, noll eller större.`);
  }
}

function assertPercent(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new PricingConfigInputError(`${label} måste vara mellan 0 och 100.`);
  }
}

/**
 * Validerar innan skrivning. Kastar hellre ett tydligt fel än att spara en
 * trappa utan trappsteg eller en linjär kurva som aldrig ger rabatt — det
 * skulle bara synas som ett orörligt pris på produktsidan.
 */
export function parsePricingConfigInput(body: Record<string, unknown>): PricingConfigUpdate {
  const strategy = body.strategy;
  if (strategy !== 'progressive' && strategy !== 'linear') {
    throw new PricingConfigInputError("strategy måste vara 'progressive' eller 'linear'.");
  }

  const minimumOrderQuantity = Number(body.minimumOrderQuantity);
  assertPositiveInt(minimumOrderQuantity, 'Minsta orderantal');
  if (minimumOrderQuantity < 1) {
    throw new PricingConfigInputError('Minsta orderantal måste vara minst 1.');
  }

  let tiers: PricingTier[] = [];
  if (strategy === 'progressive') {
    if (!Array.isArray(body.tiers) || body.tiers.length === 0) {
      throw new PricingConfigInputError('Minst en trappa krävs för trappstegsrabatt.');
    }
    tiers = body.tiers.map((raw, index) => {
      const tier = raw as { minQuantity?: unknown; discountPercent?: unknown };
      const minQuantity = Number(tier.minQuantity);
      const discountPercent = Number(tier.discountPercent);
      assertPositiveInt(minQuantity, `Trappa ${index + 1}: antal`);
      assertPercent(discountPercent, `Trappa ${index + 1}: rabatt`);
      return { minQuantity, discountPercent };
    });
    const quantities = new Set(tiers.map(tier => tier.minQuantity));
    if (quantities.size !== tiers.length) {
      throw new PricingConfigInputError('Två trappor kan inte gälla från samma antal.');
    }
  }

  let linear = DEFAULT_PRICING_CONFIG.linear;
  if (strategy === 'linear') {
    const raw = (body.linear ?? {}) as Record<string, unknown>;
    const startQuantity = Number(raw.startQuantity);
    const quantityStep = Number(raw.quantityStep);
    const percentPerStep = Number(raw.percentPerStep);
    const maxPercent = Number(raw.maxPercent);
    assertPositiveInt(startQuantity, 'Startantal');
    assertPositiveInt(quantityStep, 'Antal per steg');
    if (quantityStep < 1) throw new PricingConfigInputError('Antal per steg måste vara minst 1.');
    assertPercent(percentPerStep, 'Rabatt per steg');
    assertPercent(maxPercent, 'Rabatttak');
    linear = { startQuantity, quantityStep, percentPerStep, maxPercent };
  }

  return { strategy, tiers, linear, minimumOrderQuantity };
}

export async function updatePricingConfig(
  input: PricingConfigUpdate,
  updatedBy: string
): Promise<PricingConfigRow> {
  const [row] = await getDb()
    .insert(pricingConfig)
    .values({
      id: 1,
      strategy: input.strategy,
      tiers: input.tiers,
      linearStartQuantity: input.linear.startQuantity,
      linearQuantityStep: input.linear.quantityStep,
      linearPercentPerStep: input.linear.percentPerStep,
      linearMaxPercent: input.linear.maxPercent,
      minimumOrderQuantity: input.minimumOrderQuantity,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pricingConfig.id,
      set: {
        strategy: input.strategy,
        tiers: input.tiers,
        linearStartQuantity: input.linear.startQuantity,
        linearQuantityStep: input.linear.quantityStep,
        linearPercentPerStep: input.linear.percentPerStep,
        linearMaxPercent: input.linear.maxPercent,
        minimumOrderQuantity: input.minimumOrderQuantity,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
