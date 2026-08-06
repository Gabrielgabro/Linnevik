import { cookies } from 'next/headers';
import CompetitorCharts from '@/components/admin/CompetitorCharts';
import CostCharts from '@/components/admin/CostCharts';
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

function Stat({ label, value, note, varName }: { label: string; value: string; note: string; varName?: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-5" style={{ background: 'var(--viz-surface)' }}>
      <span
        className="flex items-center gap-[7px] font-mono text-[10.5px] uppercase tracking-[0.1em]"
        style={{ color: 'var(--viz-ink-3)' }}
      >
        {varName && (
          <span
            aria-hidden
            className="inline-block h-[9px] w-[9px] shrink-0 rounded-sm"
            style={{ background: `var(${varName})` }}
          />
        )}
        {label}
      </span>
      <span className="text-[27px] font-semibold tracking-[-0.02em]" style={{ color: 'var(--viz-ink)' }}>
        {value}
      </span>
      <span className="text-[12.5px]" style={{ color: 'var(--viz-ink-3)' }}>
        {note}
      </span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span
        className="font-mono text-[10.5px] uppercase tracking-[0.1em]"
        style={{ color: 'var(--viz-ink-3)' }}
      >
        {label}
      </span>
      <span className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--viz-ink-2)' }}>
        {value}
      </span>
    </div>
  );
}

export default async function AdminPricingPage() {
  const user = await readSessionValue((await cookies()).get(ADMIN_COOKIE)?.value);

  return (
    <>
      <header
        className="flex flex-col gap-[18px] border-b border-t-2 pb-5 pt-[18px]"
        style={{ borderTopColor: 'var(--viz-ink)', borderBottomColor: 'var(--viz-rule)' }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Prisbild · Sändning {shipment.goodsInvoiceNo} · Shanghai → Göteborg → Uppsala
        </span>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(26px,4vw,38px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Vad varje produkt faktiskt kostade fram till lagret
        </h1>
        <p className="max-w-[64ch] text-[15px]" style={{ color: 'var(--viz-ink-2)' }}>
          Varukostnaden är den <b className="font-semibold">faktiskt betalda</b> — USD{' '}
          {sek(shipment.paidUsd)} till kurs {shipment.fx.toLocaleString('sv-SE', { maximumFractionDigits: 5 })} enligt bankunderlaget,
          inte fakturans {sek(shipment.invoicedUsd)}. Ovanpå den ligger fraktfakturan och tullen, fördelade
          på den volym respektive det värde varje produkt orsakade. Alla belopp i SEK exklusive moms;
          momsen på 2 800,80 SEK är avdragsgill och ingår inte.
        </p>
        <div
          className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-x-6 gap-y-3.5 border-t pt-4"
          style={{ borderColor: 'var(--viz-rule)' }}
        >
          <Meta label="Leverantörsfaktura" value={shipment.goodsInvoiceNo} />
          <Meta label="Fraktfaktura" value={shipment.freightInvoiceNo} />
          <Meta label="Bankreferens" value={shipment.bankRef} />
          <Meta label="Volym / vikt" value={`${sek(shipment.cbm, 2)} CBM · 813 kg`} />
          <Meta label="Betalt till fabrik" value={`USD ${sek(shipment.paidUsd)}`} />
          <Meta label="Bankkurs USD/SEK" value={shipment.fx.toLocaleString('sv-SE', { maximumFractionDigits: 5 })} />
        </div>
      </header>

      <section
        className="grid grid-cols-[repeat(auto-fit,minmax(178px,1fr))] gap-px overflow-hidden rounded-[3px] border"
        style={{ background: 'var(--viz-rule)', borderColor: 'var(--viz-rule)' }}
      >
        <Stat
          label="Betalt till fabrik"
          value={sek(goodsTotal, 0)}
          note={`USD ${sek(shipment.paidUsd)} @ ${shipment.fx.toLocaleString('sv-SE', { maximumFractionDigits: 5 })} + 50 kr avgift`}
          varName="--viz-s1"
        />
        <Stat
          label="Logistik"
          value={sek(freightTotal, 0)}
          note={`+${sek((freightTotal / goodsTotal) * 100, 1)} % på varukostnaden`}
          varName="--viz-s2"
        />
        <Stat
          label="Tull"
          value={sek(dutyTotal, 0)}
          note={`+${sek((dutyTotal / goodsTotal) * 100, 1)} % på varukostnaden`}
          varName="--viz-s3"
        />
        <Stat
          label="Landad kostnad"
          value={sek(landedTotal, 0)}
          note={`+${sek((landedTotal / goodsTotal - 1) * 100, 1)} % mot betald varukostnad`}
        />
      </section>

      <CostCharts products={byLandedDesc} />

      <header
        className="flex flex-col gap-[14px] border-b border-t-2 pb-5 pt-[18px]"
        style={{ borderTopColor: 'var(--viz-ink)', borderBottomColor: 'var(--viz-rule)' }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Konkurrentanalys · publika prislistor · insamlat {collectedAt}
        </span>
        <h2
          className="max-w-[24ch] text-balance font-heading text-[clamp(22px,3.2vw,30px)] leading-[1.12] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Vad marknaden tar — och vad vi borde ta
        </h2>
        <p className="max-w-[64ch] text-[15px]" style={{ color: 'var(--viz-ink-2)' }}>
          För varje produkt har vi letat upp den närmast likvärdiga produkten hos svenska och nordiska
          hotelltextilleverantörer och lagt deras listpris bredvid vår landade kostnad. Tyngdpunkten
          ligger på B2B; konsumentpriserna finns med som referens och är omräknade till exklusive moms.
          Där matchningen inte är exakt står avvikelsen utskriven i källtabellen.
        </p>
      </header>

      <CompetitorCharts user={user} />
    </>
  );
}
