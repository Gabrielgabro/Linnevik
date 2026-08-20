import { createHash } from 'node:crypto';

/** Stabilt reservnummer för webbkonton som ännu saknar ett riktigt kundnummer. */
export function commerceCustomerNo(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `WEB-${createHash('sha256').update(normalized).digest('hex').slice(0, 12).toUpperCase()}`;
}
