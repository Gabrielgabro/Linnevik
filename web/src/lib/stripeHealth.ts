/**
 * Fungerar Stripe-nyckeln?
 *
 * En utgången eller roterad nyckel märktes förut först när en kund försökte
 * betala eller någon i admin försökte fakturera — och då som ett allmänt
 * "något gick fel". Den här kontrollen frågar Stripe med ett ofarligt
 * läsanrop och skiljer på tre lägen:
 *
 * - nyckeln fungerar (live eller test),
 * - nyckeln är ogiltig, utgången eller återkallad — larm, för inget som rör
 *   Stripe fungerar förrän någon byter den,
 * - Stripe svarar inte just nu — inget larm, det går över av sig självt.
 *
 * Svaret cachas en kort stund per process, så att en sida som visar läget inte
 * frågar Stripe vid varje laddning.
 */

import { getStripe, stripeConfigured, stripeTestMode } from '@/lib/stripe';
import { raiseAlert } from '@/lib/opsAlerts';

export type StripeKeyStatus =
  | { ok: true; mode: 'live' | 'test' }
  | { ok: false; mode: 'live' | 'test'; reason: 'missing' | 'invalid' | 'unreachable'; message: string };

const OK_TTL_MS = 10 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
let cached: { status: StripeKeyStatus; at: number } | null = null;

/** Sant för ett fel som betyder att själva nyckeln inte duger. */
export function isStripeKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: unknown; statusCode?: unknown; code?: unknown };
  return (
    candidate.type === 'StripeAuthenticationError' ||
    candidate.statusCode === 401 ||
    candidate.code === 'api_key_expired'
  );
}

function keyMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return code === 'api_key_expired'
    ? 'Stripe-nyckeln har gått ut.'
    : 'Stripe-nyckeln är ogiltig eller återkallad.';
}

/**
 * Larmar om en nyckel som inte duger. Anropas både av kontrollen och från
 * felvägarna i kassan och faktureringen, så att ett nyckelfel aldrig bara
 * blir en rad i loggen.
 */
export async function reportStripeKeyError(error: unknown, where: string): Promise<void> {
  if (!isStripeKeyError(error)) return;
  cached = null;
  await raiseAlert({
    kind: 'stripe.key',
    key: 'stripe:key',
    subject: `${keyMessage(error)} Betalningar och fakturor fungerar inte.`,
    detail: {
      läge: stripeTestMode() ? 'test' : 'live',
      upptäckt: where,
      åtgärd: 'Skapa en ny hemlig nyckel i Stripe och sätt STRIPE_SECRET_KEY i Vercel (Production), deploya om.',
    },
  }).catch(alertError => console.error('[stripeHealth] Could not raise the key alert:', alertError));
}

export async function checkStripeKey(options: { fresh?: boolean } = {}): Promise<StripeKeyStatus> {
  const mode = stripeTestMode() ? 'test' : 'live';
  if (!stripeConfigured()) {
    return { ok: false, mode, reason: 'missing', message: 'STRIPE_SECRET_KEY är inte satt.' };
  }
  if (!options.fresh && cached) {
    const ttl = cached.status.ok ? OK_TTL_MS : FAIL_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.status;
  }

  let status: StripeKeyStatus;
  try {
    await getStripe().balance.retrieve();
    status = { ok: true, mode };
  } catch (error) {
    const candidate = error as { type?: unknown };
    if (isStripeKeyError(error)) {
      status = { ok: false, mode, reason: 'invalid', message: keyMessage(error) };
      await reportStripeKeyError(error, 'nyckelkontrollen');
    } else if (candidate.type === 'StripePermissionError') {
      // En begränsad nyckel (rk_) utan läsrätt på saldot är fortfarande en
      // giltig nyckel — den fick svar, bara inte på just den frågan.
      status = { ok: true, mode };
    } else {
      status = { ok: false, mode, reason: 'unreachable', message: 'Stripe svarar inte just nu.' };
    }
  }
  cached = { status, at: Date.now() };
  return status;
}
