import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = {
  products: {
    retrieve: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
};
const execute = vi.fn();

vi.mock('@/lib/stripe', () => ({ getStripe: () => stripe }));
vi.mock('@/lib/db', () => ({ getDb: () => ({ execute }) }));

const missing = Object.assign(new Error('No such product'), { code: 'resource_missing' });

describe('ensureStripeProducts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    execute.mockResolvedValue({
      rows: [{ id: 1, handle: 'morgonrock-gap', title: 'Morgonrock', skus: 'A,B' }],
    });
  });

  it('creates a product that only exists in the other Stripe mode', async () => {
    stripe.products.retrieve.mockRejectedValue(missing);
    const { ensureStripeProducts } = await import('@/lib/stripeCatalog');

    const ids = await ensureStripeProducts(['morgonrock-gap', 'morgonrock-gap']);

    expect(ids.get('morgonrock-gap')).toBe('linnevik_morgonrock_gap');
    expect(stripe.products.create).toHaveBeenCalledTimes(1);
    expect(stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'linnevik_morgonrock_gap', active: true })
    );
  });

  it('leaves an existing active product alone but checks it on every checkout', async () => {
    stripe.products.retrieve.mockResolvedValue({ id: 'linnevik_morgonrock_gap', active: true });
    const { ensureStripeProducts } = await import('@/lib/stripeCatalog');

    await ensureStripeProducts(['morgonrock-gap']);
    await ensureStripeProducts(['morgonrock-gap']);

    expect(stripe.products.retrieve).toHaveBeenCalledTimes(2);
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('reactivates a product archived in Stripe', async () => {
    stripe.products.retrieve.mockResolvedValue({ id: 'linnevik_morgonrock_gap', active: false });
    const { ensureStripeProducts } = await import('@/lib/stripeCatalog');

    await ensureStripeProducts(['morgonrock-gap']);

    expect(stripe.products.update).toHaveBeenCalledWith(
      'linnevik_morgonrock_gap',
      expect.objectContaining({ active: true })
    );
  });

  it('creates and links a brand-new product that was never pushed to Stripe', async () => {
    stripe.products.retrieve.mockRejectedValue(missing);
    const { ensureStripeProducts } = await import('@/lib/stripeCatalog');

    await ensureStripeProducts(['morgonrock-gap']);

    expect(stripe.products.create).toHaveBeenCalledTimes(1);
    // Andra anropet är skrivningen av id:t tillbaka till produkten.
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not mask other Stripe failures as a missing product', async () => {
    stripe.products.retrieve.mockRejectedValue(
      Object.assign(new Error('Invalid API key'), { code: 'api_key_invalid' })
    );
    const { ensureStripeProducts } = await import('@/lib/stripeCatalog');

    await expect(ensureStripeProducts(['morgonrock-gap'])).rejects.toThrow('Invalid API key');
    expect(stripe.products.create).not.toHaveBeenCalled();
  });
});
