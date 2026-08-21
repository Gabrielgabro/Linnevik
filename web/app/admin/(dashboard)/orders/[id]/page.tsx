import Link from 'next/link';
import { notFound } from 'next/navigation';
import OrderActions from '@/components/admin/OrderActions';
import { Tag } from '@/components/admin/ui';
import { getOrderById } from '@/lib/ordersDb';
import { formatMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const order = Number.isInteger(id) ? await getOrderById(id) : null;
  if (!order) notFound();
  // Bara krediteringar som faktiskt gått igenom (eller är på väg) vänder moms.
  const refundedTaxMinor = order.refunds
    .filter(refund => refund.status === 'pending' || refund.status === 'succeeded')
    .reduce((sum, refund) => sum + refund.taxMinor, 0);
  return (
    <>
      <header className="border-t-2 pt-5" style={{ borderColor: 'var(--viz-ink)' }}>
        <p className="flex items-center gap-2 font-mono text-xs uppercase" style={{ color: 'var(--viz-ink-3)' }}>
          <span>Order #{order.id} · {order.paymentStatus} · {order.fulfillmentStatus}</span>
          {order.testMode && <Tag color="var(--adm-warn)">TEST</Tag>}
        </p>
        <h1 className="mt-2 font-heading text-4xl">{order.customerName ?? order.email ?? 'Okänd kund'}</h1>
        <p className="mt-2 text-sm">
          {order.clientId ? (
            <Link href={`/admin/clients/${order.clientId}`} className="text-brand-text hover:underline">
              Öppna kund
            </Link>
          ) : (
            order.email
          )}{' '}
          · {formatMinor(order.totalMinor, order.currency)}
        </p>
      </header>
      <section>
        <h2 className="mb-3 font-heading text-xl">Orderrader</h2>
        <ul className="divide-y" style={{ borderColor: 'var(--viz-rule)' }}>{order.items.map(item => (
          <li key={item.id} className="flex justify-between py-3 text-sm"><span>{item.quantity} × {item.title}</span><span>{formatMinor(item.unitAmountMinor * item.quantity, order.currency)}</span></li>
        ))}</ul>
        <dl className="ml-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-sm">
          <dt>Delsumma</dt><dd className="text-right">{formatMinor(order.subtotalMinor, order.currency)}</dd>
          <dt>Rabatt</dt><dd className="text-right">−{formatMinor(order.discountMinor, order.currency)}</dd>
          <dt>Frakt</dt><dd className="text-right">{formatMinor(order.shippingMinor, order.currency)}</dd>
          {/* Satsen och läget står på ordern, inte i en miljövariabel: en order
              från i fjol ska gå att stämma av mot det som faktiskt debiterades. */}
          <dt>
            Moms
            {order.vatBps !== null && ` ${order.vatBps / 100} %`}
            {order.vatMode === 'automatic' && ' (Stripe Tax)'}
          </dt>
          <dd className="text-right">{formatMinor(order.taxMinor, order.currency)}</dd>
          <dt className="font-medium">Totalt</dt>
          <dd className="text-right font-medium">{formatMinor(order.totalMinor, order.currency)}</dd>
          <dt>Återbetalt</dt>
          <dd className="text-right">
            {formatMinor(order.refundedMinor, order.currency)}
            {refundedTaxMinor > 0 && (
              <span className="block text-xs" style={{ color: 'var(--viz-ink-3)' }}>
                varav moms {formatMinor(refundedTaxMinor, order.currency)}
              </span>
            )}
          </dd>
        </dl>
        {(order.taxIdValue || order.billingAddress) && (
          <dl className="ml-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-sm">
            {order.taxIdValue && (
              <>
                <dt>Org-/VAT-nr</dt>
                <dd className="text-right">
                  {order.taxIdValue}
                  {order.taxIdType && (
                    <span className="block text-xs" style={{ color: 'var(--viz-ink-3)' }}>
                      {order.taxIdType}
                    </span>
                  )}
                </dd>
              </>
            )}
            {order.billingAddress && (
              <>
                <dt>Fakturaadress</dt>
                <dd className="text-right">
                  {[
                    order.billingAddress.line1,
                    order.billingAddress.line2,
                    [order.billingAddress.postal_code, order.billingAddress.city]
                      .filter(Boolean)
                      .join(' '),
                    order.billingAddress.country,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </>
            )}
          </dl>
        )}
      </section>
      <OrderActions order={order} />
      <section><h2 className="mb-3 font-heading text-xl">Historik</h2><ul className="grid gap-2 text-sm">{order.events.map(event => <li key={event.id}>{event.createdAt.toLocaleString('sv-SE')} · {event.kind} · {event.actor}</li>)}</ul></section>
    </>
  );
}
