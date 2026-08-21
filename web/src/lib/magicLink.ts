/**
 * E-postlänksinloggning för kunder — den mekanism migrationsplanen beskriver
 * som ersättning för Shopifys kundinloggning ("signed, single-use, expiring
 * email magic links").
 *
 * Detta är nu den enda aktiva kundinloggningen. Sessionen som skapas här läses
 * av customerAccount.ts och de skyddade kontosidorna.
 *
 * ---------------------------------------------------------------------------
 * VARFÖR LÄNKEN INTE LOGGAR IN VID FÖRSTA HÄMTNINGEN (GET)
 *
 * E-postsäkerhetsfilter — Microsoft Defender for Office 365 (Safe Links) är
 * det som spelar roll här, eftersom kunderna till stor del sitter på
 * Microsoft 365 — hämtar länkar i inkommande mejl automatiskt för att
 * kontrollera dem innan mottagaren ser mejlet. Det är en GET, inte ett klick.
 * En engångstoken som löstes in vid GET skulle alltså vara förbrukad av
 * filtret innan människan bakom inkorgen någonsin hann klicka, och mötas av
 * "länken är redan använd".
 *
 * Lösningen är att GET aldrig konsumerar. Länken går till en sida som visar en
 * knapp; själva inlösen sker först vid ett explicit klick, som skickar ett
 * POST-anrop. Säkerhetsfilter kör inte JavaScript och skickar inte formulär —
 * de ser bara en vanlig sida.
 *
 * Som ett andra skyddslager är även konsumtionen (claimMagicLinkToken)
 * idempotent inom ett kort fönster: skickas samma POST två gånger — en
 * nätverksretry, ett dubbelklick — ger den andra samma session i stället för
 * ett fel. Det skyddar inte mot filterproblemet i sig (som löses av att GET
 * inte konsumerar), men gör inlösen tålig mot dubbla anrop i allmänhet.
 * ---------------------------------------------------------------------------
 */

import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mailConfigured, sendEmail } from '@/lib/mailer';
import { magicLinkEmail } from '@/lib/emailTemplates';

const TOKEN_TTL_MINUTES = 15;
const REPLAY_WINDOW_MINUTES = 2;

// Generöst nog för en kund som letar upp mejlet i skräpposten och ber om ett
// nytt, snålt nog för att en skriptad förfrågan inte kan bombardera en
// inkorg. Two separate limits: en adress kan inte begäras sönder, och en
// enda avsändar-IP kan inte begära länkar till många adresser i följd.
const MAX_PER_EMAIL_WINDOW = 5;
const MAX_PER_IP_WINDOW = 20;
const RATE_LIMIT_WINDOW_MINUTES = 15;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://linnevik.se';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Samma pragmatiska mönster som resten av kodbasen (login/actions.ts): inte en
// fullständig RFC 5322-validering, bara tillräckligt för att avvisa uppenbart
// trasig indata innan den når databasen.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email) && email.length <= 254;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** URL-säker slumpad token. 32 byte — samma styrka som Stripes webhook-hemligheter. */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

async function withinRateLimit(email: string, ip: string | null): Promise<boolean> {
  const db = getDb();
  const [emailCount, ipCount] = await Promise.all([
    db.execute(sql`
      select count(*)::int as n from customer_login_tokens
      where email = ${email} and created_at > now() - make_interval(mins => ${RATE_LIMIT_WINDOW_MINUTES})
    `),
    ip
      ? db.execute(sql`
          select count(*)::int as n from customer_login_tokens
          where requested_ip = ${ip} and created_at > now() - make_interval(mins => ${RATE_LIMIT_WINDOW_MINUTES})
        `)
      : Promise.resolve({ rows: [{ n: 0 }] } as { rows: Array<{ n: number }> }),
  ]);
  const byEmail = Number((emailCount.rows[0] as { n: number } | undefined)?.n ?? 0);
  const byIp = Number((ipCount.rows[0] as { n: number } | undefined)?.n ?? 0);
  return byEmail < MAX_PER_EMAIL_WINDOW && byIp < MAX_PER_IP_WINDOW;
}

