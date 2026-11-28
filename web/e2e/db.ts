import { neon } from '@neondatabase/serverless';

/**
 * Databasen flödestesterna läser och skriver. Den måste vara samma gren som
 * servern under test använder, och den får aldrig vara produktionens.
 */
export function e2eSql() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error('E2E_DATABASE_URL saknas: ange adressen till testets databasgren.');
  const host = (value: string | undefined) => (value ? new URL(value).host : null);
  if (host(url) === host(process.env.DATABASE_URL)) {
    throw new Error('E2E_DATABASE_URL pekar på samma databas som DATABASE_URL i .env.local (produktionen). Avbryter.');
  }
  return neon(url);
}

/** Ett giltigt, unikt svenskt organisationsnummer (Luhn), t.ex. "556123-4567". */
export function uniqueOrgNumber(): string {
  const body = `556${String(Date.now()).slice(-6)}`;
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    let digit = Number(body[i]) * (i % 2 === 0 ? 2 : 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body.slice(0, 6)}-${body.slice(6)}${check}`;
}
