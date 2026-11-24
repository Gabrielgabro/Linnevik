import Link from 'next/link';
import clsx from 'clsx';
import { Search, ShoppingCart } from 'lucide-react';
import {
  EmptyState,
  Notice,
  PageHeader,
  Tag,
  TableShell,
  Td,
  Th,
} from '@/components/admin/ui';
import ClickableTableRow from '@/components/admin/ui/ClickableTableRow';
import { accentFor } from '../nav';
import {
  countUnpaidInvoiceOrders,
  listRecentOrders,
  listUnpaidInvoiceOrders,
  searchOrders,
} from '@/lib/ordersDb';
import { ocrForOrder } from '@/lib/invoicePayment';
import { parseOrderSearch } from '@/lib/orderSearch';
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

/**
 * Orderns `status` är inte samma sak som betalning eller leverans, och syntes
 * förr inte i listan alls. Det gjorde `stock_exception` osynligt: en betald
 * order som inte kunde reservera lager såg ut precis som alla andra. De här
 * tillstånden får därför en egen etikett bredvid ordernumret.
 */
const ATTENTION: Record<string, { label: string; color: string }> = {
  stock_exception: { label: 'Lager saknas', color: 'var(--adm-danger)' },
  disputed: { label: 'Tvist', color: 'var(--adm-danger)' },
  failed: { label: 'Misslyckad', color: 'var(--adm-danger)' },
  cancelled: { label: 'Makulerad', color: 'var(--viz-ink-3)' },
  expired: { label: 'Utgången', color: 'var(--viz-ink-3)' },
};

/** Obetald fakturaorder: samma urval som `listUnpaidInvoiceOrders`. */
const isUnpaidInvoice = (order: { paymentMethod: string; paymentStatus: string; status: string }) =>
  order.paymentMethod === 'invoice'
  && order.paymentStatus === 'pending'
  && !['cancelled', 'expired', 'failed'].includes(order.status);

const daysSince = (date: Date) => Math.floor((Date.now() - date.getTime()) / 86_400_000);

