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
  // A bare ten-digit Swedish organisation number is the same registration as
  // its VAT form; `01` is the sequence number all but a handful of companies
  // carry. A buyer who has another one types the full VAT number instead.
  if (/^\d{10}$/.test(value)) value = `SE${value}01`;
  // Samma sak en rad ned för den form som faktiskt står på svenska brevhuvuden
  // och webbplatser: "SE556481-3318", momsprefixet utan löpnumret. Den skrevs
  // förut igenom orörd och föll sedan på formatkontrollen, så en kund fick
  // veta att hens eget momsnummer var ogiltigt.
  else if (/^SE\d{10}$/.test(value)) value = `${value}01`;
  // Tolv siffror utan prefix lämnas som de är, och faller på kontrollen nedan.
  // De går att läsa på två sätt — "16" + organisationsnummer, som Bolagsverket
  // och SIE-filer skriver det, eller momsnumret utan SE. Var tionde
  // sekelprefixad post är ett giltigt momsnummer i den andra tolkningen, och
  // en gissning som slår fel lägger företaget under fel nyckel. Organisations-
  // numret är hela kontoträdets nyckel; ett felmeddelande är billigare än en
  // dubblett.
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
    // SE + a Luhn-checked ten-digit organisation number + a two-digit sequence
    // number. The sequence is `01` for a single registration, but a VAT group
    // or a branch registration legitimately carries `02`, `03`, and so on —
    // requiring `01` locked those companies out of registering at all.
    return /^SE\d{12}$/.test(value) && hasValidLuhnCheckDigit(value.slice(2, 12));
  }
  return true;
}

/**
 * Organisationsnumret som står bakom ett svenskt momsregistreringsnummer,
 * skrivet på den form Bolagsverket och en svensk faktura använder: 556481-3318.
 *
 * Det vi lagrar är momsnumret (SE556481331801) — det är formen Stripe vill ha
 * och den enda som fungerar utanför Sverige. På fakturan är de två ändå skilda
 * uppgifter, och att skriva ut momsnumret under rubriken "Organisationsnummer"
 * är helt enkelt fel. Returnerar null för allt som inte är svenskt.
 */
export function swedishOrganizationNumber(registrationNumber: string): string | null {
  if (!/^SE\d{12}$/.test(registrationNumber)) return null;
  const digits = registrationNumber.slice(2, 12);
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}
