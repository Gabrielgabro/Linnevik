/**
 * Tidsfönster och etiketter i svensk tid.
 *
 * Statistiken räknas i Europe/Stockholm och inte i UTC, av samma skäl som
 * aktivitetsloggen: "igår" ska betyda igår för den som läser sidan. Det kostar
 * den här filen — sommartid gör att ett dygn ibland är 23 eller 25 timmar, så
 * gränserna kan inte räknas fram genom att lägga till 86 400 000 millisekunder.
 */

export const TZ = 'Europe/Stockholm';

type Parts = { year: number; month: number; day: number; hour: number };

const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});

function partsOf(instant: Date): Parts {
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  // Midnatt formateras som "24" av sv-SE med hour12: false.
  const hour = Number(found.hour) % 24;
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour,
  };
}

/** Hur långt före UTC zonen ligger vid just det ögonblicket. */
function offsetMs(instant: Date): number {
  const parts = partsOf(instant);
  const minutes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    hour12: false,
    minute: '2-digit',
  }).format(instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, Number(minutes));
  // Sekunderna är alltid lika i båda zonerna, så minutupplösning räcker.
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * Ögonblicket då klockan i Stockholm visade den här lokala tiden.
 *
 * Två varv: första gissningen använder fel avvikelse om gissningen hamnade på
 * andra sidan en sommartidsväxling, och andra varvet rättar den.
 */
export function instantOfLocal(year: number, month: number, day: number, hour = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = offsetMs(new Date(guess));
  const second = offsetMs(new Date(guess - first));
  return new Date(guess - second);
}

/** Midnatt i Stockholm det dygn ögonblicket tillhör. */
export function startOfLocalDay(instant: Date): Date {
  const parts = partsOf(instant);
  return instantOfLocal(parts.year, parts.month, parts.day);
}

/** `YYYY-MM-DD` i svensk tid — samma nyckel som SQL-frågornas `to_char`. */
export function localDayKey(instant: Date): string {
  const parts = partsOf(instant);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** `YYYY-MM-DDTHH:00` i svensk tid. */
export function localHourKey(instant: Date): string {
  const parts = partsOf(instant);
  return `${localDayKey(instant)}T${String(parts.hour).padStart(2, '0')}:00`;
}

/** Nästa dygnsnyckel efter en given. Kalenderräkning, inte millisekunder. */
export function nextDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}
