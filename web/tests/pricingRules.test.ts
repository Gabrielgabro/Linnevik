import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING_CONFIG,
  discountPercentFor,
  isClientComputable,
  priceForMargin,
  priceLine,
  tierFor,
  type PricingConfig,
} from '@/lib/pricingRules';
import { resolveUnitAmount } from '@/lib/pricing';

const config = DEFAULT_PRICING_CONFIG;

/**
 * Regressionen som gav upphov till modulen: produktsidan räknade med
 * `mtoPrice.ts` (50/200/400/600/1000 → 0/5/10/15/20 %) medan korgen och Stripe
 * räknade med `pricing.ts` (20/50/100 → 5/10/15 %). Vid 1000 enheter lovade
 * sidan 20 % och kassan drog 15 %; vid 100 enheter visade sidan fullpris medan
 * kassan drog 15 %. Det här testet finns för att de aldrig ska kunna skiljas åt
 * igen: `resolveUnitAmount` är serverns väg in, `priceLine` är klientens, och
 * de måste svara likadant.
 */
describe('samma pris på produktsidan som i kassan', () => {
  const listPriceMinor = 30000; // 300,00 kr

  for (const quantity of [1, 20, 50, 100, 199, 200, 400, 600, 999, 1000, 5000]) {
    it(`ger samma styckpris för ${quantity} st`, async () => {
      const client = priceLine(config, { listPriceMinor, quantity, isMto: true });
      const server = await resolveUnitAmount(listPriceMinor, quantity, { isMto: true });
      expect(server).toBe(client.unitAmountMinor);
    });
  }
});

describe('progressive', () => {
  it('följer de trappor sajten skyltar med', () => {
    expect(discountPercentFor(config, 49)).toBe(0);
    expect(discountPercentFor(config, 50)).toBe(0);
    expect(discountPercentFor(config, 200)).toBe(5);
    expect(discountPercentFor(config, 399)).toBe(5);
    expect(discountPercentFor(config, 400)).toBe(10);
    expect(discountPercentFor(config, 600)).toBe(15);
    expect(discountPercentFor(config, 1000)).toBe(20);
    expect(discountPercentFor(config, 99999)).toBe(20);
  });

  it('bryr sig inte om i vilken ordning trapporna står', () => {
    const shuffled: PricingConfig = {
      ...config,
      tiers: [
        { minQuantity: 1000, discountPercent: 20 },
        { minQuantity: 50, discountPercent: 0 },
        { minQuantity: 400, discountPercent: 10 },
        { minQuantity: 200, discountPercent: 5 },
        { minQuantity: 600, discountPercent: 15 },
      ],
    };
    expect(tierFor(shuffled, 450)?.discountPercent).toBe(10);
    expect(discountPercentFor(shuffled, 1000)).toBe(20);
  });

  it('lyfter MTO-antalet till minsta orderantal', () => {
    const result = priceLine(config, { listPriceMinor: 10000, quantity: 5, isMto: true });
    expect(result.quantity).toBe(50);
    expect(result.totalAmountMinor).toBe(50 * 10000);
  });

  /**
   * Lagerförda varor har aldrig skyltat med volympris. Den gamla serverlogiken
   * gav dem ändå 5–15 % rabatt i kassan, alltså en rabatt kunden aldrig blivit
   * lovad och som ingen kunde se på sajten.
   */
  it('ger ingen mängdrabatt på lagerförda varor när appliesTo är mto', () => {
    expect(priceLine(config, { listPriceMinor: 10000, quantity: 500 }).unitAmountMinor).toBe(10000);
  });

  it('ger mängdrabatt åt alla när appliesTo är all', () => {
    const all: PricingConfig = { ...config, appliesTo: 'all' };
    expect(priceLine(all, { listPriceMinor: 10000, quantity: 400 }).unitAmountMinor).toBe(9000);
  });
});

