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

export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Kunde inte läsa förfrågan.');
  }
  return body as Record<string, unknown>;
}

/** Numeriskt id ur en dynamisk rutt. Returnerar null när det inte är ett tal. */
export function routeId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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
    const candidate = cursor as { constraint?: string; code?: string; cause?: unknown };
    if (candidate.constraint === constraint) return true;
    cursor = candidate.cause;
  }
  return false;
}
