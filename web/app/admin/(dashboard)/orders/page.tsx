import Link from 'next/link';
import { listRecentOrders } from '@/lib/ordersDb';
import { formatMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';
export default async function OrdersPage() {
  const orders = await listRecentOrders(200);
  return (
    <>
      <header className="border-t-2 pt-5" style={{ borderColor: 'var(--viz-ink)' }}>
        <h1 className="font-heading text-4xl">Ordrar</h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--viz-ink-2)' }}>Betalning, rabatt, frakt, återbetalning och fulfillment i ett orderregister.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-xs uppercase" style={{ color: 'var(--viz-ink-3)' }}>
            <tr><th className="py-2">Order</th><th>Kund</th><th>Betalning</th><th>Leverans</th><th>Total</th><th>Datum</th></tr>
          </thead>
          <tbody>{orders.map(order => (
            <tr key={order.id} className="border-t" style={{ borderColor: 'var(--viz-rule)' }}>
              <td className="py-3"><Link className="underline" href={`/admin/orders/${order.id}`}>#{order.id}</Link></td>
              <td>{order.customerName ?? order.email ?? '—'}</td><td>{order.paymentStatus}</td>
              <td>{order.fulfillmentStatus}</td><td>{formatMinor(order.totalMinor, order.currency)}</td>
              <td>{order.createdAt.toLocaleDateString('sv-SE')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
