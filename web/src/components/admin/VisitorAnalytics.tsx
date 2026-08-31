'use client';

/**
 * Besöksstatistiken i adminvyn.
 *
 * Bara besökssidan: vilka som kommer hit, varifrån, på vilken enhet och vad de
 * tittar på. Ordrar och intäkter hör hemma under Handel och räknas inte här.
 *
 * Hämtar själv i stället för att serverrenderas, av två skäl: perioden ska gå
 * att byta utan att sidan laddas om, och siffrorna ska kunna ticka på medan
 * fliken står öppen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Globe2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { EmptyState, Panel, StatRow, StatTile } from '@/components/admin/ui';
import type { AnalyticsSummary, AnalyticsRange, NamedCount, SeriesPoint } from '@/lib/analyticsDb';
import { countryName } from '@/lib/adminMapGeo';

// Kartan drar in Leaflet och 1,5 MB geometri. Den laddas när sidan visas, inte
// när adminvyn buntas — och aldrig på servern, där det inte finns någon DOM.
const TrafficMap = dynamic(() => import('@/components/admin/TrafficMap'), {
  ssr: false,
  loading: () => <div className="h-[430px] animate-pulse rounded-card bg-plane" />,
});

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '24h', label: 'Senaste dygnet' },
  { value: '7', label: '7 dagar' },
  { value: '30', label: '30 dagar' },
  { value: '90', label: '90 dagar' },
];

const number = new Intl.NumberFormat('sv-SE');
const compact = new Intl.NumberFormat('sv-SE', { notation: 'compact', maximumFractionDigits: 1 });

/** Uppdateringen medan fliken står öppen. Samma takt som i AiF. */
const POLL_MS = 30_000;

