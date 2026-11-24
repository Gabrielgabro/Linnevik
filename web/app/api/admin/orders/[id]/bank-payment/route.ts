import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { stripeConfigured } from '@/lib/stripe';
import { registerBankPayment } from '@/lib/stripeInvoices';

export const runtime = 'nodejs';

/**
 * Registrerar en fakturabetalning som kommit in på bankkontot (bankgiro eller
 * kontoinsättning). Se `registerBankPayment` för reglerna.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  if (!stripeConfigured()) return NextResponse.json({ error: 'Stripe är inte konfigurerat.' }, { status: 503 });

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;
  const note = body.note ? String(body.note).trim().slice(0, 2_000) || null : null;

  try {
    const result = await registerBankPayment({
      orderId: id,
      amountMinor: Number(body.amountMinor),
      paidOn: body.paidOn,
      note,
      actor: auth.user,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await record(auth.user, 'order.bank_payment_registered', String(id), {
      belopp: Number(body.amountMinor),
      betalningsdag: body.paidOn,
      avvikelse: result.assessment.differenceMinor,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[admin] registerBankPayment failed:', error);
    return NextResponse.json(
      { error: 'Betalningen kunde inte registreras. Kontrollera ordern och fakturan i Stripe innan du försöker igen.' },
      { status: 502 }
    );
  }
}
