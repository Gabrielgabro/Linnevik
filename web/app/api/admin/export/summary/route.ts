import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminRoute';
import { vatSummary } from '@/lib/bookkeepingExport';

export const runtime = 'nodejs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Summorna för perioden, visade innan filen laddas ner. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const from = request.nextUrl.searchParams.get('from') ?? '';
  const to = request.nextUrl.searchParams.get('to') ?? '';
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: 'Ogiltig period.' }, { status: 400 });
  }

  return NextResponse.json({ summary: await vatSummary({ from, to }) });
}
