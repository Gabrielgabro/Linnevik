import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import { getDb } from '@/lib/db';
import { priceSuggestions } from '@/lib/db/schema';

export const runtime = 'nodejs';

async function currentUser(request: NextRequest) {
  return readSessionValue(request.cookies.get(ADMIN_COOKIE)?.value);
}

/**
 * Allas levande prisförslag, ett per person. Sorterat på namn och inte på tid,
 * så att kolumnerna i jämförelsetabellen står stilla när någon sparar om.
 */
export async function GET(request: NextRequest) {
  if (!(await currentUser(request))) {
    return NextResponse.json({ error: 'Inte inloggad.' }, { status: 401 });
  }

  const rows = await getDb().select().from(priceSuggestions).orderBy(asc(priceSuggestions.user));

  return NextResponse.json({ suggestions: rows });
}

/**
 * Spara den inloggade personens priser. Skriver över personens befintliga
 * förslag — var och en har exakt ett levande bud, och den som sparar igen
 * ändrar sitt eget i stället för att lägga ännu ett i högen.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Inte inloggad.' }, { status: 401 });
  }

  let prices: unknown;
  let label: unknown;
  try {
    const body = await request.json();
    prices = body?.prices;
    label = body?.label;
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa förfrågan.' }, { status: 400 });
  }

  if (
    typeof prices !== 'object' ||
    prices === null ||
    Array.isArray(prices) ||
    !Object.entries(prices).every(
      ([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v >= 0
    )
  ) {
    return NextResponse.json({ error: 'Ogiltiga priser.' }, { status: 400 });
  }

  const cleanLabel = typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : null;

  const [row] = await getDb()
    .insert(priceSuggestions)
    .values({ user, label: cleanLabel, prices: prices as Record<string, number> })
    .onConflictDoUpdate({
      target: priceSuggestions.user,
      set: { label: cleanLabel, prices: prices as Record<string, number>, updatedAt: new Date() },
    })
    .returning();

  await record(user, 'suggestion.saved', String(row.id), {
    label: row.label,
    products: Object.keys(row.prices).length,
    // Priserna loggas med, så att aktivitetsloggen bär historiken tabellen
    // inte längre gör.
    prices: row.prices,
  });

  return NextResponse.json({ suggestion: row });
}

/**
 * Ta bort ett förslag. Var och en råder över sitt eget — att kunna radera
 * någon annans bud mitt i en prisdiskussion vore fel sorts befogenhet.
 */
export async function DELETE(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Inte inloggad.' }, { status: 401 });
  }

  const target = request.nextUrl.searchParams.get('user') ?? user;
  if (target !== user) {
    return NextResponse.json({ error: 'Du kan bara ta bort ditt eget förslag.' }, { status: 403 });
  }

  const [row] = await getDb()
    .delete(priceSuggestions)
    .where(eq(priceSuggestions.user, user))
    .returning();

  if (!row) {
    return NextResponse.json({ error: 'Du har inget sparat förslag.' }, { status: 404 });
  }

  await record(user, 'suggestion.removed', String(row.id), { label: row.label });

  return NextResponse.json({ removed: row.id });
}
