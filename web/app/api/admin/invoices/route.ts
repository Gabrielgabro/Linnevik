import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readJson, requireAdmin } from '@/lib/adminRoute';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { InvoicePaymentConfigError } from '@/lib/invoicePayment';
import { createManualInvoice, ManualInvoiceError } from '@/lib/manualInvoice';
import { ManualInvoiceInputError, parseManualInvoiceInput } from '@/lib/manualInvoiceInput';
import { raiseAlert } from '@/lib/opsAlerts';
import { PaymentMethodConflictError } from '@/lib/ordersDb';
import { InvoiceError } from '@/lib/invoicesDb';

export const runtime = 'nodejs';

/**
 * Skapar en faktura för hand: order, lagerreservation och vår egen faktura,
 * mejlad till mottagaren. Se `createManualInvoice`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  if (!ownedCommerceEnabled()) {
    return NextResponse.json({ error: 'Den egna kassan är inte påslagen (OWNED_COMMERCE_ENABLED).' }, { status: 503 });
  }
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;

  try {
    const input = parseManualInvoiceInput(parsed.body);
    const result = await createManualInvoice(input, auth.user);
    await record(auth.user, 'order.invoice_created', String(result.orderId), {
      faktura: result.number,
      kund: input.recipient.companyName,
      belopp: result.totalMinor,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ManualInvoiceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ManualInvoiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof InvoicePaymentConfigError) {
      await raiseAlert({
        kind: 'invoice.config',
        key: 'invoice:payment-config',
        subject: 'Fakturaköp stoppade: bankgiro/konto saknas eller är fel',
        detail: { fel: error.message },
      });
      return NextResponse.json({ error: 'Bankgiro eller bankkonto saknas eller är fel i inställningarna.' }, { status: 503 });
    }
    if (error instanceof InvoiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PaymentMethodConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('[admin] createManualInvoice failed:', error);
    return NextResponse.json({ error: 'Fakturan kunde inte skapas. Titta i orderlistan innan du försöker igen, och se loggen.' }, { status: 500 });
  }
}