function FilterLink({ href, active, count, children }: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[12.5px] leading-[1.5] transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text',
        active
          ? 'border-brand bg-brand font-medium text-brand-fg'
          : 'border-rule bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
      )}
    >
      {children}
      {count !== undefined && (
        <span className={clsx('font-mono text-[11px] tabular-nums', !active && 'text-ink-3')}>{count}</span>
      )}
    </Link>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; vy?: string | string[] }>;
}) {
  const params = await searchParams;
  const search = parseOrderSearch(params.q);
  const unpaidView = !search && params.vy === 'obetalda';
  const [orders, unpaidCount] = await Promise.all([
    search ? searchOrders(search) : unpaidView ? listUnpaidInvoiceOrders() : listRecentOrders(200),
    countUnpaidInvoiceOrders(),
  ]);
  const ocrHit = search?.ocrOrderId != null ? orders.find(order => order.id === search.ocrOrderId) : undefined;
  const testCount = orders.filter(order => order.testMode).length;
  // Betald, men lagret räckte inte. Kunden väntar på något vi inte kan skicka,
  // och det är det enda i den här listan som kräver ett beslut i dag.
  const blocked = orders.filter(order => order.status === 'stock_exception');
  const disputed = orders.filter(order => order.status === 'disputed');

  return (
    <>
      <PageHeader
        kicker={[
          search
            ? `${orders.length} träffar på "${search.text}"`
            : unpaidView
              ? `${orders.length} obetalda fakturor`
              : `${orders.length} senaste ordrarna`,
          testCount > 0 ? `${testCount} i testläge` : null,
        ].filter(Boolean).join(' · ')}
        title="Ordrar"
        accent={accentFor('/admin/orders')}
        description="Betalning, rabatt, frakt, återbetalning och fulfillment i ett orderregister."
      />

      {blocked.length > 0 && (
        <Notice tone="danger" title={`${blocked.length} betalda ordrar saknar lagerreservation`}>
          Kunden har betalat men lagret räckte inte när betalningen kom in. Fyll på lagret och
          reservera om, eller makulera och återbetala.{' '}
          {blocked.map((order, index) => (
            <span key={order.id}>
              {index > 0 && ', '}
              <Link href={`/admin/orders/${order.id}`} className="underline">
                #{order.id}
              </Link>
            </span>
          ))}
        </Notice>
      )}

      {disputed.length > 0 && (
        <Notice tone="danger" title={`${disputed.length} ordrar är under tvist hos Stripe`}>
          Stripe har hållit inne beloppet. Svara med underlag i Stripe innan tidsfristen.{' '}
          {disputed.map((order, index) => (
            <span key={order.id}>
              {index > 0 && ', '}
              <Link href={`/admin/orders/${order.id}`} className="underline">
                #{order.id}
              </Link>
            </span>
          ))}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* Ett vanligt GET-formulär: sökningen hamnar i adressen och går att länka till. */}
        <form method="get" action="/admin/orders" role="search" className="relative min-w-[200px] flex-1 sm:max-w-[360px]">
          <Search
            size={15}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            type="search"
            name="q"
            defaultValue={search?.text ?? ''}
            placeholder="Ordernr, OCR, namn, e-post eller org.nr"
            aria-label="Sök order på ordernummer, OCR-nummer, namn, e-post eller organisationsnummer"
            className={clsx(
              'w-full rounded-ctl border border-rule bg-surface py-2 pl-9 pr-3 text-[13.5px] text-ink outline-none',
              'placeholder:text-ink-3 focus:border-brand',
              'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--adm-brand-text)_22%,transparent)]'
            )}
          />
        </form>
        <FilterLink href="/admin/orders" active={!search && !unpaidView}>Alla</FilterLink>
        <FilterLink href="/admin/orders?vy=obetalda" active={unpaidView} count={unpaidCount}>
          Obetalda fakturor
        </FilterLink>
      </div>

      {ocrHit && (
        <Notice tone="info" title={`OCR ${ocrForOrder(ocrHit.id)} hör till order #${ocrHit.id}`}>
          <Link href={`/admin/orders/${ocrHit.id}`} className="underline">
            Öppna order #{ocrHit.id}
          </Link>
          {isUnpaidInvoice(ocrHit)
            ? ' och registrera betalningen under Fakturabetalning.'
            : ` — fakturan är inte obetald (betalning: ${ocrHit.paymentStatus}, status: ${ocrHit.status}).`}
        </Notice>
      )}

      {orders.length === 0 ? (
        search ? (
          <EmptyState
            icon={Search}
            title={`Ingen order matchar "${search.text}"`}
            description="Sök på ordernummer, OCR-nummer, kundens namn, e-post eller organisationsnummer."
          />
        ) : unpaidView ? (
          <EmptyState
            icon={ShoppingCart}
            title="Inga obetalda fakturor"
            description="Alla fakturaordrar är betalda eller avbeställda."
          />
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="Inga ordrar ännu"
            description="Så fort en Stripe-checkout betalas dyker ordern upp här."
          />
        )
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
              <ClickableTableRow
                key={order.id}
                href={`/admin/orders/${order.id}`}
                label={`Öppna order #${order.id}`}
              >
                <Td numeric>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-brand-text">#{order.id}</span>
                    {order.testMode && <Tag color="var(--adm-warn)">TEST</Tag>}
                    {ATTENTION[order.status] && (
                      <Tag color={ATTENTION[order.status].color}>
                        {ATTENTION[order.status].label}
                      </Tag>
                    )}
                    {isUnpaidInvoice(order) && (
                      <Tag color="var(--adm-warn)">
                        {`Obetald faktura · ${daysSince(order.createdAt)} d · OCR ${ocrForOrder(order.id)}`}
                      </Tag>
                    )}
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
              </ClickableTableRow>
            ))}
          </tbody>
        </TableShell>
      )}
    </>
  );
}
