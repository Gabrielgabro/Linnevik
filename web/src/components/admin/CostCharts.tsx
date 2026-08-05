'use client';

import type { LandedCostProduct } from '@/data/landedCost';
import { landedPerPcs, lineTotal } from '@/data/landedCost';
import { Axis, Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

type Props = { products: LandedCostProduct[] };

type Part = { key: 'goodsPerPcs' | 'freightPerPcs' | 'dutyPerPcs'; label: string; varName: string };

const PARTS: Part[] = [
  { key: 'goodsPerPcs', label: 'Betald varukostnad', varName: '--viz-s1' },
  { key: 'freightPerPcs', label: 'Frakt & logistik', varName: '--viz-s2' },
  { key: 'dutyPerPcs', label: 'Tull', varName: '--viz-s3' },
];

export default function CostCharts({ products }: Props) {
  const { tip, showTip, hideTip } = useTip();

  const capital = products.reduce((sum, p) => sum + lineTotal(p), 0);
  const shareOf = (...prefixes: string[]) =>
    (products
      .filter(p => prefixes.includes(p.skuPrefix))
      .reduce((sum, p) => sum + lineTotal(p), 0) /
      capital) *
    100;
  const MAX_PER_PCS = 450;
  const MAX_LINE = 18000;

  const stackedRow = (p: LandedCostProduct, normalized: boolean) => {
    const landed = landedPerPcs(p);
    const width = normalized ? 100 : (landed / MAX_PER_PCS) * 100;
    const addOnShare = ((p.freightPerPcs + p.dutyPerPcs) / landed) * 100;

    return (
      <div
        key={`${p.skuPrefix}-${normalized}`}
        className="grid grid-cols-[132px_1fr_88px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
      >
        <div
          className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {p.title}
        </div>
        <div className="flex h-[22px] items-stretch gap-0.5" style={{ width: `${width}%` }}>
          {PARTS.map((part, i) => {
            const value = p[part.key];
            const share = (value / landed) * 100;
            return (
              <div
                key={part.key}
                tabIndex={0}
                role="img"
                aria-label={`${p.title}, ${part.label}: ${sek(value)} kronor per styck, ${sek(share, 1)} procent av styckkostnaden.`}
                className="min-w-[2px] cursor-default transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
                style={{
                  background: `var(${part.varName})`,
                  flex: `${value} 0 0`,
                  borderRadius: i === 0 ? '3px 0 0 3px' : i === PARTS.length - 1 ? '0 4px 4px 0' : 0,
                }}
                onMouseEnter={e => showTip(e, tipFor(p, part, value, share, landed))}
                onMouseMove={e => showTip(e, tipFor(p, part, value, share, landed))}
                onFocus={e => showTip(e, tipFor(p, part, value, share, landed))}
                onMouseLeave={() => hideTip()}
                onBlur={() => hideTip()}
              />
            );
          })}
        </div>
        <span
          className="whitespace-nowrap font-mono text-[11px] tabular-nums"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {normalized ? `${sek(addOnShare, 0)} %` : `${sek(landed)} kr`}
        </span>
      </div>
    );
  };

  const tipFor = (p: LandedCostProduct, part: Part, value: number, share: number, landed: number) => ({
    title: p.title,
    rows: [`${part.label}`, `${sek(value)} SEK / st · ${sek(share, 1)} %`],
    note: `Landad kostnad ${sek(landed)} SEK · ${p.qty} st · ${sek(p.cbm, 2)} CBM`,
  });

  const soloRow = (p: LandedCostProduct) => {
    const total = lineTotal(p);
    const share = (total / capital) * 100;
    return (
      <div
        key={p.skuPrefix}
        className="grid grid-cols-[132px_1fr_88px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
      >
        <div
          className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {p.title}
        </div>
        <div className="flex h-[22px] items-stretch" style={{ width: `${(total / MAX_LINE) * 100}%` }}>
          <div
            tabIndex={0}
            role="img"
            aria-label={`${p.title}: ${sek(total)} kronor totalt, ${sek(share, 1)} procent av sändningens kapital.`}
            className="min-w-[2px] flex-1 cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
            style={{ background: 'var(--viz-s1)' }}
            onMouseEnter={e => showTip(e, soloTip(p, total, share))}
            onMouseMove={e => showTip(e, soloTip(p, total, share))}
            onFocus={e => showTip(e, soloTip(p, total, share))}
            onMouseLeave={() => hideTip()}
            onBlur={() => hideTip()}
          />
        </div>
        <span
          className="whitespace-nowrap font-mono text-[11px] tabular-nums"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {sek(total, 0)} kr
        </span>
      </div>
    );
  };

  const soloTip = (p: LandedCostProduct, total: number, share: number) => ({
    title: p.title,
    rows: [`${sek(total)} SEK totalt`, `${sek(share, 1)} % av sändningens kapital`],
    note: `${p.qty} st à ${sek(landedPerPcs(p))} SEK landad kostnad`,
  });

  return (
    <>
      <Card
        title="Landad kostnad per styck"
        sub="Vad en enhet kostar när den står på lagret i Uppsala. Segmenten är staplade i den ordning kostnaden uppstår: vara, transport, tull."
        note={
          <>
            Skalan gör spridningen tydlig: <b>Täcke Sebastian kostar 32 gånger mer per styck än ett
            kuddskydd.</b> Det är därför den här vyn ensam inte räcker för att sätta pris — se nästa graf.
          </>
        }
      >
        <Legend items={PARTS} />
        <div className="flex flex-col gap-[9px]">{products.map(p => stackedRow(p, false))}</div>
        <Axis ticks={[0, 150, 300, 450]} max={MAX_PER_PCS} unit="kr/st" format={t => sek(t, 0)} />
      </Card>

      <Card
        title="Hur kostnaden är sammansatt"
        sub="Samma produkter, samma ordning, men varje stapel normerad till 100 %. Nu syns vilken andel av styckkostnaden som är frakt och tull i stället för vara — siffran till höger är den andelen."
        flag
        note={
          <>
            <b>Kudde Eric bär inte sin frakt.</b> 61 % av styckkostnaden är frakt och tull, och frakten
            ensam (39,28 kr) är dyrare än själva kudden (27,86 kr). Kudden är billig men skrymmande:
            250 st tar 4,28 CBM, alltså 55 % av hela containervolymen. Frakt betalas på volym, inte vikt.
          </>
        }
      >
        <Legend items={PARTS} />
        <div className="flex flex-col gap-[9px]">{products.map(p => stackedRow(p, true))}</div>
        <Axis ticks={[0, 25, 50, 75, 100]} max={100} unit="frakt + tull" format={t => `${t} %`} />
      </Card>

      <Card
        title="Var pengarna faktiskt tog vägen"
        sub="Landad kostnad gånger antal. Ordningen är densamma som ovan — och den vänder helt."
        note={
          <>
            De två dyraste produkterna per styck, Sebastian och Sigrid, är tillsammans{' '}
            <b>{sek(shareOf('TAC-SEB', 'KUD-SIG'), 0)} % av kapitalet</b>. Kudde Eric ensam är{' '}
            {sek(shareOf('KUD-ERI'), 0)} %. Prissättningen bör
            läggas mest möda på de produkter som binder mest pengar, inte på dem med högst styckpris.
          </>
        }
      >
        <div className="flex flex-col gap-[9px]">{products.map(soloRow)}</div>
        <Axis ticks={[0, 6000, 12000, 18000]} max={MAX_LINE} unit="SEK" format={t => sek(t, 0)} />
      </Card>

      <Tooltip tip={tip} />
    </>
  );
}
