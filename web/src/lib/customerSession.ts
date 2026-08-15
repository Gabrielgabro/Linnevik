/**
 * Sessionskaka för kunder som loggat in via e-postlänk.
 *
 * Medvetet skild från adminAuth.ts (annan hemlighet, annan kaka) och från
 * Shopifys egen kundinloggning i customerAccount.ts — de tre systemen ska
 * kunna kompromissas var för sig utan att de andra faller.
 *
 * Samma modell som adminAuth.ts: kakan bär bara ett kund-id och en
 * utgångstid, signerade med HMAC. Inget hemligt i kakan, inget att slå upp
 * för att verifiera den. Web Crypto genomgående så att den går att läsa i
 * middleware på edge-runtime.
 *
 * Kräver CUSTOMER_SESSION_SECRET — en egen slumpad sträng, minst 32 tecken,
 * skild från ADMIN_SESSION_SECRET.
 */

export const CUSTOMER_SESSION_COOKIE = 'linnevik_customer';

// Kortare än adminsessionen (12h): en admin sitter vid datorn under ett pass,
// men en inköpare loggar in för att lägga en order och ska slippa göra om det
// varje gång under en säsong.
const SESSION_DAYS = 30;

const enc = new TextEncoder();

export function customerSessionConfigured(): boolean {
  return Boolean(process.env.CUSTOMER_SESSION_SECRET);
}

function requireSecret(): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'CUSTOMER_SESSION_SECRET saknas. Sätt den i .env.local för lokal körning och i Vercels projektinställningar för deploy.'
    );
  }
  return secret;
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

export async function createCustomerSessionValue(
  customerId: number
): Promise<{ value: string; maxAge: number }> {
  const secret = requireSecret();
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${expires}.${customerId}`;
  return {
    value: `${payload}.${await sign(payload, secret)}`,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/** Läser kakan. Returnerar kund-id:t, eller null om den saknas/gått ut/är fel signerad. */
export async function readCustomerSessionValue(value: string | undefined): Promise<number | null> {
  if (!value) return null;
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [expiresRaw, idRaw, signature] = parts;
  const payload = `${expiresRaw}.${idRaw}`;

  const expires = Number(expiresRaw);
  const customerId = Number(idRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  if (!Number.isInteger(customerId) || customerId <= 0) return null;

  return safeEqual(await sign(payload, secret), signature) ? customerId : null;
}

export const customerSessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
