import { desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import { getDb } from '@/lib/db';
import { priceSuggestions } from '@/lib/db/schema';

export const runtime = 'nodejs';

async function currentUser(request: NextRequest) {
  return readSessionValue(request.cookies.get(ADMIN_COOKIE)?.value);
}

/** Lista sparade prisförslag, senast sparade först. */
export async function GET(request: NextRequest) {
  if (!(await currentUser(request))) {
    return NextResponse.json({ error: 'Inte inloggad.' }, { status: 401 });
  }

  const rows = await getDb()
    .select()
    .from(priceSuggestions)
    .orderBy(desc(priceSuggestions.createdAt))
    .limit(100);

  return NextResponse.json({ suggestions: rows });
}

/** Spara den inloggade personens aktuella priser som ett förslag. */
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
    !Object.entries(prices).every(([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v))
  ) {
    return NextResponse.json({ error: 'Ogiltiga priser.' }, { status: 400 });
  }

  const [row] = await getDb()
    .insert(priceSuggestions)
    .values({
      user,
      label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : null,
      prices: prices as Record<string, number>,
    })
    .returning();

  await record(user, 'suggestion.saved', String(row.id), {
    label: row.label,
    products: Object.keys(row.prices).length,
  });

  return NextResponse.json({ suggestion: row });
}
