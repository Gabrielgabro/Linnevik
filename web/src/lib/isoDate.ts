/**
 * Datum som text, kontrollerade mot kalendern.
 *
 * `/^\d{4}-\d{2}-\d{2}$/` säger bara att siffrorna står på rätt platser. Den
 * släpper igenom 2026-02-31, 2026-99-99 och 0000-00-00, som sedan går hela
 * vägen ner till PostgreSQL och kommer tillbaka som ett 500 — eller, värre,
 * tyst glider vidare till 3 mars när `new Date()` får rulla över månaden.
 * Kontrollen nedan jämför mot det datum strängen faktiskt beskriver.
 */

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Sant bara när strängen är ÅÅÅÅ-MM-DD *och* dagen finns i kalendern. */
export function isCalendarDate(value: string): boolean {
  const match = SHAPE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Rullade datumet över till nästa månad var dagen inte giltig från början.
  return (
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  );
}
