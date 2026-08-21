import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const taxRatesList = vi.fn();
const taxRatesCreate = vi.fn();
const registrationsList = vi.fn();

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    taxRates: { list: taxRatesList, create: taxRatesCreate },
    tax: { registrations: { list: registrationsList } },
  }),
}));

import {
  assertEveryAmountIsTaxed,
  checkoutTaxMode,
  refundVatMinor,
  resetVatCaches,
  swedishTaxRegistrationActive,
  vatBps,
  VatConfigurationError,
} from '@/lib/vat';

beforeEach(() => {
  // Modulmockarna lever över filens alla fall; restoreMocks rör bara spioner.
  vi.clearAllMocks();
  resetVatCaches();
  taxRatesList.mockResolvedValue({ data: [] });
  taxRatesCreate.mockResolvedValue({ id: 'txr_new' });
  registrationsList.mockResolvedValue({ data: [] });
});

afterEach(() => {
  delete process.env.STRIPE_TAX_REGISTRATION_CONFIRMED;
  delete process.env.VAT_PERCENT;
});

describe('checkoutTaxMode', () => {
  it('använder en uttrycklig sats när Stripe Tax inte är bekräftad', async () => {
    taxRatesList.mockResolvedValue({
      data: [{ id: 'txr_se', percentage: 25, inclusive: false, metadata: { linnevik_vat: 'se' } }],
    });
    await expect(checkoutTaxMode()).resolves.toEqual({
      kind: 'explicit',
      taxRateId: 'txr_se',
      percent: 25,
    });
    expect(taxRatesCreate).not.toHaveBeenCalled();
  });

  /**
   * Det tysta felet som gör flaggan farlig: Stripe Tax med noll registreringar
   * räknar fram 0 % överallt och tar in ingen moms alls, utan att något går
   * fel. Kassan ska stanna i stället.
   */
  it('vägrar automatisk moms när kontot saknar svensk registrering', async () => {
    process.env.STRIPE_TAX_REGISTRATION_CONFIRMED = 'true';
    registrationsList.mockResolvedValue({ data: [{ country: 'NO' }] });
    await expect(checkoutTaxMode()).rejects.toBeInstanceOf(VatConfigurationError);
  });

  it('använder automatisk moms när registreringen finns', async () => {
    process.env.STRIPE_TAX_REGISTRATION_CONFIRMED = 'true';
    registrationsList.mockResolvedValue({ data: [{ country: 'SE' }] });
    await expect(checkoutTaxMode()).resolves.toEqual({ kind: 'automatic', percent: 25 });
  });

  it('frågar bara Stripe en gång om en registrering som finns', async () => {
    registrationsList.mockResolvedValue({ data: [{ country: 'SE' }] });
    await swedishTaxRegistrationActive();
    await swedishTaxRegistrationActive();
    expect(registrationsList).toHaveBeenCalledTimes(1);
  });

  it('frågar igen så länge registreringen saknas', async () => {
    await swedishTaxRegistrationActive();
    await swedishTaxRegistrationActive();
    expect(registrationsList).toHaveBeenCalledTimes(2);
  });
});

const explicit = { kind: 'explicit', taxRateId: 'txr_se', percent: 25 } as const;
const line = (amount: number, taxed = true) => ({
  quantity: 1,
  ...(taxed ? { tax_rates: ['txr_se'] } : {}),
  price_data: { unit_amount: amount },
});

describe('assertEveryAmountIsTaxed', () => {
  it('släpper igenom momsade rader mot svensk leverans', () => {
    expect(() =>
      assertEveryAmountIsTaxed({
        mode: explicit,
        lineItems: [line(30000), line(4900)],
        shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 0 } } }],
        allowedCountries: ['SE'],
      })
    ).not.toThrow();
  });

  it('stoppar en orderrad utan momssats', () => {
    expect(() =>
      assertEveryAmountIsTaxed({
        mode: explicit,
        lineItems: [line(30000), line(4900, false)],
        allowedCountries: ['SE'],
      })
    ).toThrow(VatConfigurationError);
  });

  /**
   * Stripe tar inte emot en uttrycklig momssats på en fraktrad. En fraktavgift
   * som ändå ligger där hade gått ut obeskattad — det här är spärren som gör
   * att en fraktavgift inte tyst kan börja ätas ur marginalen.
   */
  it('stoppar en fraktavgift som fraktrad utan Stripe Tax', () => {
    expect(() =>
      assertEveryAmountIsTaxed({
        mode: explicit,
        lineItems: [line(30000)],
        shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 4900 } } }],
        allowedCountries: ['SE'],
      })
    ).toThrow(/orderrad med momssats/);
  });

  it('stoppar leverans utanför Sverige utan Stripe Tax', () => {
    expect(() =>
      assertEveryAmountIsTaxed({
        mode: explicit,
        lineItems: [line(30000)],
        allowedCountries: ['SE', 'NO'],
      })
    ).toThrow(/Stripe Tax/);
  });

  it('lämnar över allt till Stripe Tax i automatiskt läge', () => {
    expect(() =>
      assertEveryAmountIsTaxed({
        mode: { kind: 'automatic', percent: 25 },
        lineItems: [line(30000, false)],
        shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 4900 } } }],
        allowedCountries: ['SE', 'NO'],
      })
    ).not.toThrow();
  });
});

describe('refundVatMinor', () => {
  it('vänder hela momsen vid full återbetalning', () => {
    expect(refundVatMinor({ refundMinor: 37500, orderTaxMinor: 7500, orderTotalMinor: 37500 })).toBe(7500);
  });

  it('vänder sin andel vid delåterbetalning', () => {
    expect(refundVatMinor({ refundMinor: 18750, orderTaxMinor: 7500, orderTotalMinor: 37500 })).toBe(3750);
  });

  it('kan aldrig vända mer moms än ordern tog in', () => {
    expect(refundVatMinor({ refundMinor: 50000, orderTaxMinor: 7500, orderTotalMinor: 37500 })).toBe(7500);
  });

  it('är noll på en momsfri eller tom order', () => {
    expect(refundVatMinor({ refundMinor: 1000, orderTaxMinor: 0, orderTotalMinor: 37500 })).toBe(0);
    expect(refundVatMinor({ refundMinor: 0, orderTaxMinor: 7500, orderTotalMinor: 37500 })).toBe(0);
    expect(refundVatMinor({ refundMinor: 1000, orderTaxMinor: 7500, orderTotalMinor: 0 })).toBe(0);
  });
});

describe('vatBps', () => {
  it('sparar satsen som heltal i hundradels procent', () => {
    expect(vatBps(25)).toBe(2500);
    expect(vatBps(12.5)).toBe(1250);
  });
});
