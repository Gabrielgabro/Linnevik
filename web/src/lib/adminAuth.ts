/**
 * Adminspärr för /admin.
 *
 * Medvetet skild från Shopify-inloggningen i customerAccountAuth.ts: den
 * autentiserar *kunder*, så vilken kund som helst hade kommit in i adminvyn.
 *
 * Modellen är ett delat lösenord som växlas mot en signerad sessionskaka.
 * Lösenordet lämnar aldrig servern och kakan innehåller inget hemligt — bara
 * en utgångstid och en HMAC över den. Web Crypto används genomgående så att
 * middleware kan verifiera kakan på edge-runtime.
 *
 * Kräver två miljövariabler:
 *   ADMIN_PASSWORD        lösenordet som delas med behöriga
 *   ADMIN_SESSION_SECRET  slumpad sträng, minst 32 tecken
 */

export const ADMIN_COOKIE = 'linnevik_admin';
const SESSION_HOURS = 12;

const enc = new TextEncoder();

function requireEnv(name: 'ADMIN_PASSWORD' | 'ADMIN_SESSION_SECRET'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} saknas. Sätt den i .env.local för lokal körning och i Vercels projektinställningar för deploy.`
    );
  }
  return value;
}

export function adminAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Jämförelse som inte läcker via svarstid. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = requireEnv('ADMIN_PASSWORD');
  // Hasha båda sidor först, så att jämförelsen sker över lika långa strängar
  // oavsett vad som skickats in.
  const secret = requireEnv('ADMIN_SESSION_SECRET');
  const [a, b] = await Promise.all([sign(candidate, secret), sign(expected, secret)]);
  return safeEqual(a, b);
}

export async function createSessionValue(): Promise<{ value: string; maxAge: number }> {
  const secret = requireEnv('ADMIN_SESSION_SECRET');
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expires);
  return {
    value: `${payload}.${await sign(payload, secret)}`,
    maxAge: SESSION_HOURS * 60 * 60,
  };
}

/** Verifierar sessionskakan. Anropas från middleware och från serverkomponenter. */
export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;

  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;

  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  return safeEqual(await sign(payload, secret), signature);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
