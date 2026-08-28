/**
 * Ratbegränsning med fasta fönster.
 *
 * Tre ändpunkter var helt oskyddade: adminspärren (ett delat lösenord, med en
 * fördröjning på 600 ms som enda broms mot gissningar), kontaktformuläret och
 * provbeställningarna — de två sista utan inloggning och med ett e-postutskick
 * i andra änden. Magic link-inloggningen räknade redan sina försök mot sin
 * egen tokentabell; det här är den gemensamma varianten.
 *
 * Fast fönster och inte glidande, med flit: en enda upsert, inga rader per
 * försök, och beteendet går att förklara för den som blir begränsad. Ett
 * glidande fönster hade varit rättvisare i kanten och kostat en tabell som
 * växer med trafiken.
 *
 * **Felar öppet.** Kan hinken inte läsas släpps anropet igenom. En databas som
 * ligger nere ska inte kunna stänga kontaktformuläret — och för adminspärren
 * är lösenordet fortfarande kvar som skydd.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export type RateLimitResult = {
  allowed: boolean;
  /** Försök kvar i fönstret. Noll när det tagit slut. */
  remaining: number;
  /** Sekunder tills fönstret öppnas igen. */
  retryAfterSeconds: number;
};

/**
 * Avsändarens IP bakom Vercels proxy. Första adressen i `x-forwarded-for` är
 * klienten; resten är hopp på vägen och går att sätta själv, så bara den
 * första duger som nyckel.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

export async function checkRateLimit(input: {
  /** Vad som begränsas, t.ex. `admin_login`. Slås ihop med `identity`. */
  scope: string;
  /** Vem som begränsas — oftast en IP, ibland en e-postadress. */
  identity: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const open: RateLimitResult = {
    allowed: true,
    remaining: input.limit,
    retryAfterSeconds: 0,
  };
  if (!process.env.DATABASE_URL) return open;

  const bucket = `${input.scope}:${input.identity}`.slice(0, 200);
  try {
    const result = await getDb().execute(sql`
      insert into rate_limits (bucket, count, expires_at)
      values (${bucket}, 1, now() + make_interval(secs => ${input.windowSeconds}))
      on conflict (bucket) do update
        set count = case
              when rate_limits.expires_at <= now() then 1
              else rate_limits.count + 1
            end,
            expires_at = case
              when rate_limits.expires_at <= now()
                then now() + make_interval(secs => ${input.windowSeconds})
              else rate_limits.expires_at
            end
      returning count, extract(epoch from (expires_at - now()))::int as retry_after
    `);
    const row = result.rows[0] as { count: number; retry_after: number } | undefined;
    if (!row) return open;

    const count = Number(row.count);
    return {
      allowed: count <= input.limit,
      remaining: Math.max(0, input.limit - count),
      retryAfterSeconds: Math.max(0, Number(row.retry_after)),
    };
  } catch (error) {
    console.error('[rateLimit] Kunde inte räkna försöket:', error);
    return open;
  }
}

/**
 * Läser hinken utan att räkna upp den.
 *
 * Finns för inloggningen: där ska bara *misslyckade* försök kosta något.
 * Räknades varje anrop kunde tio lyckade inloggningar från samma kontor låsa
 * den elfte i en kvart, vilket är ett driftstopp och inget skydd.
 *
 * Felar öppet på samma sätt som checkRateLimit.
 */
export async function peekRateLimit(input: {
  scope: string;
  identity: string;
  limit: number;
}): Promise<RateLimitResult> {
  const open: RateLimitResult = { allowed: true, remaining: input.limit, retryAfterSeconds: 0 };
  if (!process.env.DATABASE_URL) return open;

  const bucket = `${input.scope}:${input.identity}`.slice(0, 200);
  try {
    const result = await getDb().execute(sql`
      select count, extract(epoch from (expires_at - now()))::int as retry_after
        from rate_limits
       where bucket = ${bucket} and expires_at > now()
    `);
    const row = result.rows[0] as { count: number; retry_after: number } | undefined;
    if (!row) return open;

    const count = Number(row.count);
    return {
      allowed: count < input.limit,
      remaining: Math.max(0, input.limit - count),
      retryAfterSeconds: Math.max(0, Number(row.retry_after)),
    };
  } catch (error) {
    console.error('[rateLimit] Kunde inte läsa hinken:', error);
    return open;
  }
}

/** Städar bort utgångna hinkar. Anropas av dygnskörningen. */
export async function pruneRateLimits(): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const result = await getDb().execute(sql`
      delete from rate_limits where expires_at <= now() - interval '1 day' returning bucket
    `);
    return result.rows.length;
  } catch (error) {
    console.error('[rateLimit] Kunde inte städa hinkarna:', error);
    return 0;
  }
}
