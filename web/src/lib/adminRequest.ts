/**
 * Ett anrop från en adminsida till ett API, med svaret och felet i samma form
 * överallt.
 *
 * Förr gjorde varje knapp sitt eget `fetch`. Ett nätverksfel kastade då förbi
 * felhanteringen: knappen stod kvar på "Registrerar…" eller "Återbetalar…" och
 * admin visste inte om pengarna hade bokförts (plan.md, F4). Här blir varje
 * utfall ett svar som går att visa.
 */

export type AdminResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data: Record<string, unknown> };

/**
 * Nätverksfelet säger att ändringen kan ha gått igenom ändå. Svaret kan ha
 * tappats efter att servern sparat, och ett nytt klick hade då gjort det två
 * gånger.
 */
export const NETWORK_ERROR =
  'Kunde inte nå servern. Ladda om sidan och se efter om ändringen redan är gjord innan du försöker igen.';

export async function adminRequest<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; fallbackError?: string } = {}
): Promise<AdminResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR, data: {} };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof data.error === 'string' && data.error ? data.error : (init.fallbackError ?? 'Något gick fel. Försök igen.');
    return { ok: false, status: response.status, error, data };
  }
  return { ok: true, status: response.status, data: data as T };
}
