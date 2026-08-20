import { describe, expect, it } from 'vitest';
import { commerceCustomerNo } from '@/lib/commerceCustomer';
import { actionLabel } from '@/lib/adminActivity';

describe('unified customer register', () => {
  it('creates a stable, normalized fallback customer number for a web account', () => {
    const number = commerceCustomerNo('  Anna@Linnevik.SE ');
    expect(number).toMatch(/^WEB-[A-F0-9]{12}$/);
    expect(number).toBe(commerceCustomerNo('anna@linnevik.se'));
    expect(number).not.toBe(commerceCustomerNo('another@linnevik.se'));
  });

  it('describes commerce changes as changes on a customer web account', () => {
    expect(actionLabel('customer.created')).toBe('La till webbkonto på kund');
    expect(actionLabel('customer.updated')).toBe('Ändrade webbkonto på kund');
  });
});
