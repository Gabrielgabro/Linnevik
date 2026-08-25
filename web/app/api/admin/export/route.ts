import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { requireAdmin } from '@/lib/adminRoute';
import { ordersCsv, refundsCsv } from '@/lib/bookkeepingExport';
import { catalogCsv } from '@/lib/catalogExport';

export const runtime = 'nodejs';

/** Enkelt datumformat, och inget annat: värdet går rakt in i en SQL-cast. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!DATE.test(from) || !DATE.test(to)) {
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
