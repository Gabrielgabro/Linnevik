import Link from 'next/link';
import clsx from 'clsx';
import { cookies } from 'next/headers';
import CompetitorCharts from '@/components/admin/CompetitorCharts';
import CostCharts from '@/components/admin/CostCharts';
import VariantPricing from '@/components/admin/VariantPricing';
import { PageHeader, StatRow, StatTile, buttonClass } from '@/components/admin/ui';
import { accentFor } from './nav';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import { landedPerPcs, products, shipment } from '@/data/landedCost';
import { listLinnevikVariantProducts, listProductsForAdmin } from '@/lib/productsDb';

const sek = (v: number, decimals = 2) =>
  v.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Samma ordning i alla tre graferna, dyrast per styck först, så att raderna
// går att jämföra rakt av mellan vyerna.
const byLandedDesc = [...products].sort((a, b) => landedPerPcs(b) - landedPerPcs(a));

const freightTotal = products.reduce((sum, p) => sum + p.freightPerPcs * p.qty, 0);
const dutyTotal = products.reduce((sum, p) => sum + p.dutyPerPcs * p.qty, 0);
// Totalen kommer från CSV:n, inte från avrundade styckpriser.
const landedTotal = shipment.landedTotalSek;
const goodsTotal = landedTotal - freightTotal - dutyTotal;

/**
 * Sidan bar förut två helt olika ärenden i en enda rulle: vad sändningen
 * kostade, och vad produkterna ska säljas för. Underlaget slås upp när man
 * kontrollerar en kalkyl, prissättningen när man ska sätta ett pris — sällan
 * samtidigt. Vyn ligger i URL:en (`?vy=priser`) och inte i ett React-tillstånd,
 * så att en länk till prissättningen öppnar prissättningen och en omladdning
 * inte kastar tillbaka en till kostnaderna.
 */
type View = 'kostnad' | 'priser';

const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'kostnad', label: 'Kostnadsunderlag', hint: 'Sändningen, landad kostnad per produkt' },
  { id: 'priser', label: 'Prissättning & marknad', hint: 'Konkurrentpriser och våra priser' },
];

function ViewTabs({ current }: { current: View }) {
  return (
    <nav aria-label="Vy" className="flex flex-wrap gap-2">
      {VIEWS.map(view => {
        const active = view.id === current;
        return (
          <Link
            key={view.id}
            href={view.id === 'kostnad' ? '/admin' : `/admin?vy=${view.id}`}
            aria-current={active ? 'page' : undefined}
            title={view.hint}
            className={clsx(
              'inline-flex items-center rounded-full border px-4 py-[7px] text-[13px] leading-[1.5] transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text',
              active
                ? 'border-brand bg-brand font-medium text-brand-fg'
                : 'border-rule bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-ink-2">{value}</span>
    </div>
  );
}

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ vy?: string }>;
}) {
  const view: View = (await searchParams).vy === 'priser' ? 'priser' : 'kostnad';
  const accent = accentFor('/admin');

  if (view === 'priser') {
    const user = await readSessionValue((await cookies()).get(ADMIN_COOKIE)?.value);
    // Reglagets blå startläge ska visa vad produkten faktiskt kostar just nu,
    // inte den statiska förslagssiffran i competitorPrices.ts.
    const catalogRows = await listProductsForAdmin();
    const currentPriceByHandle = Object.fromEntries(
      catalogRows
        .filter(row => row.priceMinMinor != null)
        .map(row => [row.handle, row.priceMinMinor! / 100])
    );
    const variantProducts = await listLinnevikVariantProducts();

    return (
      <>
        <PageHeader
          kicker="Prisbild · marknad och våra priser"
          title="Vad produkterna ska kosta"
          accent={accent}
          description={
            <>
              Marknadens priser för motsvarande produkter, och våra egna priser per variant.
              Marginalerna räknas mot den landade kostnaden — underlaget för den ligger under{' '}
              <b className="font-semibold text-ink">Kostnadsunderlag</b>. Alla belopp i SEK
              exklusive moms.
            </>
          }
          actions={
            <Link href="/admin/franzen" className={buttonClass('secondary', 'sm')}>
              Prisbild – Franzén
            </Link>
          }
        />

        <ViewTabs current={view} />

        <VariantPricing user={user} products={variantProducts} />

        <CompetitorCharts currentPrices={currentPriceByHandle} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker={`Sändning ${shipment.goodsInvoiceNo} · Shanghai → Göteborg → Uppsala`}
        title="Vad varje produkt faktiskt kostade fram till lagret"
        accent={accent}
        description={
          <>
            Varukostnaden är den <b className="font-semibold text-ink">faktiskt betalda</b> — USD{' '}
            {sek(shipment.paidUsd)} till kurs{' '}
            {shipment.fx.toLocaleString('sv-SE', { maximumFractionDigits: 5 })} enligt
            bankunderlaget, inte fakturans {sek(shipment.invoicedUsd)}. Ovanpå den ligger
            fraktfakturan och tullen, fördelade på den volym respektive det värde varje produkt
            orsakade. Alla belopp i SEK exklusive moms; momsen på 2 800,80 SEK är avdragsgill och
            ingår inte.
          </>
        }
        actions={
          <Link href="/admin/franzen" className={buttonClass('secondary', 'sm')}>
            Prisbild – Franzén
          </Link>
        }
      />

      <ViewTabs current={view} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-x-6 gap-y-3.5 rounded-card border border-rule bg-surface px-5 py-4 shadow-card sm:px-6">
        <Meta label="Leverantörsfaktura" value={shipment.goodsInvoiceNo} />
        <Meta label="Fraktfaktura" value={shipment.freightInvoiceNo} />
        <Meta label="Bankreferens" value={shipment.bankRef} />
        <Meta label="Volym / vikt" value={`${sek(shipment.cbm, 2)} CBM · 813 kg`} />
        <Meta label="Betalt till fabrik" value={`USD ${sek(shipment.paidUsd)}`} />
        <Meta
          label="Bankkurs USD/SEK"
          value={shipment.fx.toLocaleString('sv-SE', { maximumFractionDigits: 5 })}
        />
      </div>

      {/* Accentfärgerna följer diagramserierna, så nyckeltalet och stapeln
          nedanför har samma färg. */}
      <StatRow>
        <StatTile
          label="Betalt till fabrik"
          value={sek(goodsTotal, 0)}
          accent="var(--viz-s1)"
          hint={`USD ${sek(shipment.paidUsd)} @ ${shipment.fx.toLocaleString('sv-SE', { maximumFractionDigits: 5 })} + 50 kr avgift`}
        />
        <StatTile
          label="Logistik"
          value={sek(freightTotal, 0)}
          accent="var(--viz-s2)"
          hint={`+${sek((freightTotal / goodsTotal) * 100, 1)} % på varukostnaden`}
        />
        <StatTile
          label="Tull"
          value={sek(dutyTotal, 0)}
          accent="var(--viz-s3)"
          hint={`+${sek((dutyTotal / goodsTotal) * 100, 1)} % på varukostnaden`}
        />
        <StatTile
          label="Landad kostnad"
          value={sek(landedTotal, 0)}
          accent="var(--adm-brand)"
          hint={`+${sek((landedTotal / goodsTotal - 1) * 100, 1)} % mot betald varukostnad`}
        />
      </StatRow>

      <CostCharts products={byLandedDesc} />
    </>
  );
}
