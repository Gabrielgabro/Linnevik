import { describe, expect, it } from 'vitest';
import { resolveUnitAmount } from '@/lib/pricing';

/**
 * Siffrorna här ändrades när de två prislogikerna slogs ihop.
 *
 * Testet påstod tidigare att 20/50/100 enheter gav 5/10/15 % rabatt på vilken
 * vara som helst. Det var serverns egen trappa, och den fanns ingenstans på
 * sajten: produktsidan skyltade med 50/200/400/600/1000 → 0/5/10/15/20 % och
 * bara på MTO-produkter. Kunden såg alltså ett pris och debiterades ett annat,
 * och lagerförda varor fick en rabatt ingen blivit lovad.
 *
 * Nu räknar båda vägarna med `pricingRules.ts`, och det är den publicerade
 * trappan som gäller. Att `resolveUnitAmount(10_000, 20)` numera svarar 10 000
 * i stället för 9 500 är därför rättelsen, inte en regression.
 */
describe('server-side pricing', () => {
  it('följer den publicerade trappan för MTO-produkter', () => {
    expect(resolveUnitAmount(10_000, 1, { isMto: true })).toBe(10_000);
    expect(resolveUnitAmount(10_000, 50, { isMto: true })).toBe(10_000);
    expect(resolveUnitAmount(10_000, 200, { isMto: true })).toBe(9_500);
    expect(resolveUnitAmount(10_000, 400, { isMto: true })).toBe(9_000);
    expect(resolveUnitAmount(10_000, 600, { isMto: true })).toBe(8_500);
    expect(resolveUnitAmount(10_000, 1_000, { isMto: true })).toBe(8_000);
  });

  it('ger ingen mängdrabatt på lagerförda varor', () => {
    for (const quantity of [1, 20, 50, 100, 1_000]) {
      expect(resolveUnitAmount(10_000, quantity)).toBe(10_000);
    }
  });

  it('rounds to whole minor units and never returns a negative amount', () => {
    // 9,99 kr med 5 % rabatt = 9,4905 → 9,49.
    expect(resolveUnitAmount(999, 200, { isMto: true })).toBe(949);
    expect(resolveUnitAmount(-100, 1)).toBe(0);
  });
});
