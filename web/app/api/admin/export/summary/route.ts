import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminRoute';
import { vatSummary } from '@/lib/bookkeepingExport';
import { isCalendarDate } from '@/lib/isoDate';

export const runtime = 'nodejs';

/** Summorna för perioden, visade innan filen laddas ner. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const from = request.nextUrl.searchParams.get('from') ?? '';
  const to = request.nextUrl.searchParams.get('to') ?? '';
  // isCalendarDate och inte bara formen: 2026-02-31 och 0000-00-00 har rätt
  // form, nådde fram till PostgreSQL och kom tillbaka som ett 500.
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    return NextResponse.json({ error: 'Ogiltig period.' }, { status: 400 });
  }

  return NextResponse.json({ summary: await vatSummary({ from, to }) });
}
