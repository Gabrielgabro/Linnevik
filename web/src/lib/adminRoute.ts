/**
 * Gemensamt förspel för adminens API-rutter: vem är inloggad, och vad står
 * det i kroppen. Rutterna under /api/admin ligger utanför middleware-matchern
 * (den hoppar över /api), så varje rutt måste kontrollera sessionen själv.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, readSessionValue, type AdminUser } from '@/lib/adminAuth';

export async function requireAdmin(
  request: NextRequest
): Promise<{ user: AdminUser } | { response: NextResponse }> {
  const user = await readSessionValue(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!user) {
    return { response: NextResponse.json({ error: 'Inte inloggad.' }, { status: 401 }) };
  }
  return { user };
}

/** En kropp som inte gick att läsa. Alltid ett 400, aldrig ett 500. */
export class BodyError extends Error {
  constructor(message = 'Kunde inte läsa förfrågan.') {
    super(message);
    this.name = 'BodyError';
  }
}

export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  // `request.json()` kastar på trasig JSON. Det felet såg likadant ut som ett
  // databasfel för rutterna ovanför och blev ett 500 — en trasig kropp är
  // avsändarens fel, så det märks som ett BodyError här i stället.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BodyError();
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BodyError();
  }
  return body as Record<string, unknown>;
}

/**
 * Kroppen, eller ett färdigt 400-svar. Samma form som `requireAdmin`, så
 * rutter som inte redan har ett try/catch slipper skaffa ett.
 */
export async function readJson(
  request: NextRequest
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  try {
    return { body: await readBody(request) };
  } catch (error) {
    const message = error instanceof BodyError ? error.message : 'Kunde inte läsa förfrågan.';
    return { response: NextResponse.json({ error: message }, { status: 400 }) };
  }
}

/** Största värdet en PostgreSQL-`integer` rymmer. */
const PG_INT_MAX = 2_147_483_647;

/**
 * Numeriskt id ur en dynamisk rutt. Returnerar null när det inte är ett tal.
 *
 * `Number()` var för tillmötesgående: "1e2" blev id 100, "007" blev 7 och
 * 9007199254740992 gick vidare till PostgreSQL, som svarade med ett fel om
 * heltalsintervallet — alltså ett 500 där ett 400 var svaret. Bara rena
 * siffror som ryms i en `integer` släpps igenom.
 */
export function routeId(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return id <= PG_INT_MAX ? id : null;
}

/**
 * Sant när felet är en krock med ett visst unikt index.
 *
 * Drizzle lindar in databasfelet, så `String(error)` innehåller inte
 * indexnamnet — det ligger på `cause`. Att leta i strängen ger därför ett
 * tyst 500 där man ville svara 409, så kedjan gås igenom i stället.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let cursor: unknown = error;
  for (let depth = 0; cursor && depth < 5; depth += 1) {
    const candidate = cursor as {
      constraint?: string;
      code?: string;
      message?: string;
      cause?: unknown;
    };
    if (candidate.constraint === constraint) return true;
    // Innersta felets text nämner indexet även när `constraint` saknas, t.ex.
    // när drivrutinen bara skickar med meddelandet.
    if (candidate.code === '23505' && candidate.message?.includes(constraint)) return true;
    cursor = candidate.cause;
  }
  return false;
}
