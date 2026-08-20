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
          <dt>Rabatt</dt><dd className="text-right">−{formatMinor(order.discountMinor, order.currency)}</dd>
          <dt>Frakt</dt><dd className="text-right">{formatMinor(order.shippingMinor, order.currency)}</dd>
          <dt>Återbetalt</dt><dd className="text-right">{formatMinor(order.refundedMinor, order.currency)}</dd>
        </dl>
      </section>
      <OrderActions order={order} />
      <section><h2 className="mb-3 font-heading text-xl">Historik</h2><ul className="grid gap-2 text-sm">{order.events.map(event => <li key={event.id}>{event.createdAt.toLocaleString('sv-SE')} · {event.kind} · {event.actor}</li>)}</ul></section>
    </>
  );
}
