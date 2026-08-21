'use client';

import { DEFAULT_PRICING_CONFIG, discountPercentFor, type PricingConfig } from '@/lib/pricingRules';

type Linear = PricingConfig['linear'];

const W = 640;
const H = 220;
const PLOT = { left: 40, top: 14, right: 12, bottom: 26 };
const PLOT_W = W - PLOT.left - PLOT.right;
const PLOT_H = H - PLOT.top - PLOT.bottom;

const qty = (n: number) => Math.round(n).toLocaleString('sv-SE');

/** Var kurvan bör sluta räknas ut till, så grafen visar taket plus lite marginal. */
function xRangeFor(linear: Linear, minimumOrderQuantity: number): number {
  const step = linear.quantityStep > 0 ? linear.quantityStep : 100;
  const stepsToCap =
    linear.percentPerStep > 0
      ? Math.min(200, Math.max(1, Math.ceil(linear.maxPercent / linear.percentPerStep)))
      : 6;
  return Math.max(linear.startQuantity, minimumOrderQuantity, 1) + step * (stepsToCap + 2);
}

/** Trappstegspunkterna kurvan faktiskt går genom, från samma funktion som prissätter en rad. */
function staircasePoints(config: PricingConfig, xMax: number): [number, number][] {
  const step = config.linear.quantityStep > 0 ? config.linear.quantityStep : xMax;
  const start = Math.min(Math.max(config.linear.startQuantity, 0), xMax);

  const points: [number, number][] = [[0, discountPercentFor(config, 0)]];
  if (start > 0) points.push([start, discountPercentFor(config, start)]);

  let x = start;
  while (x < xMax) {
    const y = discountPercentFor(config, x);
    const nextX = Math.min(x + step, xMax);
    points.push([nextX, y]);
    const nextY = discountPercentFor(config, nextX);
    if (nextY !== y) points.push([nextX, nextY]);
    x = nextX;
  }
  return points;
}

function scale(points: [number, number][], xMax: number, yMax: number) {
  return points.map(([qx, qy]): [number, number] => [
    PLOT.left + (qx / xMax) * PLOT_W,
    PLOT.top + PLOT_H - (qy / yMax) * PLOT_H,
  ]);
}

function linePath(scaled: [number, number][]): string {
  return scaled.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function areaPath(scaled: [number, number][]): string {
  const baseline = PLOT.top + PLOT_H;
  const [firstX] = scaled[0];
  const [lastX] = scaled[scaled.length - 1];
  return `${linePath(scaled)} L${lastX.toFixed(2)},${baseline} L${firstX.toFixed(2)},${baseline} Z`;
}

export default function LinearCurveChart({
  linear,
  minimumOrderQuantity,
}: {
  linear: Linear;
  minimumOrderQuantity: number;
}) {
  const config: PricingConfig = {
    strategy: 'linear',
    tiers: [],
    linear,
    orderValue: DEFAULT_PRICING_CONFIG.orderValue,
    marginTargetPercent: 0,
    marginFloorPercent: null,
    minimumOrderQuantity,
    appliesTo: 'mto',
  };

  const xMax = xRangeFor(linear, minimumOrderQuantity);
  const yMax = Math.max(linear.maxPercent, 1);
  const points = staircasePoints(config, xMax);
  const scaled = scale(points, xMax, yMax);

  const startX = PLOT.left + (Math.min(linear.startQuantity, xMax) / xMax) * PLOT_W;
  const capY = PLOT.top + PLOT_H - (Math.min(linear.maxPercent, yMax) / yMax) * PLOT_H;

  const moqQuantity = Math.min(Math.max(minimumOrderQuantity, 0), xMax);
  const moqDiscount = discountPercentFor(config, moqQuantity);
  const [moqX, moqY] = scale([[moqQuantity, moqDiscount]], xMax, yMax)[0];

  const yTicks = [0, yMax / 2, yMax];
  const xTicks = [0, xMax / 2, xMax];

  const capQuantity =
    linear.percentPerStep > 0
      ? linear.startQuantity + Math.ceil(linear.maxPercent / linear.percentPerStep) * Math.max(linear.quantityStep, 1)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          capQuantity != null
            ? `Rabattkurva: ${qty(minimumOrderQuantity)} st ger ${moqDiscount} % rabatt, taket på ${linear.maxPercent} % nås vid ${qty(capQuantity)} st.`
            : `Rabattkurva: ${qty(minimumOrderQuantity)} st ger ${moqDiscount} % rabatt.`
        }
      >
        {yTicks.map(t => {
          const y = PLOT.top + PLOT_H - (t / yMax) * PLOT_H;
          return (
            <g key={t}>
              <line
                x1={PLOT.left}
                x2={W - PLOT.right}
                y1={y}
                y2={y}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text x={PLOT.left - 8} y={y + 3} textAnchor="end" fontSize={10.5} fill="var(--viz-ink-3)">
                {Math.round(t)}%
              </text>
            </g>
          );
        })}

        {xTicks.map(t => (
          <text
            key={t}
            x={PLOT.left + (t / xMax) * PLOT_W}
            y={H - 6}
            textAnchor={t === 0 ? 'start' : t === xMax ? 'end' : 'middle'}
            fontSize={10.5}
            fill="var(--viz-ink-3)"
          >
            {qty(t)} st
          </text>
        ))}

        {linear.maxPercent > 0 && linear.maxPercent < yMax && (
          <line
            x1={PLOT.left}
            x2={W - PLOT.right}
            y1={capY}
            y2={capY}
            stroke="var(--viz-ink-3)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {linear.startQuantity > 0 && linear.startQuantity < xMax && (
          <line
            x1={startX}
            x2={startX}
            y1={PLOT.top}
            y2={PLOT.top + PLOT_H}
            stroke="var(--viz-ink-3)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        <path d={areaPath(scaled)} fill="var(--viz-s2)" fillOpacity={0.12} stroke="none" />
        <path d={linePath(scaled)} fill="none" stroke="var(--viz-s2)" strokeWidth={2} />

        <circle cx={moqX} cy={moqY} r={4} fill="var(--viz-s2)" stroke="var(--viz-surface)" strokeWidth={1.5} />
      </svg>

      <p className="text-[12.5px] text-ink-3">
        Vid minsta orderantal ({qty(minimumOrderQuantity)} st): <b className="text-ink-2">{moqDiscount} % rabatt</b>.
        Taket är {linear.maxPercent} %.
      </p>
    </div>
  );
}
