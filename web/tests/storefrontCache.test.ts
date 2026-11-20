import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath, revalidateTag }));

// record() ska tömma cachen även när loggskrivningen inte kan köras.
vi.mock('@/lib/db', () => ({
  getDb: () => {
    throw new Error('ingen databas i testet');
  },
}));

const { record } = await import('@/lib/adminActivity');

describe('butikens cache töms vid adminändringar', () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    revalidateTag.mockReset();
    vi.stubEnv('DATABASE_URL', '');
  });

  it.each(['product.updated', 'variant.updated', 'suggestion.applied', 'pricing_config.updated'] as const)(
    '%s tömmer sidorna och katalogdatan direkt',
    async action => {
      await record('admin', action, '1');
      expect(revalidatePath).toHaveBeenCalledWith('/[locale]', 'layout');
      expect(revalidateTag).toHaveBeenCalledWith('catalog', { expire: 0 });
    }
  );

  it.each(['admin.login', 'client.updated', 'order.email_resent'] as const)(
    '%s rör inte butikens cache',
    async action => {
      await record('admin', action, '1');
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    }
  );

  it('ett fel vid tömningen gör inte om en lyckad ändring till ett fel', async () => {
    revalidatePath.mockImplementation(() => {
      throw new Error('utanför en förfrågan');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(record('admin', 'product.updated', '1')).resolves.toBeUndefined();
    consoleError.mockRestore();
  });
});