function changeLabel(current: number, previous: number): { text: string; tone: string } {
  if (!previous) {
    return current
      ? { text: 'Nytt den här perioden', tone: 'var(--adm-ok)' }
      : { text: 'Ingen data föregående period', tone: 'var(--viz-ink-3)' };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { text: 'Oförändrat mot föregående period', tone: 'var(--viz-ink-3)' };
  return {
    text: `${percent > 0 ? '↑' : '↓'} ${Math.abs(percent)} % mot föregående period`,
    tone: percent > 0 ? 'var(--adm-ok)' : 'var(--adm-danger)',
  };
}

function Metric({
  label,
  value,
  current,
  previous,
  accent,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  accent: string;
}) {
  const change = changeLabel(current, previous);
  return (
    <StatTile
      label={label}
      value={value}
      accent={accent}
      hint={<span style={{ color: change.tone }}>{change.text}</span>}
    />
  );
}

// ----- Trafiklinjen --------------------------------------------------------

function pointLabel(date: string, granularity: 'hour' | 'day'): string {
  if (granularity === 'hour') return `kl ${date.slice(11)}`;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Visningar och besökare över tid.
 *
 * Ritas som en enda SVG med `preserveAspectRatio="none"`: linjen ska sträckas
 * i bredd med kortet men behålla sin höjd, vilket ett rutnät av divar inte kan.
 * Träffytorna är egna rektanglar med `tabindex`, så serien går att läsa med
 * tangentbord och inte bara med mus.
 */
function TrafficChart({
  series,
  granularity,
}: {
  series: SeriesPoint[];
  granularity: 'hour' | 'day';
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (!series.some(point => point.views > 0)) {
    return (
      <p className="px-4 py-12 text-center text-[13.5px] text-ink-2">
        Inga besök med samtycke under perioden ännu.
      </p>
    );
  }

  const width = 900;
  const height = 220;
  const top = 12;
  const plot = height - top - 28;
  const max = Math.max(1, ...series.map(point => point.views));
  const xOf = (index: number) => (series.length === 1 ? width / 2 : (index * width) / (series.length - 1));
  const yOf = (value: number) => top + plot - (value / max) * plot;
  const points = (key: 'views' | 'visitors') =>
    series.map((point, index) => `${xOf(index).toFixed(1)},${yOf(point[key]).toFixed(1)}`).join(' ');

  const hitWidth = width / Math.max(1, series.length - 1);
  const active = hover === null ? null : series[hover];
  // Högst sex etiketter under axeln — fler blir en gråsudd vid 90 dagar.
  const labelStep = Math.max(1, Math.ceil(series.length / 6));

  return (
    <div className="relative pb-6">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Sidvisningar och besökare över tid"
        className="block h-[230px] w-full overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-s3)" stopOpacity=".2" />
            <stop offset="100%" stopColor="var(--viz-s3)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(ratio => (
          <line
            key={ratio}
            x1="0"
            x2={width}
            y1={top + plot * ratio}
            y2={top + plot * ratio}
            stroke="var(--viz-grid)"
            strokeWidth={1}
          />
        ))}
        <polygon points={`0,${top + plot} ${points('views')} ${width},${top + plot}`} fill="url(#traffic-fill)" />
        <polyline
          points={points('views')}
          fill="none"
          stroke="var(--viz-ink)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={points('visitors')}
          fill="none"
          stroke="var(--viz-s3)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <>
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={top}
              y2={top + plot}
              stroke="var(--viz-ink-3)"
              strokeWidth={1}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={xOf(hover)} cy={yOf(series[hover].views)} r={4} fill="var(--viz-ink)" stroke="var(--viz-surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <circle cx={xOf(hover)} cy={yOf(series[hover].visitors)} r={4} fill="var(--viz-s3)" stroke="var(--viz-surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
        {series.map((point, index) => (
          <rect
            key={point.date}
            x={Math.max(0, xOf(index) - hitWidth / 2)}
            y={0}
            width={Math.min(width, xOf(index) + hitWidth / 2) - Math.max(0, xOf(index) - hitWidth / 2)}
            height={height}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${pointLabel(point.date, granularity)}: ${point.views} visningar, ${point.visitors} besökare`}
            className="cursor-crosshair outline-none"
            onPointerEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
          />
        ))}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 rounded-[9px] border border-rule bg-surface px-3 py-2 shadow-card"
          style={{ left: `${(xOf(hover) / width) * 100}%`, top: 0 }}
        >
          <div className="mb-1 text-[11px] text-ink-3">{pointLabel(active.date, granularity)}</div>
          <div className="flex items-center justify-between gap-5 text-[12.5px] tabular-nums text-ink">
            <span>Visningar</span>
            <b>{number.format(active.views)}</b>
          </div>
          <div className="flex items-center justify-between gap-5 text-[12.5px] tabular-nums text-ink">
            <span>Besökare</span>
            <b>{number.format(active.visitors)}</b>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-5">
        {series.map((point, index) =>
          index % labelStep === 0 || index === series.length - 1 ? (
            <span
              key={point.date}
              className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] text-ink-3"
              style={{
                left: `${series.length === 1 ? 50 : (index / (series.length - 1)) * 100}%`,
                transform: index === 0 ? 'none' : index === series.length - 1 ? 'translateX(-100%)' : undefined,
              }}
            >
              {pointLabel(point.date, granularity)}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

// ----- Listor --------------------------------------------------------------

type BarRow = { key: string; name: string; sub: string; value: number };

function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (!rows.length) return <p className="px-2 py-8 text-center text-[13.5px] text-ink-2">{empty}</p>;
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <div className="flex flex-col">
      {rows.map(row => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-rule py-2.5 first:border-t-0">
          <span className="truncate text-[13.5px] text-ink" title={row.name}>
            {row.name}
          </span>
          <span className="row-span-2 self-center font-mono text-[13px] tabular-nums text-ink">
            {number.format(row.value)}
          </span>
          <span className="truncate text-[11.5px] text-ink-3">{row.sub}</span>
          <span className="col-span-2 h-[3px] overflow-hidden rounded-full bg-plane">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: 'var(--viz-s3)' }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function visitRows(items: NamedCount[]): BarRow[] {
  return items.map(item => ({
    key: item.label,
    name: item.label,
    sub: `${number.format(item.visitors)} besökare`,
    value: item.visits,
  }));
}

/**
 * Besöken per timme på dygnet, i svensk tid. Svarar på när det är värt att
 * lägga ut något — inte hur många det var, vilket linjen ovan redan visar.
 */
function HourChart({ hours }: { hours: AnalyticsSummary['hours'] }) {
  const max = Math.max(1, ...hours.map(hour => hour.views));
  return (
    <>
      <div className="grid h-[134px] grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-[3px] pt-2">
        {hours.map(hour => (
          <div
            key={hour.hour}
            title={`${String(hour.hour).padStart(2, '0')}:00 · ${number.format(hour.views)} visningar`}
            className="rounded-t-[3px]"
            style={{
              height: `${hour.views ? Math.max(3, (hour.views / max) * 100) : 2}%`,
              background: hour.views ? 'var(--viz-s3)' : 'var(--viz-grid)',
              opacity: hour.views ? 0.9 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-3">
        {['00', '06', '12', '18', '23'].map(hour => (
          <span key={hour}>{hour}:00</span>
        ))}
      </div>
    </>
  );
}

// ----- Sidan ---------------------------------------------------------------

export default function VisitorAnalytics({ accent }: { accent: string }) {
  const [range, setRange] = useState<AnalyticsRange>('30');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Sant bara för hämtningar användaren själv bad om. En bakgrundshämtning får
  // aldrig blanka sidan som står och läses.
  const pending = useRef(false);

  const load = useCallback(
    async (nextRange: AnalyticsRange, silent: boolean) => {
      if (pending.current) return;
      pending.current = true;
      if (!silent) setLoading(true);
      try {
        const response = await fetch(`/api/admin/analytics?range=${nextRange}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        setData((await response.json()) as AnalyticsSummary);
        setError(null);
      } catch {
        if (!silent) setError('Kunde inte hämta statistiken. Försök igen.');
      } finally {
        pending.current = false;
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(range, false);
  }, [range, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Ingen poll mot en flik som ligger i bakgrunden: den läses inte, och
      // varje varv är fjorton frågor mot databasen.
      if (document.visibilityState === 'visible') load(range, true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [range, load]);

  const totals = data?.totals ?? { views: 0, visitors: 0, sessions: 0 };
  const previous = data?.previous ?? { views: 0, visitors: 0, sessions: 0 };
  const perSession = totals.sessions ? totals.views / totals.sessions : 0;
  const previousPerSession = previous.sessions ? previous.views / previous.sessions : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Period" className="inline-flex rounded-[8px] border border-rule bg-plane p-[2px]">
          {RANGES.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
              className={
                range === option.value
                  ? 'rounded-[6px] bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-card'
                  : 'rounded-[6px] px-3 py-1.5 text-[12.5px] text-ink-3 hover:text-ink-2'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => load(range, false)}
          className="inline-flex items-center gap-2 rounded-[8px] border border-rule px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-plane hover:text-ink"
        >
          <RefreshCw size={13} strokeWidth={1.75} className={loading ? 'animate-spin' : undefined} aria-hidden />
          Uppdatera
        </button>
      </div>

      {error && (
        <p className="rounded-card border border-rule bg-surface px-4 py-3 text-[13.5px]" style={{ color: 'var(--adm-danger)' }}>
          {error}
        </p>
      )}

      <StatRow>
        <Metric label="Unika besökare" value={number.format(totals.visitors)} current={totals.visitors} previous={previous.visitors} accent={accent} />
        <Metric label="Sidvisningar" value={number.format(totals.views)} current={totals.views} previous={previous.views} accent="var(--viz-s1)" />
        <Metric label="Besök" value={number.format(totals.sessions)} current={totals.sessions} previous={previous.sessions} accent="var(--viz-s4)" />
        <Metric label="Sidor per besök" value={perSession.toFixed(1)} current={perSession} previous={previousPerSession} accent="var(--viz-s2)" />
      </StatRow>

      <Panel
        title="Trafik"
        meta={data?.range.granularity === 'hour' ? 'Per timme · svensk tid' : 'Per dygn · svensk tid'}
        actions={
          <div className="flex gap-4 text-[12.5px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <i className="block h-2 w-2 rounded-full" style={{ background: 'var(--viz-ink)' }} />
              Visningar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="block h-2 w-2 rounded-full" style={{ background: 'var(--viz-s3)' }} />
              Besökare
            </span>
          </div>
        }
      >
        <TrafficChart series={data?.series ?? []} granularity={data?.range.granularity ?? 'day'} />
      </Panel>

      <Panel title="Geografi" meta="Natural Earth · klicka för att borra ner">
        {data && data.countries.length > 0 ? (
          <TrafficMap geo={{ countries: data.countries, regions: data.regions, locations: data.locations }} />
        ) : (
          <EmptyState
            icon={Globe2}
            title="Inga platser ännu"
            description="Kartan fylls i så fort besök med samtycke börjar komma in."
          />
        )}
      </Panel>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <Panel title="Källor" meta="Besök">
          <BarList
            rows={(data?.sources ?? []).map(source => ({
              key: `${source.category}:${source.label}`,
              name: source.label,
              sub: `${sourceCategoryLabel(source.category)} · ${number.format(source.visitors)} besökare`,
              value: source.visits,
            }))}
            empty="Ingen data för perioden."
          />
        </Panel>
        <Panel title="Enheter" meta="Besök">
          <BarList rows={visitRows(data?.devices ?? [])} empty="Ingen data för perioden." />
        </Panel>
        <Panel title="Webbläsare" meta="Besök">
          <BarList rows={visitRows(data?.browsers ?? [])} empty="Ingen data för perioden." />
        </Panel>
        <Panel title="Operativsystem" meta="Besök">
          <BarList rows={visitRows(data?.operatingSystems ?? [])} empty="Ingen data för perioden." />
        </Panel>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Panel title="Mest besökta sidor" meta="Sidvisningar">
          <BarList
            rows={(data?.pages ?? []).map(page => ({
              key: page.path,
              name: page.path === '/' ? 'Startsidan' : page.path,
              sub: `${number.format(page.visitors)} besökare`,
              value: page.views,
            }))}
            empty="Ingen data för perioden."
          />
        </Panel>
        <Panel title="Mest visade produkter" meta="Sidvisningar">
          <BarList
            rows={(data?.products ?? []).map(product => ({
              key: product.productHandle,
              name: product.productHandle,
              sub: `${number.format(product.visitors)} besökare`,
              value: product.views,
            }))}
            empty="Inga produktsidor visade under perioden."
          />
        </Panel>
        <Panel title="Städer" meta="Besökare">
          <BarList
            rows={(data?.locations ?? []).slice(0, 12).map(row => ({
              key: `${row.countryCode}-${row.region}-${row.city}`,
              name: row.city || row.region || countryName(row.countryCode),
              sub: `${[row.city && row.region && row.city !== row.region ? row.region : '', countryName(row.countryCode)]
                .filter(Boolean)
                .join(', ')} · ${number.format(row.views)} visningar`,
              value: row.visitors,
            }))}
            empty="Ingen data för perioden."
          />
        </Panel>
        <Panel title="Språk" meta="Besök">
          <BarList
            rows={(data?.locales ?? []).map(item => ({
              key: item.label,
              name: item.label === 'en' ? 'Engelska' : 'Svenska',
              sub: `${number.format(item.visitors)} besökare`,
              value: item.visits,
            }))}
            empty="Ingen data för perioden."
          />
        </Panel>
      </div>

      <Panel
        title="När på dygnet"
        meta="Svensk tid"
        actions={
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <MonitorSmartphone size={13} strokeWidth={1.75} aria-hidden />
            {compact.format(totals.views)} visningar
          </span>
        }
      >
        <HourChart hours={data?.hours ?? Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0, visitors: 0 }))} />
      </Panel>
    </div>
  );
}

function sourceCategoryLabel(category: string): string {
  switch (category) {
    case 'direct':
      return 'Direkt';
    case 'search':
      return 'Sök';
    case 'social':
      return 'Sociala medier';
    case 'email':
      return 'E-post';
    case 'referral':
      return 'Hänvisning';
    default:
      return 'Övrigt';
  }
}
