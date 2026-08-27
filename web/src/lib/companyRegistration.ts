const EU_VAT_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK', 'XI',
]);

function hasValidLuhnCheckDigit(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const sum = value.split('').reduce((total, digit, index) => {
    const multiplied = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return total + Math.floor(multiplied / 10) + (multiplied % 10);
  }, 0);
  return sum % 10 === 0;
}

/** Canonicalize separators and turn a Swedish org number into its VAT form. */
export function normalizeCompanyRegistrationNumber(input: unknown): string {
  if (typeof input !== 'string') return '';
  let value = input.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (/^\d{10}$/.test(value)) value = `SE${value}01`;
  // Greece's ISO country code is GR, but its EU VAT prefix is EL.
  if (value.startsWith('GR')) value = `EL${value.slice(2)}`;
  return value;
}

/**
 * Validate Swedish IDs fully and other EU VAT IDs structurally. Country-
 * specific validation beyond Sweden belongs in a VIES verification step.
 */
export function isValidCompanyRegistrationNumber(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(value)) return false;
  if (!EU_VAT_COUNTRY_CODES.has(value.slice(0, 2))) return false;
  if (value.startsWith('SE')) {
    return /^SE\d{12}$/.test(value)
      && value.endsWith('01')
      && hasValidLuhnCheckDigit(value.slice(2, 12));
  }
  return true;
}
