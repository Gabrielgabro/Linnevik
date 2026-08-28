import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCalendarDate } from '@/lib/isoDate';

/**
 * Kontrollerna som står mellan adminens API och PostgreSQL.
 *
 * Alla fall nedan kom tillbaka som ett 500 från en stresskörning: de tog sig
 * förbi en formkontroll och föll först i databasen. Ett 500 döljer vad som var
 * fel för den som skickade, och ett omöjligt datum som tyst blev ett annat
 * datum är värre än så.
 */
describe('isCalendarDate', () => {
  it('tar emot riktiga datum', () => {
    for (const value of ['2026-08-28', '2024-02-29', '2026-01-01', '2026-12-31']) {
      expect(isCalendarDate(value), value).toBe(true);
    }
  });

  it('avvisar datum som har rätt form men inte finns', () => {
    for (const value of ['2026-02-31', '2026-02-29', '2026-99-99', '0000-00-00', '2026-13-01', '2026-04-31']) {
      expect(isCalendarDate(value), value).toBe(false);
    }
  });

  it('avvisar allt som inte är ÅÅÅÅ-MM-DD', () => {
    for (const value of ['', '2026-8-28', '26-08-28', '2026/08/28', '2026-08-28T00:00:00Z', 'igår']) {
      expect(isCalendarDate(value), value).toBe(false);
    }
  });
});

describe('routeId', () => {
  // Importeras lat: adminRoute drar in next/server, som inte behövs för de
  // rena kontrollerna ovan.
  async function routeId(value: string) {
    return (await import('@/lib/adminRoute')).routeId(value);
  }

  it('läser vanliga id', async () => {
    expect(await routeId('1')).toBe(1);
    expect(await routeId('2147483647')).toBe(2147483647);
  });

  it('avvisar tal som PostgreSQL inte kan lagra som integer', async () => {
    expect(await routeId('2147483648')).toBeNull();
    expect(await routeId('9007199254740992')).toBeNull();
  });

  it('avvisar allt som inte är rena siffror', async () => {
    // "1e2" tolkades förr som id 100 och "007" som 7.
    for (const value of ['1e2', '007', '0', '-1', '1.5', ' 1', '', 'abc', 'NaN', 'Infinity']) {
      expect(await routeId(value), value).toBeNull();
    }
  });
});

describe('isUniqueViolation', () => {
  async function check(error: unknown, constraint: string) {
    return (await import('@/lib/adminRoute')).isUniqueViolation(error, constraint);
  }

  it('hittar indexnamnet där drizzle lagt det, i cause', async () => {
    const wrapped = new Error('Failed query', {
      cause: Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'clients_customer_no_key',
      }),
    });
    expect(await check(wrapped, 'clients_customer_no_key')).toBe(true);
    expect(await check(wrapped, 'clients_org_number_key')).toBe(false);
  });

  it('nöjer sig med meddelandet när constraint saknas', async () => {
    const wrapped = new Error('Failed query', {
      cause: Object.assign(
        new Error('duplicate key value violates unique constraint "clients_org_number_key"'),
        { code: '23505' }
      ),
    });
    expect(await check(wrapped, 'clients_org_number_key')).toBe(true);
  });

  it('säger nej till fel som inte är en krock', async () => {
    expect(await check(new Error('connection refused'), 'clients_customer_no_key')).toBe(false);
    expect(await check(null, 'clients_customer_no_key')).toBe(false);
  });
});

/**
 * Ordningen i återbetalningsrutten är det som stoppar dubbla utbetalningar,
 * och den syns inte i något returvärde. Källan läses därför direkt: beloppet
 * ska vara avbokat på ordern *innan* Stripe anropas.
 */
describe('återbetalningsrutten', () => {
  const source = readFileSync(resolve('app/api/admin/orders/[id]/refunds/route.ts'), 'utf8');

  it('bokar av beloppet före Stripe-anropet', () => {
    const claim = source.indexOf('claimRefundAmount');
    const stripe = source.indexOf('refunds.create');
    expect(claim).toBeGreaterThan(-1);
    expect(stripe).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(stripe);
  });

  it('släpper avbokningen när Stripe säger nej', () => {
    expect(source).toContain('syncRefundedTotal');
  });

  it('svarar 409 när beloppet inte längre ryms', () => {
    expect(source).toMatch(/claimRefundAmount[\s\S]{0,400}status: 409/);
  });
});

describe('återbetalningsknappen', () => {
  const source = readFileSync(resolve('src/components/admin/OrderActions.tsx'), 'utf8');

  it('låses medan anropet pågår', () => {
    expect(source).toContain('disabled={refunding}');
  });

  it('behåller samma idempotensnyckel tills återbetalningen gått igenom', () => {
    expect(source).toContain('requestKey: refundKey');
    // En ny nyckel per klick gjorde Stripes idempotens verkningslös.
    expect(source).not.toContain('requestKey: crypto.randomUUID()');
  });
});
