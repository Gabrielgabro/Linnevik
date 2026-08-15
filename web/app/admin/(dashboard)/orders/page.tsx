import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  Tag,
  TableShell,
  Td,
  Th,
  Tr,
} from '@/components/admin/ui';
import { accentFor } from '../nav';
import { listRecentOrders } from '@/lib/ordersDb';
import { formatMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';

/** Betalning och leverans får varsin ton, så att en avvikelse syns i listan. */
const ORDER_TONE: Record<string, string> = {
  paid: 'var(--adm-ok)',
  delivered: 'var(--adm-ok)',
  fulfilled: 'var(--adm-ok)',
  shipped: 'var(--adm-info)',
  pending: 'var(--adm-warn)',
  unfulfilled: 'var(--adm-warn)',
  partially_refunded: 'var(--viz-s2)',
  refunded: 'var(--adm-danger)',
  cancelled: 'var(--adm-danger)',
};

const tone = (status: string) => ORDER_TONE[status] ?? 'var(--viz-ink-3)';

export default async function OrdersPage() {
  const orders = await listRecentOrders(200);
  const testCount = orders.filter(order => order.testMode).length;

  return (
    <>
      <PageHeader
        kicker={
          testCount > 0
            ? `${orders.length} senaste ordrarna · ${testCount} i testläge`
            : `${orders.length} senaste ordrarna`
        }
        title="Ordrar"
        accent={accentFor('/admin/orders')}
        description="Betalning, rabatt, frakt, återbetalning och fulfillment i ett orderregister."
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Inga ordrar ännu"
          description="Så fort en Stripe-checkout betalas dyker ordern upp här."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Kund</Th>
              <Th>Betalning</Th>
              <Th>Leverans</Th>
              <Th align="right">Total</Th>
              <Th align="right">Datum</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <Tr key={order.id}>
                <Td numeric>
                  <span className="inline-flex items-center gap-2">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-brand-text hover:underline"
                    >
                      #{order.id}
                    </Link>
                    {order.testMode && <Tag color="var(--adm-warn)">TEST</Tag>}
                  </span>
                </Td>
                <Td className="text-ink">{order.customerName ?? order.email ?? '—'}</Td>
                <Td>
                  <Tag color={tone(order.paymentStatus)}>{order.paymentStatus}</Tag>
                </Td>
                <Td>
                  <Tag color={tone(order.fulfillmentStatus)}>{order.fulfillmentStatus}</Tag>
                </Td>
                <Td numeric align="right">
                  {formatMinor(order.totalMinor, order.currency)}
                </Td>
                <Td numeric align="right" className="text-ink-3">
                  {order.createdAt.toLocaleDateString('sv-SE')}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </>
  );
}
