import { describe, expect, it } from 'vitest';
import {
  capPercentForSku,
  DEFAULT_PRICING_CONFIG,
  discountPercentFor,
  isClientComputable,
  priceLine,
  priceOrder,
  type PricingConfig,
} from '@/lib/pricingRules';

/**
 * `orderValue` mäter trappan på hela orderns värde. Det som gör den värd att
 * testa noga är att den bryter mot antagandet resten av modulen bygger på —
 * att en rad går att prissätta för sig. Testerna nedan låser fast just det:
 * `priceLine` får aldrig gissa fram en rabatt, och `priceOrder` måste räkna
 * samma sak oavsett vilken ordning raderna kommer i.
 */

const config: PricingConfig = {
  ...DEFAULT_PRICING_CONFIG,
  strategy: 'orderValue',
  minimumOrderQuantity: 1,
  orderValue: {
    ladder: [
      { minOrderValueMinor: 0, discountPercent: 0 },
      { minOrderValueMinor: 2_500_000, discountPercent: 3 },
      { minOrderValueMinor: 5_000_000, discountPercent: 6 },
      { minOrderValueMinor: 10_000_000, discountPercent: 9 },
      { minOrderValueMinor: 20_000_000, discountPercent: 12 },
    ],
    caps: [
      { skuPrefix: 'KUD-ERI', maxPercent: 28 },
      { skuPrefix: 'KUD-SIG', maxPercent: 8 },
      { skuPrefix: 'KSK', maxPercent: 4 },
    ],
    defaultMaxPercent: 12,
  },
};

const line = (sku: string, listPriceMinor: number, quantity: number) => ({
  sku,
  listPriceMinor,
  quantity,
  isMto: true,
});

describe('orderValue: trappan mäts på ordern, inte på raden', () => {
  it('ger rabatt som ingen enskild rad hade nått själv', () => {
    // Fyra rader à 1 000 000 öre = 4 000 000 → trappsteget 3 %.
    const result = priceOrder(config, [
      line('TAC-DAN', 100_000, 10),
      line('KUD-ERI', 100_000, 10),
      line('MAD', 100_000, 10),
      line('KSK', 100_000, 10),
    ]);
    expect(result.eligibleListSubtotalMinor).toBe(4_000_000);
    expect(result.ladderPercent).toBe(3);
  });

  it('höjer trappsteget när ordern växer', () => {
    const at = (quantity: number) =>
      priceOrder(config, [line('TAC-DAN', 100_000, quantity)]).ladderPercent;
    expect(at(24)).toBe(0);
    expect(at(25)).toBe(3);
    expect(at(50)).toBe(6);
    expect(at(100)).toBe(9);
    expect(at(200)).toBe(12);
  });

  it('är oberoende av radernas ordning', () => {
    const lines = [line('TAC-DAN', 100_000, 30), line('KSK', 4_400, 500), line('KUD-SIG', 74_900, 4)];
    const forward = priceOrder(config, lines);
    const reversed = priceOrder(config, [...lines].reverse());
    expect(forward.subtotalMinor).toBe(reversed.subtotalMinor);
    expect(forward.ladderPercent).toBe(reversed.ladderPercent);
  });
});

describe('orderValue: taken', () => {
  it('sänker rabatten till produktens tak men höjer den aldrig', () => {
    // 20 000 000 öre → trappsteget 12 %. KSK har tak 4 %, KUD-ERI tak 28 %.
    const result = priceOrder(config, [
      line('KUD-ERI', 100_000, 150),
      line('KSK', 100_000, 50),
    ]);
    expect(result.ladderPercent).toBe(12);

    const [eric, skydd] = result.lines;
    expect(eric.discountPercent).toBe(12); // taket 28 % biter inte
    expect(eric.capApplied).toBe(false);
    expect(skydd.discountPercent).toBe(4); // taket 4 % håller tillbaka
    expect(skydd.capApplied).toBe(true);
  });

  it('väljer längsta matchande prefix', () => {
    expect(capPercentForSku(config, 'KUD-ERI-50X70')).toBe(28);
    expect(capPercentForSku(config, 'KUD-SIG-50X70')).toBe(8);
    expect(capPercentForSku(config, 'TAC-DAN-150X200')).toBe(12); // inget eget tak
    expect(capPercentForSku(config, null)).toBe(12);
  });
});

describe('orderValue: rabattberättigande', () => {
  it('låter lagerförda varor varken få rabatt eller låsa upp den', () => {
    const result = priceOrder(config, [
      { sku: 'TAC-DAN', listPriceMinor: 100_000, quantity: 10, isMto: true },
      { sku: 'LAGER', listPriceMinor: 100_000, quantity: 100, isMto: false },
    ]);
    // Bara MTO-raden räknas mot trappan: 1 000 000 < 2 500 000 → 0 %.
    expect(result.eligibleListSubtotalMinor).toBe(1_000_000);
    expect(result.listSubtotalMinor).toBe(11_000_000);
    expect(result.ladderPercent).toBe(0);
    expect(result.lines[1].discountPercent).toBe(0);
  });
});

describe('orderValue: skyddet mot halvvägs-anrop', () => {
  it('priceLine ger fullt listpris i stället för att gissa', () => {
    expect(discountPercentFor(config, 100_000)).toBe(0);
    expect(priceLine(config, { listPriceMinor: 100_000, quantity: 500, isMto: true }).unitAmountMinor)
      .toBe(100_000);
  });

  it('hålls borta från produktsidan', () => {
    expect(isClientComputable(config)).toBe(false);
    expect(isClientComputable(DEFAULT_PRICING_CONFIG)).toBe(true);
  });
});

describe('priceOrder med andra strategier', () => {
  it('faller tillbaka på priceLine rad för rad', () => {
    const progressive: PricingConfig = { ...DEFAULT_PRICING_CONFIG, minimumOrderQuantity: 1 };
    const result = priceOrder(progressive, [
      line('TAC-DAN', 10_000, 200),
      line('KSK', 10_000, 1),
    ]);
    expect(result.lines[0].unitAmountMinor).toBe(9_500); // 5 % vid 200 st
    expect(result.lines[1].unitAmountMinor).toBe(10_000); // ingen rabatt vid 1 st
    expect(result.ladderPercent).toBe(0);
  });
});
