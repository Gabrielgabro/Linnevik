'use client';

import { landedPerPcs, products as landedProducts } from '@/data/landedCost';
import {
  collectedAt,
  competitorProducts,
  eurSek,
  primaryOf,
  type Channel,
  type Competitor,
  type CompetitorProduct,
} from '@/data/competitorPrices';
import { Axis, Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

const SERIES = {
  landed: { label: 'Landad kostnad', varName: '--viz-s3' },
  suggested: { label: 'Vårt föreslagna pris', varName: '--viz-s1' },
  b2b: { label: 'B2B-konkurrent', varName: '--viz-s2' },
  b2c: { label: 'B2C-referens', varName: '--viz-ink-3' },
} as const;

const titleOf = (skuPrefix: string) =>
  landedProducts.find(p => p.skuPrefix === skuPrefix)?.title ?? skuPrefix;

const landedOf = (skuPrefix: string) => {
  const p = landedProducts.find(x => x.skuPrefix === skuPrefix);
  return p ? landedPerPcs(p) : 0;
};

const marginPct = (p: CompetitorProduct) =>
  ((p.suggestedSek - landedOf(p.skuPrefix)) / p.suggestedSek) * 100;

const indexPct = (p: CompetitorProduct) => (p.suggestedSek / primaryOf(p).priceSek) * 100;

type BarSpec = {
  id: string;
  label: string;
  value: number;
  varName: string;
  emphasis?: boolean;
  tipTitle: string;
  tipRows: string[];
  tipNote: string;
};

export default function CompetitorCharts() {
  const { tip, showTip, hideTip } = useTip();

  const bar = (b: BarSpec, max: number, suffix: string) => (
    <div
      key={b.id}
      className="grid grid-cols-[178px_1fr_92px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
    >
      <div
        className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
        style={{ color: b.emphasis ? 'var(--viz-ink)' : 'var(--viz-ink-2)', fontWeight: b.emphasis ? 600 : 400 }}
      >
        {b.label}
      </div>
      <div className="flex h-[18px] items-stretch" style={{ width: `${Math.min(100, (b.value / max) * 100)}%` }}>
        <div
          tabIndex={0}
          role="img"
          aria-label={`${b.tipTitle}, ${b.label}: ${sek(b.value, 0)}${suffix}`}
          className="min-w-[2px] flex-1 cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
          style={{ background: `var(${b.varName})` }}
          onMouseEnter={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
          onMouseMove={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
          onFocus={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
          onMouseLeave={hideTip}
          onBlur={hideTip}
        />
      </div>
      <span
        className="whitespace-nowrap font-mono text-[11px] tabular-nums"
        style={{ color: b.emphasis ? 'var(--viz-ink)' : 'var(--viz-ink-2)' }}
      >
        {sek(b.value, 0)}
        {suffix}
      </span>
    </div>
  );

  const competitorBar = (p: CompetitorProduct, c: Competitor): BarSpec => ({
    id: `${p.skuPrefix}-${c.vendor}-${c.product}-${c.size}`,
    label: `${c.vendor} · ${c.product}`,
    value: c.priceSek,
    varName: SERIES[c.channel as Channel].varName,
    tipTitle: `${c.vendor} — ${c.product}`,
    tipRows: [
      `${sek(c.priceSek, 0)} SEK/st exkl. moms`,
      `${c.spec} · ${c.size} cm`,
      c.channel === 'b2c' ? 'B2C-pris, omräknat från pris inkl. moms' : 'B2B-listpris',
    ],
    tipNote: c.caveat ?? (c.primary ? 'Vald som närmaste motsvarighet.' : 'Jämförelseprodukt.'),
  });

  return (
    <>
      <Card
        title="Vad marknaden tar för motsvarande produkt"
        sub="Per produkt: vår landade kostnad, vårt föreslagna listpris och de närmast likvärdiga produkterna hos svenska och nordiska hotelltextilleverantörer. Varje block har sin egen skala — priserna spänner från 13 kr till 1 427 kr och går inte att lägga på samma axel."
        note={
          <>
            Bilden är densamma för fem av sex produkter: <b>marknaden tar mellan tre och fyra gånger vår
            landade kostnad</b>, och vi kan lägga oss under närmaste motsvarighet och ändå behålla drygt
            60 % bruttomarginal. Duntäcket och dunkudden är dessutom bättre produkter än det vi jämför mot
            — konkurrenternas &rdquo;dun&rdquo; är 50/50 dun och fjäder, våra är 90/10.
          </>
        }
      >
        <Legend items={[SERIES.landed, SERIES.suggested, SERIES.b2b, SERIES.b2c]} />
        <div className="flex flex-col gap-6">
          {competitorProducts.map(p => {
            const landed = landedOf(p.skuPrefix);
            const bars: BarSpec[] = [
              {
                id: `${p.skuPrefix}-landed`,
                label: 'Landad kostnad',
                value: landed,
                varName: SERIES.landed.varName,
                tipTitle: titleOf(p.skuPrefix),
                tipRows: [`${sek(landed)} SEK/st landad kostnad`, `${p.ourSpec}`],
                tipNote: 'Vara, frakt och tull fram till lagret i Uppsala.',
              },
              {
                id: `${p.skuPrefix}-suggested`,
                label: 'Vårt föreslagna pris',
                value: p.suggestedSek,
                varName: SERIES.suggested.varName,
                emphasis: true,
                tipTitle: titleOf(p.skuPrefix),
                tipRows: [
                  `${sek(p.suggestedSek, 0)} SEK/st exkl. moms`,
                  `${sek(marginPct(p), 0)} % bruttomarginal`,
                  `${sek(indexPct(p), 0)} % av närmaste motsvarighet`,
                ],
                tipNote: p.rationale,
              },
              ...p.competitors.map(c => competitorBar(p, c)),
            ];
            const max = Math.max(...bars.map(b => b.value));

            return (
              <div key={p.skuPrefix} className="flex flex-col gap-[9px]">
                <div
                  className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b pb-1.5"
                  style={{ borderColor: 'var(--viz-grid)' }}
                >
                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
                    {titleOf(p.skuPrefix)}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--viz-ink-3)' }}>
                    {p.ourSpec} · {p.ourSize} cm
                  </span>
                </div>
                {bars.map(b => bar(b, max, ' kr'))}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Bruttomarginal vid föreslaget pris"
        sub="Föreslaget pris minus landad kostnad, som andel av priset. Delad skala 0–100 %, så raderna går att jämföra rakt av."
        note={
          <>
            Marginalen ligger mellan 54 och 66 % över hela sortimentet, vilket är avsiktligt: förslagen är
            satta mot marknaden, inte mot ett fast pålägg. <b>Kudde Sigrid har lägst marginal och Kuddskydd
            högst</b> — men Sigrid är 16 sålda enheter och Kuddskydd 300, så det är Kuddskyddet som avgör
            om sortimentet bär sig.
          </>
        }
      >
        <div className="flex flex-col gap-[9px]">
          {[...competitorProducts]
            .sort((a, b) => marginPct(b) - marginPct(a))
            .map(p =>
              bar(
                {
                  id: `${p.skuPrefix}-margin`,
                  label: titleOf(p.skuPrefix),
                  value: marginPct(p),
                  varName: SERIES.suggested.varName,
                  tipTitle: titleOf(p.skuPrefix),
                  tipRows: [
                    `${sek(marginPct(p), 1)} % bruttomarginal`,
                    `${sek(p.suggestedSek, 0)} kr pris − ${sek(landedOf(p.skuPrefix))} kr landad kostnad`,
                    `${sek(p.suggestedSek - landedOf(p.skuPrefix), 0)} kr täckningsbidrag per styck`,
                  ],
                  tipNote: p.rationale,
                },
                100,
                ' %'
              )
            )}
        </div>
        <Axis ticks={[0, 25, 50, 75, 100]} max={100} unit="bruttomarginal" format={t => `${t} %`} />
      </Card>

      <Card
        title="Vårt förslag mot närmaste motsvarighet"
        sub="Föreslaget pris som andel av den B2B-produkt vi bedömt vara närmast likvärdig. Under 100 % betyder att vi underskrider den. Delad skala."
        flag
        note={
          <>
            Fyra produkter landar på 64–85 % av närmaste motsvarighet — vi är billigare utan att vara
            misstänkt billiga. Två sticker ut. Madrasskyddet ligger strax över, vilket är hanterbart.{' '}
            <b>Kuddskyddet ligger på 170 % och är det svagaste förslaget i hela analysen.</b> Den svenska
            B2B-referensen (23 kr) är en vattentät PU-jersey, vår produkt är stretchfrotté — samma funktion,
            annat material, och vi har ingen prispunkt på just stretchfrotté i underlaget. Priset bör
            verifieras mot en riktig offert innan det sätts.
          </>
        }
      >
        <div className="flex flex-col gap-[9px]">
          {[...competitorProducts]
            .sort((a, b) => indexPct(b) - indexPct(a))
            .map(p => {
              const c = primaryOf(p);
              return bar(
                {
                  id: `${p.skuPrefix}-index`,
                  label: titleOf(p.skuPrefix),
                  value: indexPct(p),
                  varName: indexPct(p) > 100 ? '--viz-flag' : SERIES.suggested.varName,
                  tipTitle: titleOf(p.skuPrefix),
                  tipRows: [
                    `${sek(indexPct(p), 0)} % av ${c.vendor}`,
                    `${sek(p.suggestedSek, 0)} kr mot ${sek(c.priceSek, 0)} kr`,
                    `${c.product} · ${c.size} cm`,
                  ],
                  tipNote: c.caveat ?? 'Närmaste motsvarighet i underlaget.',
                },
                200,
                ' %'
              );
            })}
        </div>
        <Axis ticks={[0, 50, 100, 150, 200]} max={200} unit="av motsvarigheten" format={t => `${t} %`} />
      </Card>

      <section
        className="rounded-[3px] border px-6 py-6"
        style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <caption
              className="pb-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.1em]"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              Källor · SEK exkl. moms per styck · insamlat {collectedAt} · EUR omräknat till {sek(eurSek, 3)}
            </caption>
            <thead>
              <tr>
                {['Vår produkt', 'Leverantör', 'Produkt', 'Specifikation', 'Storlek', 'Kanal', 'Pris'].map(
                  (h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`whitespace-nowrap border-b px-2.5 py-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.06em] ${
                        i === 6 ? 'text-right' : 'text-left'
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
              {competitorProducts.flatMap(p =>
                p.competitors.map((c, i) => (
                  <tr key={`${p.skuPrefix}-${c.vendor}-${c.product}-${c.size}`}>
                    <th
                      scope="row"
                      className="whitespace-nowrap border-b px-2.5 py-2 text-left font-normal"
                      style={{ borderColor: 'var(--viz-rule)', color: i === 0 ? 'var(--viz-ink)' : 'var(--viz-ink-3)' }}
                    >
                      {i === 0 ? titleOf(p.skuPrefix) : '↳'}
                    </th>
                    <td className="border-b px-2.5 py-2" style={{ borderColor: 'var(--viz-rule)' }}>
                      {c.vendor}
                    </td>
                    <td className="border-b px-2.5 py-2" style={{ borderColor: 'var(--viz-rule)' }}>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {c.product}
                      </a>
                      {c.primary && (
                        <span
                          className="ml-[7px] whitespace-nowrap rounded-sm border px-[5px] py-px font-mono text-[10px] uppercase tracking-[0.06em]"
                          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                          title="Indexet i tredje grafen räknas mot den här produkten."
                        >
                          motsvarighet
                        </span>
                      )}
                    </td>
                    <td
                      className="border-b px-2.5 py-2"
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
                    >
                      {c.spec}
                      {c.caveat && (
                        <span className="block text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
                          {c.caveat}
                        </span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-2.5 py-2 tabular-nums"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {c.size}
                    </td>
                    <td
                      className="border-b px-2.5 py-2 font-mono text-[11px] uppercase"
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                    >
                      {c.channel}
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-2.5 py-2 text-right tabular-nums"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {sek(c.priceSek, 0)} kr
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Tooltip tip={tip} />
    </>
  );
}