describe('linear', () => {
  const linear: PricingConfig = { ...config, strategy: 'linear' };

  it('växer jämnt med antalet och stannar vid taket', () => {
    expect(discountPercentFor(linear, 49)).toBe(0);
    expect(discountPercentFor(linear, 50)).toBe(0);
    expect(discountPercentFor(linear, 150)).toBe(2);
    expect(discountPercentFor(linear, 350)).toBe(6);
    expect(discountPercentFor(linear, 100_000)).toBe(20);
  });
});

describe('margin', () => {
  it('räknar priset ur landad kostnad i stället för listpriset', () => {
    const margin: PricingConfig = { ...config, strategy: 'margin', marginTargetPercent: 55 };
    // 100,00 kr kostnad vid 55 % marginal → 100 / 0,45 = 222,23 kr
    const result = priceLine(margin, {
      listPriceMinor: 10000,
      quantity: 100,
      landedCostMinor: 10000,
      isMto: true,
    });
    expect(result.unitAmountMinor).toBe(22223);
  });

  it('golvet höjer priset men sänker det aldrig', () => {
    const floored: PricingConfig = { ...config, marginFloorPercent: 45 };
    // 20 % rabatt skulle ge 240,00, men 200,00 i kostnad kräver minst 363,64.
    const capped = priceLine(floored, {
      listPriceMinor: 30000,
      quantity: 1000,
      landedCostMinor: 20000,
      isMto: true,
    });
    expect(capped.marginFloorApplied).toBe(true);
    expect(capped.unitAmountMinor).toBe(36364);

    // Är marginalen redan god rör golvet ingenting.
    const untouched = priceLine(floored, {
      listPriceMinor: 30000,
      quantity: 1000,
      landedCostMinor: 1000,
      isMto: true,
    });
    expect(untouched.marginFloorApplied).toBe(false);
    expect(untouched.unitAmountMinor).toBe(24000);
  });

  it('lämnar raden ifred när landad kostnad är okänd', () => {
    const floored: PricingConfig = { ...config, marginFloorPercent: 45 };
    const result = priceLine(floored, {
      listPriceMinor: 30000,
      quantity: 1000,
      landedCostMinor: null,
      isMto: true,
    });
    expect(result.marginFloorApplied).toBe(false);
    expect(result.unitAmountMinor).toBe(24000);
  });

  it('priceForMargin avrundar uppåt så marginalen aldrig underskrids', () => {
    expect(priceForMargin(10000, 45)).toBe(18182);
    expect(priceForMargin(10000, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

/**
 * Landad kostnad får inte lämna servern. Konfigurationer som behöver den kan
 * därför inte räknas i webbläsaren, och produktsidan måste veta det — annars
 * uppstår exakt den klyfta mellan visat och debiterat pris som modulen finns
 * för att stänga.
 */
describe('isClientComputable', () => {
  it('släpper igenom logik som klarar sig utan kostnadsdata', () => {
    expect(isClientComputable(config)).toBe(true);
    expect(isClientComputable({ ...config, strategy: 'linear' })).toBe(true);
  });

  it('stoppar kostnadsberoende logik', () => {
    expect(isClientComputable({ ...config, strategy: 'margin' })).toBe(false);
    expect(isClientComputable({ ...config, marginFloorPercent: 45 })).toBe(false);
  });
});

describe('avrundning', () => {
  it('avrundar styckpriset till hela ören och räknar totalen därifrån', () => {
    // 333,33 kr med 15 % rabatt = 283,3305 → 283,33 per styck.
    const result = priceLine(config, { listPriceMinor: 33333, quantity: 600, isMto: true });
    expect(result.unitAmountMinor).toBe(28333);
    expect(result.totalAmountMinor).toBe(28333 * 600);
  });

  it('kan aldrig ge ett negativt pris', () => {
    const absurd: PricingConfig = {
      ...config,
      tiers: [{ minQuantity: 1, discountPercent: 500 }],
      appliesTo: 'all',
    };
    expect(priceLine(absurd, { listPriceMinor: 10000, quantity: 10 }).unitAmountMinor).toBe(0);
  });
});