/**
 * Begär en inloggningslänk. Svarar alltid likadant till anroparen oavsett
 * utfall — se api/auth/magic-link/route.ts — så att svaret aldrig avslöjar om
 * en adress finns som kund eller om den just blivit ratbegränsad. Det som
 * skiljer utfallen syns bara i loggen.
 *
 * Skapar inte ett kundkonto. Det här är inloggning, inte registrering —
 * registreringen samlar in företagsuppgifter enligt B2B-kraven i planen och
 * hör hemma i handleRegister, inte här.
 */
export async function requestMagicLink(input: {
  email: string;
  locale: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email)) return;

  try {
    if (!(await withinRateLimit(email, input.ip))) {
      console.warn('[magicLink] Ratbegränsad förfrågan för', email);
      return;
    }

    const db = getDb();
    const customer = await db.execute(sql`
      select id from customers where lower(email) = ${email} limit 1
    `);
    const row = customer.rows[0] as { id: number } | undefined;
    if (!row) {
      // Ingen kund med den adressen. Svarar tyst — se funktionskommentaren.
      return;
    }

    const rawToken = generateToken();
    await db.execute(sql`
      insert into customer_login_tokens (
        customer_id, token_hash, email, requested_ip, user_agent, expires_at
      ) values (
        ${row.id}, ${hashToken(rawToken)}, ${email}, ${input.ip}, ${input.userAgent},
        now() + make_interval(mins => ${TOKEN_TTL_MINUTES})
      )
    `);

    if (!mailConfigured()) {
      console.warn('[magicLink] SMTP är inte konfigurerat — ingen länk skickad till', email);
      return;
    }

    const url = `${SITE}/${input.locale}/login/verify?token=${encodeURIComponent(rawToken)}`;
    const message = magicLinkEmail(url);
    const result = await sendEmail({ to: email, subject: message.subject, html: message.html });
    if (!result.success) {
      console.error('[magicLink] Kunde inte skicka länken till', email, result.error);
    }
  } catch (error) {
    // Precis som orderEmails.ts: anropet får aldrig fälla den som väntar på
    // det generiska svaret. Felet stannar i loggen.
    console.error('[magicLink] requestMagicLink misslyckades:', error);
  }
}

export type ClaimResult =
  | { status: 'ok'; customerId: number }
  | { status: 'invalid' }
  | { status: 'expired' };

/**
 * Löser in en token. Atomär: `UPDATE ... WHERE consumed_at IS NULL RETURNING`
 * gör att två samtidiga anrop mot samma token inte båda kan lyckas — den
 * andra ser att raden redan är låst och faller igenom till
 * replay-fönstret nedan i stället för att skapa en andra session.
 */
export async function claimMagicLinkToken(rawToken: string): Promise<ClaimResult> {
  if (!rawToken || rawToken.length > 512) return { status: 'invalid' };
  const hash = hashToken(rawToken);
  const db = getDb();

  const claimed = await db.execute(sql`
    update customer_login_tokens
    set consumed_at = now()
    where token_hash = ${hash} and consumed_at is null and expires_at > now()
    returning customer_id
  `);
  const claimedRow = claimed.rows[0] as { customer_id: number } | undefined;
  if (claimedRow) {
    return { status: 'ok', customerId: Number(claimedRow.customer_id) };
  }

  // Redan förbrukad — men om det var alldeles nyss, av samma token, svara
  // som om det lyckades. Se filkommentaren om varför: ett dubbelt POST ska
  // inte visa ett felmeddelande för en kund som redan är inloggad.
  const recent = await db.execute(sql`
    select customer_id, expires_at, consumed_at from customer_login_tokens
    where token_hash = ${hash}
      and consumed_at is not null
      and consumed_at > now() - make_interval(mins => ${REPLAY_WINDOW_MINUTES})
    limit 1
  `);
  const recentRow = recent.rows[0] as { customer_id: number } | undefined;
  if (recentRow) {
    return { status: 'ok', customerId: Number(recentRow.customer_id) };
  }

  const existing = await db.execute(sql`
    select expires_at from customer_login_tokens where token_hash = ${hash} limit 1
  `);
  if (existing.rows.length === 0) return { status: 'invalid' };
  return { status: 'expired' };
}
