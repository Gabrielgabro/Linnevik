'use client';

import { landedPerPcs, products as landedProducts } from '@/data/landedCost';
import {
  competitorProducts,
  floorOf,
  primaryOf,
  type CompetitorProduct,
} from '@/data/competitorPrices';
import { Axis, Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

/**
 * Sammanfattningen av prisbilden: marginal och index per produkt.
 *
 * Jämförelsen mot marknaden bor inte längre här utan i
 * `VariantPricing.tsx` — "Marknadsjämförelse per produkt och variant" — där
 * varje storlek och fyllning har sitt eget pris, sitt eget konkurrentfält och
 * sina egna sparade bud. En produkt kan möta olika marknader i olika
 * storlekar, och en enda stapel per produkt kunde aldrig visa det.
 *
 * Det som är kvar är de två graferna som faktiskt hör hemma på produktnivå,
 * eftersom landad kostnad bara är känd per produkt: bruttomarginalen och
 * indexet mot marknaden. Båda läses av katalogen och inte av ett reglage —
 * priserna sätts i variantvyn, de sammanfattas här.
 */

const SERIES = {
  ours: { label: 'Vårt pris', varName: '--viz-s1' },
  floor: { label: 'Billigaste B2B-alternativ', varName: '--viz-s2' },
} as const;

const titleOf = (skuPrefix: string) =>
  landedProducts.find(p => p.skuPrefix === skuPrefix)?.title ?? skuPrefix;

const handleOf = (skuPrefix: string) =>
  landedProducts.find(p => p.skuPrefix === skuPrefix)?.handle ?? null;

const landedOf = (skuPrefix: string) => {
  const p = landedProducts.find(x => x.skuPrefix === skuPrefix);
  return p ? landedPerPcs(p) : 0;
};

const marginPct = (p: CompetitorProduct, price: number) =>
  price <= 0 ? 0 : ((price - landedOf(p.skuPrefix)) / price) * 100;

const indexPct = (p: CompetitorProduct, price: number) => (price / primaryOf(p).priceSek) * 100;
const floorPct = (p: CompetitorProduct, price: number) => (price / floorOf(p).priceSek) * 100;

/** "132 %" säger inget om det är bra eller dåligt förrän man räknat själv. */
const overUnderLabel = (pct: number) => {
  const diff = Math.round(pct - 100);
  if (diff === 0) return 'samma pris';
  return diff > 0 ? `${diff} % dyrare` : `${Math.abs(diff)} % billigare`;
};

const INDEX_MAX = 250;

// Ordningen låses vid ursprungsförslagen, så att raderna inte byter plats
// mellan de två graferna eller när ett pris ändras i variantvyn.
const byInitialMargin = [...competitorProducts].sort(
  (a, b) => marginPct(b, b.suggestedSek) - marginPct(a, a.suggestedSek)
);
const byInitialFloor = [...competitorProducts].sort(
  (a, b) => floorPct(b, b.suggestedSek) - floorPct(a, a.suggestedSek)
);

type BarSpec = {
  id: string;
  label: string;
  value: number;
  varName: string;
  tipTitle: string;
  tipRows: string[];
  tipNote: string;
};

export default function CompetitorCharts({
  currentPrices,
}: {
  /** Nuvarande pris per produkthandle, SEK exkl. moms. Billigaste varianten. */
  currentPrices: Record<string, number>;
}) {
  const { tip, showTip, hideTip } = useTip();

  /**
   * Produktens pris i katalogen, annars prisanalysens förslag. Flervariants-
   * produkter representeras av sin billigaste variant — det är den försiktiga
   * avläsningen, eftersom den ger den sämsta marginalen produkten kan ha.
   */
  const priceOf = (p: CompetitorProduct) => {
    const handle = handleOf(p.skuPrefix);
    const live = handle ? currentPrices[handle] : undefined;
    return live ?? p.suggestedSek;
  };

  const bar = (b: BarSpec, max: number, suffix: string) => (
    <div
      key={b.id}
      className="grid grid-cols-[178px_1fr_92px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
    >
      <div
        className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
        style={{ color: 'var(--viz-ink-2)' }}
      >
        {b.label}
      </div>
      <div
        className="flex h-[18px] items-stretch"
        style={{ width: `${Math.min(100, (b.value / max) * 100)}%` }}
      >
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
      <span className="whitespace-nowrap font-mono text-[11px] tabular-nums" style={{ color: 'var(--viz-ink)' }}>
        {sek(b.value, 0)}
        {suffix}
      </span>
    </div>
  );

  /**
   * Som `bar`, men med ett fast spår och ett streck vid jämförelsens pris
   * (100 %) — annars syns bara hur lång stapeln är, inte om den gått förbi
   * konkurrentens pris eller inte.
   */
  const indexBar = (b: BarSpec, max: number) => {
    const pct = Math.min(100, (b.value / max) * 100);
    const refPct = (100 / max) * 100;
    const over = b.value > 100;
    return (
      <div
        key={b.id}
        className="grid grid-cols-[178px_1fr_108px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
      >
        <div
          className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {b.label}
        </div>
        <div className="relative h-[18px] rounded-[3px]" style={{ background: 'var(--viz-grid)' }}>
          <span
            aria-hidden
            title="Jämförelsens pris — samma pris som konkurrenten"
            className="pointer-events-none absolute bottom-0 top-0 w-px"
            style={{ left: `${refPct}%`, background: 'var(--viz-ink-3)', opacity: 0.9 }}
          />
          <div
            tabIndex={0}
            role="img"
            aria-label={`${b.tipTitle}, ${b.label}: ${sek(b.value, 0)} %, ${overUnderLabel(b.value)}`}
            className="absolute bottom-0 left-0 top-0 min-w-[2px] cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
            style={{ width: `${pct}%`, background: `var(${b.varName})` }}
            onMouseEnter={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
            onMouseMove={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
            onFocus={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
            onMouseLeave={hideTip}
            onBlur={hideTip}
          />
        </div>
        <span
          className="whitespace-nowrap font-mono text-[11px] tabular-nums"
          style={{ color: over ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
        >
          {overUnderLabel(b.value)}
        </span>
      </div>
    );
  };

  return (
    <>
      <Card
        title="Bruttomarginal vid nuvarande pris"
        sub="Katalogpriset minus landad kostnad, som andel av priset. Delad skala 0–100 %, så raderna går att jämföra rakt av. Priserna sätts i marknadsjämförelsen längre ned — den här grafen sammanfattar dem."
        note={
          <>
            Marginalen varierar över sortimentet, och det är avsiktligt: priserna är satta mot
            marknaden, inte mot ett fast pålägg. Den är lägst där konkurrensen är hårdast, inte där
            produkten är billigast. <b>Väg marginalen mot volymen</b> — Kudde Sigrid är 16 sålda
            enheter och Kuddskydd 300, så det är Kuddskyddet som avgör om sortimentet bär sig. Landad
            kostnad är räknad per produkt på en enda storlek, så en produkt vars dyraste variant är
            större än så har en bättre marginal här än i verkligheten.
          </>
        }
      >
        <div className="flex flex-col gap-[9px]">
          {byInitialMargin.map(p => {
            const price = priceOf(p);
            const m = marginPct(p, price);
            return bar(
              {
                id: `${p.skuPrefix}-margin`,
                label: titleOf(p.skuPrefix),
                value: Math.max(0, m),
                varName: m < 0 ? '--viz-flag' : SERIES.ours.varName,
                tipTitle: titleOf(p.skuPrefix),
                tipRows: [
                  `${sek(m, 1)} % bruttomarginal`,
                  `${sek(price, 0)} kr pris − ${sek(landedOf(p.skuPrefix))} kr landad kostnad`,
                  `${sek(price - landedOf(p.skuPrefix), 0)} kr täckningsbidrag per styck`,
                ],
                tipNote: p.rationale,
              },
              100,
              ' %'
            );
          })}
        </div>
        <Axis ticks={[0, 25, 50, 75, 100]} max={100} unit="bruttomarginal" format={t => `${t} %`} />
      </Card>

      <Card
        title="Vårt pris mot marknaden"
        sub="Två mått per produkt. Den övre stapeln jämför mot den B2B-produkt vi bedömt vara närmast likvärdig. Den undre jämför mot det billigaste B2B-alternativ vi hittat över huvud taget — den prispunkt en inköpare faktiskt kan välja i stället för oss. Det grå strecket i varje stapel är jämförelsens pris. Stapeln stannar före strecket när vi är billigare och sticker förbi det när vi är dyrare."
        flag
        note={
          <>
            Mot närmaste motsvarighet ser allt bra ut. Mot golvet gör det inte det. <b>Täcke Daniel
            och Kudde Eric ligger båda kring 170 % av det billigaste alternativet</b> — Mandales
            fibertäcke på 190 kr och Livvs bollfiberkudde på 95 kr. Det är de två produkter som binder
            mest kapital i sändningen. Skillnaden är inte inbillad, den är produktkvalitet, men den
            måste gå att sälja in i ett anbud, annars är den inte värd något. Dunprodukterna är det
            motsatta: där ligger golvet på 1 199 respektive 825 kr och vår produkt är bättre än allt
            vi jämför mot. <b>Jämförelsen gäller den storlek analysen är gjord på</b> — övriga
            storlekar har sina egna motsvarigheter i marknadsjämförelsen nedanför.
          </>
        }
      >
        <Legend
          items={[
            { label: 'Mot närmaste motsvarighet', varName: SERIES.ours.varName },
            { label: 'Mot billigaste B2B-alternativ', varName: SERIES.floor.varName },
          ]}
        />
        <div className="flex flex-col gap-4">
          {byInitialFloor.map(p => {
            const price = priceOf(p);
            const near = primaryOf(p);
            const floor = floorOf(p);
            const idx = indexPct(p, price);
            const flr = floorPct(p, price);
            return (
              <div key={p.skuPrefix} className="flex flex-col gap-[5px]">
                <span className="text-[12.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
                  {titleOf(p.skuPrefix)}
                </span>
                {indexBar(
                  {
                    id: `${p.skuPrefix}-index`,
                    label: `${near.vendor} · ${sek(near.priceSek, 0)} kr`,
                    value: idx,
                    varName: idx > 100 ? '--viz-flag' : SERIES.ours.varName,
                    tipTitle: `${titleOf(p.skuPrefix)} mot närmaste motsvarighet`,
                    tipRows: [
                      `${sek(idx, 0)} % av ${near.vendor}`,
                      `${sek(price, 0)} kr mot ${sek(near.priceSek, 0)} kr`,
                      `${near.product} · ${near.size} cm`,
                    ],
                    tipNote: near.caveat ?? 'Närmaste motsvarighet i underlaget.',
                  },
                  INDEX_MAX
                )}
                {indexBar(
                  {
                    id: `${p.skuPrefix}-floor`,
                    label: `${floor.vendor} · ${sek(floor.priceSek, 0)} kr`,
                    value: flr,
                    varName: flr > 100 ? '--viz-flag' : SERIES.floor.varName,
                    tipTitle: `${titleOf(p.skuPrefix)} mot marknadens golv`,
                    tipRows: [
                      `${sek(flr, 0)} % av ${floor.vendor}`,
                      `${sek(price, 0)} kr mot ${sek(floor.priceSek, 0)} kr`,
                      `${floor.product} · ${floor.size} cm`,
                    ],
                    tipNote: floor.caveat ?? 'Billigaste B2B-alternativet i underlaget.',
                  },
                  INDEX_MAX
                )}
              </div>
            );
          })}
        </div>
        <Axis
          ticks={[0, 50, 100, 150, 200, 250]}
          max={INDEX_MAX}
          unit="av jämförelsen · streck vid 100 % = samma pris"
          format={t => `${t} %`}
        />
      </Card>

      <Tooltip tip={tip} />
    </>
  );
}
