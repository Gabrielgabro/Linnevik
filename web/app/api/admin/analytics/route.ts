/**
 * Besökssiffrorna till adminvyn. Läser bara — allt som ändras finns inte här.
 *
 * Rutten ligger under /api och därmed utanför proxyns matcher, så sessionen
 * kontrolleras här och inte i proxy.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyticsConfigured, analyticsSummary, parseRange } from '@/lib/analyticsDb';
import { requireAdmin } from '@/lib/adminRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  if (!analyticsConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL saknas.' }, { status: 503 });
  }

  const range = parseRange(request.nextUrl.searchParams.get('range'));
  try {
    const summary = await analyticsSummary(range);
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[analytics] Kunde inte läsa statistiken:', error);
    return NextResponse.json({ error: 'Kunde inte läsa statistiken.' }, { status: 500 });
  }
}
