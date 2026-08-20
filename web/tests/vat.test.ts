import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_VAT_PERCENT, vatOn, vatPercent, withVat } from '@/lib/vat';

afterEach(() => {
  delete process.env.VAT_PERCENT;
});

/**
 * Sajten visar priser exklusive moms och momsen läggs på i kassan. Förut
 * skickades samma siffra till Stripe med `tax_behavior: 'inclusive'` och
 * automatisk moms avstängd, vilket betydde att kunden betalade det utsatta
 * beloppet och att en fjärdedel av det egentligen var moms — en femtedel av
 * intäkten uppäten på varje order.
 */
describe('vatOn', () => {
  it('lägger svensk normalmoms på ett belopp exklusive moms', () => {
    expect(vatOn(30000)).toBe(7500);
    expect(withVat(30000)).toBe(37500);
  });

  it('avrundar till hela ören', () => {
    // 333,33 kr → 83,3325 kr moms → 83,33.
    expect(vatOn(33333)).toBe(8333);
  });

  it('är noll på noll', () => {
    expect(vatOn(0)).toBe(0);
  });
});

describe('vatPercent', () => {
  it('är 25 utan konfiguration', () => {
    expect(vatPercent()).toBe(DEFAULT_VAT_PERCENT);
    expect(DEFAULT_VAT_PERCENT).toBe(25);
  });

  it('går att ställa om', () => {
    process.env.VAT_PERCENT = '12';
    expect(vatPercent()).toBe(12);
    expect(vatOn(10000)).toBe(1200);
  });

  it('faller tillbaka på normalsatsen vid orimliga värden', () => {
    for (const bad of ['abc', '-5', '150', '']) {
      process.env.VAT_PERCENT = bad;
      expect(vatPercent()).toBe(DEFAULT_VAT_PERCENT);
    }
  });
});
