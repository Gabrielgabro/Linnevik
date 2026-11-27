import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/adminRoute';
import { getDb } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { invoicePdf } from '@/lib/invoicesDb';

export const runtime = 'nodejs';

/** En faktura eller kreditfaktura som pdf, för admin (§9.6). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1) return NextResponse.json({ error: 'Okänd faktura.' }, { status: 404 });
  const [invoice] = await getDb().select().from(invoices).where(eq(invoices.number, number));
  if (!invoice) return NextResponse.json({ error: 'Okänd faktura.' }, { status: 404 });
  const pdf = await invoicePdf(invoice);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.kind === 'credit' ? 'kreditfaktura' : 'faktura'}-${invoice.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
