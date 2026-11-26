import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ManualInvoiceForm from '@/components/admin/ManualInvoiceForm';
import { Notice, PageHeader } from '@/components/admin/ui';
import { accentFor } from '../../nav';
import { INVOICE_DUE_DAYS } from '@/lib/invoicesDb';
import { invoicePaymentDetailsOrNull } from '@/lib/invoicePayment';
import { listInvoiceClients, listInvoiceVariants } from '@/lib/manualInvoice';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';

export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  const [clients, variants] = await Promise.all([listInvoiceClients(), listInvoiceVariants()]);
  const payment = invoicePaymentDetailsOrNull();
  const ready = ownedCommerceEnabled();

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/admin/orders" className="inline-flex items-center gap-1.5 hover:text-ink-2 hover:underline">
            <ArrowLeft size={13} strokeWidth={2} aria-hidden />
            Ordrar
          </Link>
        }
        title="Ny faktura"
        accent={accentFor('/admin/orders')}
        description="En faktura till ett företag i registret. Blir en vanlig fakturaorder: lagret reserveras, fakturan får nästa nummer i serien och mejlas som pdf med bankgiro och OCR, och betalningen registreras på ordern."
      />

      {!ready && (
        <Notice tone="danger" title="Den egna kassan är inte påslagen">
          Fakturor kan inte skapas förrän OWNED_COMMERCE_ENABLED är satt.
        </Notice>
      )}

      <ManualInvoiceForm
        clients={clients}
        variants={variants}
        defaultDueDays={INVOICE_DUE_DAYS}
        bankgiro={payment?.bankgiro ?? (payment?.bankAccount ? 'bankkonto' : null)}
      />
    </>
  );
}
