/**
 * §4.7: mängdrabatten har tre strategier, och admin väljer en. Förr nollade
 * en sparning de två strategier som inte var valda (plan.md, K4).
 *
 * Körs mot en tillfällig gren: raden som ändras är grenens, inte produktionens.
 */

import { describe, expect, it } from 'vitest';
import { getPricingConfigRow, parsePricingConfigInput, updatePricingConfig } from '@/lib/pricingConfigDb';

const tiers = [
  { minQuantity: 20, discountPercent: 3 },
  { minQuantity: 100, discountPercent: 8 },
];
const linear = { startQuantity: 10, quantityStep: 10, percentPerStep: 1, maxPercent: 12 };

describe('mängdrabattens strategier', () => {
  it('behåller de andra strategiernas inställningar när en sparas', async () => {
    await updatePricingConfig(parsePricingConfigInput({ strategy: 'progressive', tiers, minimumOrderQuantity: 1 }), 'Gabriel');
    await updatePricingConfig(parsePricingConfigInput({ strategy: 'linear', linear, minimumOrderQuantity: 1 }), 'Gabriel');

    const row = (await getPricingConfigRow())!;
    expect(row.strategy).toBe('linear');
    expect(row.linearMaxPercent).toBe(12);
    expect(row.tiers).toEqual(tiers);
  });
});
