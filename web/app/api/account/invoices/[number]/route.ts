import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { customers, invoices, orders } from '@/lib/db/schema';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { invoicePdf } from '@/lib/invoicesDb';

export const runtime = 'nodejs';

/**
 * En faktura som pdf, för den inloggade kunden (§9.6). Bara fakturor på
 * ordrar som hör till kundens eget företag. Ett okänt nummer och någon
 * annans faktura ger samma svar, så att numren inte går att pröva sig fram till.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const session = await getCurrentCustomerFromCookies();
  if (!session) return NextResponse.json({ error: 'Inte inloggad.' }, { status: 401 });
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1) return NextResponse.json({ error: 'Fakturan finns inte.' }, { status: 404 });

  const [row] = await getDb()
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(customers, eq(customers.clientId, orders.clientId))
    .where(and(eq(invoices.number, number), eq(customers.id, Number(session.id))))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Fakturan finns inte.' }, { status: 404 });

  const pdf = await invoicePdf(row.invoice);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${row.invoice.kind === 'credit' ? 'kreditfaktura' : 'faktura'}-${number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
