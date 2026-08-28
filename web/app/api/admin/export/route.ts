import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { requireAdmin } from '@/lib/adminRoute';
import { ordersCsv, refundsCsv } from '@/lib/bookkeepingExport';
import { catalogCsv } from '@/lib/catalogExport';
import { isCalendarDate } from '@/lib/isoDate';

export const runtime = 'nodejs';

/**
 * Filerna bokföringen och leverantörskontakten behöver.
 *
 *   /api/admin/export?kind=orders&from=2026-08-01&to=2026-08-31
 *   /api/admin/export?kind=refunds&from=…&to=…
 *   /api/admin/export?kind=catalog
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const params = request.nextUrl.searchParams;
  const kind = params.get('kind') ?? 'orders';

  if (kind === 'catalog') {
    const csv = await catalogCsv();
    await record(auth.user, 'export.downloaded', null, { fil: 'katalog' });
    return csvResponse(csv, `linnevik-katalog-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  // Värdet går rakt in i en SQL-cast, så både formen och kalendern måste
  // stämma: 2026-02-31 tog sig förbi en ren formkontroll och blev ett 500.
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    return NextResponse.json(
      { error: 'Ange from och to som ÅÅÅÅ-MM-DD.' },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json({ error: 'Startdatumet ligger efter slutdatumet.' }, { status: 400 });
  }

  if (kind === 'orders') {
    const csv = await ordersCsv({ from, to });
    await record(auth.user, 'export.downloaded', null, { fil: 'ordrar', from, to });
    return csvResponse(csv, `linnevik-ordrar-${from}--${to}.csv`);
  }
  if (kind === 'refunds') {
    const csv = await refundsCsv({ from, to });
    await record(auth.user, 'export.downloaded', null, { fil: 'återbetalningar', from, to });
    return csvResponse(csv, `linnevik-aterbetalningar-${from}--${to}.csv`);
  }

  return NextResponse.json({ error: 'Okänd filtyp.' }, { status: 400 });
}

function csvResponse(csv: string, filename: string): NextResponse {
  // BOM först: utan den läser svensk Excel filen som Latin-1 och gör å, ä, ö
  // till kråkfötter.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
