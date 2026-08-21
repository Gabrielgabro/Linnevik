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
  type OrderValueTier,
  type PricingConfig,
  type PricingStrategy,
  type PricingTier,
  type ProductDiscountCap,
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
    orderValue: {
      // Tom trappa i databasen betyder att migreringen aldrig fyllde i något.
      // Faller tillbaka på konstanten hellre än att tyst ge 0 % åt alla.
      ladder: row.orderValueLadder.length
        ? row.orderValueLadder
        : DEFAULT_PRICING_CONFIG.orderValue.ladder,
      caps: row.orderValueCaps,
      defaultMaxPercent: row.orderValueDefaultMaxPercent,
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
  orderValue: PricingConfig['orderValue'];
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
  if (strategy !== 'progressive' && strategy !== 'linear' && strategy !== 'orderValue') {
    throw new PricingConfigInputError(
      "strategy måste vara 'progressive', 'linear' eller 'orderValue'."
    );
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

  let orderValue = DEFAULT_PRICING_CONFIG.orderValue;
  if (strategy === 'orderValue') {
    const raw = (body.orderValue ?? {}) as Record<string, unknown>;

    if (!Array.isArray(raw.ladder) || raw.ladder.length === 0) {
      throw new PricingConfigInputError('Minst ett trappsteg krävs för ordervärdesrabatt.');
    }
    const ladder: OrderValueTier[] = raw.ladder.map((entry, index) => {
      const tier = entry as { minOrderValueMinor?: unknown; discountPercent?: unknown };
      const minOrderValueMinor = Number(tier.minOrderValueMinor);
      const discountPercent = Number(tier.discountPercent);
      assertPositiveInt(minOrderValueMinor, `Trappsteg ${index + 1}: ordervärde`);
      assertPercent(discountPercent, `Trappsteg ${index + 1}: rabatt`);
      return { minOrderValueMinor, discountPercent };
    });
    const values = new Set(ladder.map(tier => tier.minOrderValueMinor));
    if (values.size !== ladder.length) {
      throw new PricingConfigInputError('Två trappsteg kan inte gälla från samma ordervärde.');
    }

    const rawCaps = Array.isArray(raw.caps) ? raw.caps : [];
    const caps: ProductDiscountCap[] = rawCaps.map((entry, index) => {
      const cap = entry as { skuPrefix?: unknown; maxPercent?: unknown };
      const skuPrefix = String(cap.skuPrefix ?? '').trim();
      const maxPercent = Number(cap.maxPercent);
      if (!skuPrefix) {
        throw new PricingConfigInputError(`Tak ${index + 1}: SKU-prefix får inte vara tomt.`);
      }
      assertPercent(maxPercent, `Tak ${index + 1}: rabatttak`);
      return { skuPrefix, maxPercent };
    });
    const prefixes = new Set(caps.map(cap => cap.skuPrefix));
    if (prefixes.size !== caps.length) {
      throw new PricingConfigInputError('Två tak kan inte gälla samma SKU-prefix.');
    }

    const defaultMaxPercent = Number(raw.defaultMaxPercent);
    assertPercent(defaultMaxPercent, 'Standardtak');

    orderValue = { ladder, caps, defaultMaxPercent };
  }

  return { strategy, tiers, linear, orderValue, minimumOrderQuantity };
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
      orderValueLadder: input.orderValue.ladder,
      orderValueCaps: input.orderValue.caps,
      orderValueDefaultMaxPercent: input.orderValue.defaultMaxPercent,
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
        orderValueLadder: input.orderValue.ladder,
        orderValueCaps: input.orderValue.caps,
        orderValueDefaultMaxPercent: input.orderValue.defaultMaxPercent,
        minimumOrderQuantity: input.minimumOrderQuantity,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
