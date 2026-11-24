import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin } from '@/lib/adminRoute';
import { ManualInvoiceError, quoteManualInvoice } from '@/lib/manualInvoice';
import {
  ManualInvoiceInputError,
  parseManualInvoiceLines,
  parseManualInvoiceShipping,
} from '@/lib/manualInvoiceInput';

export const runtime = 'nodejs';

/**
 * Förhandsberäkning av en manuell faktura: katalogpris per rad, frakt, moms,
 * summa och lagerläge. Skriver ingenting.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;

  try {
    const quote = await quoteManualInvoice({
      lines: parseManualInvoiceLines(parsed.body.lines),
      shipping: parseManualInvoiceShipping(parsed.body.shipping),
    });
    return NextResponse.json(quote);
  } catch (error) {
    if (error instanceof ManualInvoiceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ManualInvoiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[admin] quoteManualInvoice failed:', error);
    return NextResponse.json({ error: 'Kunde inte räkna fram fakturan.' }, { status: 500 });
  }
}
