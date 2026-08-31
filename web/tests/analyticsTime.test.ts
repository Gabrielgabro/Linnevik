import { describe, expect, it } from 'vitest';
import { instantOfLocal, localDayKey, localHourKey, startOfLocalDay, nextDayKey } from '@/lib/analyticsTime';

describe('analyticsTime', () => {
  it('vintertid är UTC+1', () => {
    expect(instantOfLocal(2026, 1, 15).toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });
  it('sommartid är UTC+2', () => {
    expect(instantOfLocal(2026, 7, 15).toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });
  it('dygnsstart över sommartidsväxlingen', () => {
    // 29 mars 2026 är växlingsdygnet: 23 timmar långt.
    expect(startOfLocalDay(new Date('2026-03-29T12:00:00Z')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });
  it('nycklar i lokal tid', () => {
    expect(localDayKey(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
    expect(localHourKey(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15T00:00');
    expect(localDayKey(new Date('2026-01-15T00:30:00Z'))).toBe('2026-01-15');
  });
  it('nästa dygn över månadsskifte', () => {
    expect(nextDayKey('2026-02-28')).toBe('2026-03-01');
  });
});
