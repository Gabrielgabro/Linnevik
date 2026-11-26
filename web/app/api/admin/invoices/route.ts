import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readJson, requireAdmin } from '@/lib/adminRoute';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';
import { InvoicePaymentConfigError } from '@/lib/invoicePayment';
import { createManualInvoice, ManualInvoiceError } from '@/lib/manualInvoice';
import { ManualInvoiceInputError, parseManualInvoiceInput } from '@/lib/manualInvoiceInput';
import { raiseAlert } from '@/lib/opsAlerts';
import { PaymentMethodConflictError } from '@/lib/ordersDb';
import { stripeConfigured, stripeFailureIsAmbiguous } from '@/lib/stripe';
import { VatConfigurationError } from '@/lib/vat';
import { reportStripeKeyError } from '@/lib/stripeHealth';

export const runtime = 'nodejs';

/**
 * Skapar en faktura för hand: order, lagerreservation och Stripe-faktura,
 * skickad till kunden. Se `createManualInvoice`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  if (!ownedCommerceEnabled() || !stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe eller den egna kassan är inte konfigurerad.' }, { status: 503 });
  }
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;

  try {
    const input = parseManualInvoiceInput(parsed.body);
    const result = await createManualInvoice(input, auth.user);
    await record(auth.user, 'order.invoice_created', String(result.orderId), {
      faktura: result.number ?? result.invoiceId,
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
    if (error instanceof VatConfigurationError) {
      return NextResponse.json({ error: 'Momsinställningen är inte komplett. Se larmen.' }, { status: 503 });
    }
    if (error instanceof PaymentMethodConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('[admin] createManualInvoice failed:', error);
    await reportStripeKeyError(error, 'Ny faktura i admin');
    if (stripeFailureIsAmbiguous(error)) {
      // Fakturan kan ha skapats ändå. Ordern och lagret står kvar bundna, och
      // avstämningen i natt reder ut vilket det blev — ett nytt försök nu
      // riskerar två fakturor.
      return NextResponse.json(
        { error: 'Stripe svarade inte. Fakturan kan ha skapats ändå — titta i orderlistan innan du försöker igen.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: 'Fakturan kunde inte skapas och skickades inte. Se loggen.' }, { status: 500 });
  }
}
