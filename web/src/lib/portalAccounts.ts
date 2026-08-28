/**
 * Webbkontona i Linneviks inloggningsportal.
 *
 * Skilt från clients.ts därför att det är två olika register: där ligger
 * tvätterikunderna — företagen säljarbetet handlar om — här ligger de personer
 * som faktiskt har skrivit in sig i portalen och kan logga in. Ett företag kan
 * ha flera konton, och ett konto hör alltid till exakt ett företag.
 *
 * Typen och hjälpfunktionerna ligger här, utan databasimporter, så att
 * listkomponenten kan använda dem utan att dra med sig drivrutinen ut i
 * webbläsarpaketet. Frågorna finns i clientsDb.ts.
 */

export type PortalAccount = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  taxId: string | null;
  status: string;
  createdAt: string;
  clientId: number;
  clientName: string;
  customerNo: string | null;
  stripeCustomerId: string | null;
  shopifyCustomerId: string | null;
  orderCount: number;
  spendMinor: number;
  lastOrderAt: string | null;
  /** Senaste inlösta inloggningslänken. Null = kontot har aldrig använts. */
  lastLoginAt: string | null;
};

/**
 * Varifrån kontot kom. Det finns ingen kolumn för det — men de tre vägarna in
 * lämnar olika spår: Shopify-importen bär ett shopify-id, kassan skapar kunden
 * med ett Stripe-id, och registreringsformuläret i portalen skapar raden utan
 * något av dem (se registerCustomer i commerceOperations.ts).
 */
export type AccountOrigin = 'portal' | 'checkout' | 'import';

export function accountOrigin(account: {
  stripeCustomerId: string | null;
  shopifyCustomerId: string | null;
}): AccountOrigin {
  if (account.shopifyCustomerId) return 'import';
  if (account.stripeCustomerId) return 'checkout';
  return 'portal';
}

export const ORIGIN_LABEL: Record<AccountOrigin, string> = {
  portal: 'Portalen',
  checkout: 'Kassan',
  import: 'Import',
};

export const ORIGIN_COLOR: Record<AccountOrigin, string> = {
  portal: 'var(--adm-ok)',
  checkout: 'var(--adm-info)',
  import: 'var(--viz-ink-3)',
};

/** Namnet på kontot, med e-posten som reserv när fälten står tomma. */
export function accountName(account: PortalAccount): string {
  return [account.firstName, account.lastName].filter(Boolean).join(' ') || account.email;
}

/** Kort datum utan klockslag — listan jämför dagar, inte minuter. */
export function shortDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
}
