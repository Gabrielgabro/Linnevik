import Link from 'next/link';
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-ink-2">{value}</span>
    </div>
  );
}

export default async function AdminPricingPage() {
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
        kicker={`Sändning ${shipment.goodsInvoiceNo} · Shanghai → Göteborg → Uppsala`}
        title="Vad varje produkt faktiskt kostade fram till lagret"
        accent={accentFor('/admin')}
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

      <CompetitorCharts currentPrices={currentPriceByHandle} />

      <VariantPricing user={user} products={variantProducts} />
    </>
  );
}
