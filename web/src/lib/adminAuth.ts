/**
 * Adminspärr för /admin.
 *
 * Medvetet skild från kundinloggningen: en kundsession får aldrig ge tillgång
 * till adminvyn.
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

/** Delat lösenord, men var och en väljer sitt namn vid inloggning. */
export const ADMIN_USERS = ['Gabriel', 'Johan', 'Ahron'] as const;
export type AdminUser = (typeof ADMIN_USERS)[number];

export function isAdminUser(value: unknown): value is AdminUser {
  return typeof value === 'string' && (ADMIN_USERS as readonly string[]).includes(value);
}

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

export async function createSessionValue(user: AdminUser): Promise<{ value: string; maxAge: number }> {
  const secret = requireEnv('ADMIN_SESSION_SECRET');
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  // Namnet är inte hemligt, men signeras ändå så att kakan inte går att
  // pilla i för att låtsas vara någon annan.
  const payload = `${expires}.${user}`;
  return {
    value: `${payload}.${await sign(payload, secret)}`,
    maxAge: SESSION_HOURS * 60 * 60,
  };
}

/** Verifierar sessionskakan. Anropas från middleware och från serverkomponenter. */
export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  return Boolean(await readSessionValue(value));
}

/** Som verifySessionValue, men returnerar vem som är inloggad. */
export async function readSessionValue(value: string | undefined): Promise<AdminUser | null> {
  if (!value) return null;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [expiresRaw, user, signature] = parts;
  const payload = `${expiresRaw}.${user}`;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  if (!isAdminUser(user)) return null;

  return safeEqual(await sign(payload, secret), signature) ? user : null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
