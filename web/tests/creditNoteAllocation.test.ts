import { describe, expect, it } from 'vitest';
import { allocateAcrossLines } from '@/lib/creditNotes';

/**
 * Fördelningen av ett kreditbelopp över fakturaraderna.
 *
 * Momsen på notan räknas ur radernas egna satser, så raderna måste bära hela
 * beloppet — och ingen rad får krediteras över vad den har kvar, eftersom
 * Stripe då avvisar hela notan.
 */
describe('allocateAcrossLines', () => {
  const lines = [
    { id: 'il_vara', remaining: 10_000 },
    { id: 'il_frakt', remaining: 2_000 },
  ];

  it('credits every line in full when the whole invoice is credited', () => {
    const allocation = allocateAcrossLines(lines, 12_000);
    expect(allocation).toEqual([
      { id: 'il_vara', amount: 10_000 },
      { id: 'il_frakt', amount: 2_000 },
    ]);
  });

  it('splits a partial credit in proportion to what each line has left', () => {
    const allocation = allocateAcrossLines(lines, 6_000);
    expect(allocation).toEqual([
      { id: 'il_vara', amount: 5_000 },
      { id: 'il_frakt', amount: 1_000 },
    ]);
  });

  it('puts the rounding remainder on the largest line and still sums exactly', () => {
    // 1 001 delat på 10 000/2 000 går inte jämnt ut. Örena som blir över efter
    // avrundningen måste ändå med, annars krediteras fel belopp.
    const allocation = allocateAcrossLines(lines, 1_001);
    expect(allocation.reduce((sum, share) => sum + share.amount, 0)).toBe(1_001);
    expect(allocation.find(share => share.id === 'il_vara')?.amount).toBe(835);
  });

  it('never credits a line past what it has left', () => {
    const allocation = allocateAcrossLines([{ id: 'il_a', remaining: 500 }], 10_000);
    expect(allocation).toEqual([{ id: 'il_a', amount: 500 }]);
  });

  it('returns nothing when there is nothing left to credit', () => {
    expect(allocateAcrossLines([], 5_000)).toEqual([]);
    expect(allocateAcrossLines(lines, 0)).toEqual([]);
  });
});
