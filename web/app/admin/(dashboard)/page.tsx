import CostCharts from '@/components/admin/CostCharts';
import { landedPerPcs, lineTotal, products, shipment } from '@/data/landedCost';

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

export default function AdminPricingPage() {
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

      <section
        className="rounded-[3px] border px-6 py-6"
        style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <caption
              className="pb-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.1em]"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              Fullständigt underlag · SEK exkl. moms · frakt fördelad på CBM, tull på varuvärde
            </caption>
            <thead>
              <tr>
                {['Produkt', 'Antal', 'CBM', 'Vara/st', 'Frakt/st', 'Tull/st', 'Landad/st', 'Radtotal', 'Pålägg'].map(
                  (h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`whitespace-nowrap border-b px-2.5 py-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.06em] ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody style={{ color: 'var(--viz-ink)' }}>
              {byLandedDesc.map(p => {
                const cells = [
                  String(p.qty),
                  sek(p.cbm, 2),
                  sek(p.goodsPerPcs),
                  sek(p.freightPerPcs),
                  sek(p.dutyPerPcs),
                  sek(landedPerPcs(p)),
                  sek(lineTotal(p)),
                  `+${sek((landedPerPcs(p) / p.goodsPerPcs - 1) * 100, 0)} %`,
                ];
                return (
                  <tr key={p.skuPrefix}>
                    <th
                      scope="row"
                      className="border-b px-2.5 py-2 text-left font-normal"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {p.title}
                      {p.confidence === 'likely' && (
                        <span
                          className="ml-[7px] whitespace-nowrap rounded-sm border px-[5px] py-px font-mono text-[10px] uppercase tracking-[0.06em]"
                          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                          title="Mappningen mot Shopify är sannolik men inte verifierad."
                        >
                          trolig
                        </span>
                      )}
                    </th>
                    {cells.map((c, i) => (
                      <td
                        key={i}
                        className="border-b px-2.5 py-2 text-right tabular-nums"
                        style={{ borderColor: 'var(--viz-rule)' }}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot style={{ color: 'var(--viz-ink)' }}>
              <tr className="font-semibold">
                <th
                  scope="row"
                  className="border-t-2 px-2.5 py-2 text-left"
                  style={{ borderColor: 'var(--viz-rule)' }}
                >
                  Totalt
                </th>
                {[String(shipment.qty), sek(shipment.cbm, 2), '—', '—', '—', '—', sek(landedTotal), `+${sek((landedTotal / goodsTotal - 1) * 100, 1)} %`].map(
                  (c, i) => (
                    <td
                      key={i}
                      className="border-t-2 px-2.5 py-2 text-right tabular-nums"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {c}
                    </td>
                  )
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <footer
        className="flex flex-col gap-1.5 border-t pt-4 text-[12.5px]"
        style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
      >
        <p>
          <b className="font-semibold" style={{ color: 'var(--viz-ink-2)' }}>
            Ingen deposition är betald.
          </b>{' '}
          Leverantören fakturerade USD {sek(shipment.invoicedUsd)} med en deposition på 1 500 och ett
          restbelopp på 3 671,02, men bara restbeloppet har lämnat banken (ref {shipment.bankRef},
          2026-06-03). Varukostnaden här bygger på det som faktiskt betalats. Att godset ändå levererades
          är obekräftat mot leverantören.
        </p>
        <p>
          Mellanskillnaden mot fakturan är fördelad pro rata över raderna, eftersom fakturan inte anger
          vilken post den gäller.
        </p>
        <p>
          Frakt fördelad på volymandel (CBM), tull på varuvärdesandel, bankavgift på värde. Moms ingår
          inte — den är avdragsgill.
        </p>
        <p>
          Mappningen mot Shopify är bekräftad för fyra produkter. Madrasskydd och Kuddskydd är märkta
          &rdquo;trolig&rdquo; — de är inte verifierade.
        </p>
        <p>
          Kostnaden gäller denna ordervolym. 42 % av logistiknotan är fasta avgifter, så styckkostnaden
          faller cirka 21 % vid dubbel ordervolym.
        </p>
        <p>
          Källa: <code>catalog/beställningar/2026/prisanalys.csv</code>. Kör{' '}
          <code>node scripts/build-landed-cost.mjs</code> när den ändras.
        </p>
      </footer>
    </>
  );
}
