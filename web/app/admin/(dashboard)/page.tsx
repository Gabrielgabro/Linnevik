import { cookies } from 'next/headers';
import CompetitorCharts from '@/components/admin/CompetitorCharts';
import CostCharts from '@/components/admin/CostCharts';
import { PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from './nav';
import { ADMIN_COOKIE, readSessionValue } from '@/lib/adminAuth';
import { collectedAt } from '@/data/competitorPrices';
import { landedPerPcs, products, shipment } from '@/data/landedCost';

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

      {/* Andra halvan av sidan. Egen accentfärg (orange, samma som
          konkurrentstaplarna) så att brytpunkten syns när man skrollar. */}
      <header
        className="mt-4 flex flex-col gap-3 rounded-card border border-rule bg-surface px-5 py-5 shadow-card sm:px-6"
        style={{ borderTop: '3px solid var(--viz-s2)' }}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Konkurrentanalys · publika prislistor · insamlat {collectedAt}
        </span>
        <h2 className="max-w-[24ch] text-balance font-heading text-[clamp(22px,3.2vw,30px)] leading-[1.12] tracking-[-0.02em] text-ink">
          Vad marknaden tar — och vad vi borde ta
        </h2>
        <p className="max-w-[68ch] text-[14px] leading-[1.6] text-ink-2">
          För varje produkt har vi letat upp den närmast likvärdiga produkten hos svenska och
          nordiska hotelltextilleverantörer och lagt deras listpris bredvid vår landade kostnad.
          Tyngdpunkten ligger på B2B; konsumentpriserna finns med som referens och är omräknade till
          exklusive moms. Där matchningen inte är exakt står avvikelsen utskriven i källtabellen.
        </p>
      </header>

      <CompetitorCharts user={user} />
    </>
  );
}
