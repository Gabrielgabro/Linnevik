/**
 * Belopp lagras i minorenheter (öre) överallt — i `price_minor`, i orderraderna
 * och i det vi skickar till Stripe. Formateringen ligger här så att den ser
 * likadan ut i adminvyn som på kvittot.
 *
 * Ingen server-import: filen används av klientkomponenter.
 */

export function formatMinor(minor: number, currency = 'sek', locale = 'sv'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    // Öre visas bara när de finns. Priserna är i regel jämna kronor, och
    // ",00" på varje rad gör en lista svårare att läsa än den behöver vara.
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Kronor som skrivits i ett fält, till öre. NaN när fältet inte är ett tal. */
export function toMinor(input: string | number): number {
  const value = typeof input === 'number' ? input : Number(String(input).replace(',', '.'));
  return Math.round(value * 100);
}
