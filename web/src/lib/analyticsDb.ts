/**
 * Besöksstatistiken: en skrivning från butiken, en läsning till adminvyn.
 *
 * Bara besökssidan. Ordrar och intäkter räknas inte här utan i `ordersDb` och
 * på /admin/commerce — det här svarar på vilka som kommer hit, varifrån och
 * vad de tittar på.
 *
 * Alla fönster och alla etiketter är i svensk tid (se `analyticsTime.ts`).
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  acquisitionOf,
  geoOf,
  technologyOf,
  type VisitInput,
} from '@/lib/analyticsEvent';
import {
  instantOfLocal,
  localDayKey,
  localHourKey,
  nextDayKey,
  startOfLocalDay,
  TZ,
} from '@/lib/analyticsTime';

export function analyticsConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Hur länge en händelse sparas. Städas av dygnskörningen. */
export const RETENTION_DAYS = 400;

/**
 * Skriver ett besök. `on conflict do nothing` på `event_id`: en `keepalive`-
 * fetch som webbläsaren skickar om vid sidbyte får inte bli två besök.
 */
export async function recordVisit(input: VisitInput, headers: Headers, siteHost: string): Promise<void> {
  const source = acquisitionOf(input, siteHost);
  const client = technologyOf(headers);
  const geo = geoOf(headers);

  await getDb().execute(sql`
    insert into analytics_events (
      event_id, visitor_id, session_id, path, locale, event_type, product_handle,
      referrer_host, source_category, source_detail,
      country_code, region, region_code, city, timezone, latitude, longitude,
      device_category, browser_name, os_name
    ) values (
      ${input.eventId}, ${input.visitorId}, ${input.sessionId}, ${input.path},
      ${input.locale}, ${input.eventType}, ${input.productHandle || null},
      ${source.referrerHost}, ${source.category}, ${source.detail.slice(0, 160)},
      ${geo.countryCode}, ${geo.region}, ${geo.regionCode}, ${geo.city},
      ${geo.timezone}, ${geo.latitude}, ${geo.longitude},
      ${client.device}, ${client.browser}, ${client.operatingSystem}
    )
    on conflict ("event_id") do nothing
  `);
}

/** Rensar händelser äldre än gallringsgränsen. Anropas av dygnskörningen. */
export async function pruneAnalyticsEvents(): Promise<number> {
  if (!analyticsConfigured()) return 0;
  try {
    const result = await getDb().execute(sql`
      delete from analytics_events
       where occurred_at < now() - make_interval(days => ${RETENTION_DAYS})
    `);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('[analytics] Kunde inte gallra händelser:', error);
    return 0;
  }
}

// ----- Läsning -------------------------------------------------------------

export type AnalyticsRange = '24h' | '7' | '30' | '90';

export function parseRange(value: string | null): AnalyticsRange {
  return value === '24h' || value === '7' || value === '90' ? value : '30';
}

type Window = {
  range: AnalyticsRange;
  granularity: 'hour' | 'day';
  from: Date;
  to: Date;
  /** Lika långt fönster närmast före, för jämförelsesiffran. */
  previousFrom: Date;
  previousTo: Date;
};

function windowFor(range: AnalyticsRange, now = new Date()): Window {
  if (range === '24h') {
    const from = new Date(now.getTime() - 24 * 3_600_000);
    return {
      range,
      granularity: 'hour',
      from,
      to: now,
      previousFrom: new Date(from.getTime() - 24 * 3_600_000),
      previousTo: from,
    };
  }
  // Dygnsfönstren börjar vid midnatt, så "senaste 7 dagarna" är sju hela
  // staplar och inte sex plus två halva.
  const days = Number(range);
  const today = startOfLocalDay(now);
  let from = today;
  for (let step = 1; step < days; step += 1) from = previousLocalDay(from);
  let previousFrom = from;
  for (let step = 0; step < days; step += 1) previousFrom = previousLocalDay(previousFrom);
  return { range, granularity: 'day', from, to: now, previousFrom, previousTo: from };
}

function previousLocalDay(dayStart: Date): Date {
  // Ett dygn tillbaka i kalendern, inte 24 timmar: växlingsdygnen är 23 och 25
  // timmar långa och skulle annars glida.
  const key = localDayKey(dayStart);
  const [year, month, day] = key.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return instantOfLocal(
    previous.getUTCFullYear(),
    previous.getUTCMonth() + 1,
    previous.getUTCDate()
  );
}

export type SeriesPoint = { date: string; views: number; visitors: number };
export type NamedCount = { label: string; visits: number; visitors: number };
export type SourceRow = NamedCount & { category: string };
export type PageRow = { path: string; views: number; visitors: number };
export type ProductRow = { productHandle: string; views: number; visitors: number };
export type HourRow = { hour: number; views: number; visitors: number };
export type CountryRow = { countryCode: string | null; views: number; visitors: number };
export type RegionRow = CountryRow & { regionCode: string | null; region: string | null };
export type LocationRow = RegionRow & {
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type AnalyticsTotals = { views: number; visitors: number; sessions: number };

export type AnalyticsSummary = {
  range: { range: AnalyticsRange; granularity: 'hour' | 'day'; from: string; to: string };
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  series: SeriesPoint[];
  sources: SourceRow[];
  devices: NamedCount[];
  browsers: NamedCount[];
  operatingSystems: NamedCount[];
  locales: NamedCount[];
  countries: CountryRow[];
  regions: RegionRow[];
  locations: LocationRow[];
  pages: PageRow[];
  products: ProductRow[];
  hours: HourRow[];
};

const EMPTY_TOTALS: AnalyticsTotals = { views: 0, visitors: 0, sessions: 0 };

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

/**
 * Fyller igen tomma dygn eller timmar i serien. Utan det hoppar linjen från
 * måndag till torsdag som om onsdagen inte funnits.
 */
function fillSeries(rows: SeriesPoint[], window: Window): SeriesPoint[] {
  const found = new Map(rows.map(row => [row.date, row]));
  const points: SeriesPoint[] = [];

  if (window.granularity === 'hour') {
    // Från nästa hela timme efter fönstrets start, så att stapeln längst till
    // vänster inte är en halv timme lång.
    const start = new Date(window.from);
    start.setUTCMinutes(0, 0, 0);
    for (let step = 1; step <= 24; step += 1) {
      const key = localHourKey(new Date(start.getTime() + step * 3_600_000));
      points.push(found.get(key) ?? { date: key, views: 0, visitors: 0 });
    }
    return points;
  }

  let key = localDayKey(window.from);
  const last = localDayKey(window.to);
  for (let guard = 0; guard < 400; guard += 1) {
    points.push(found.get(key) ?? { date: key, views: 0, visitors: 0 });
    if (key === last) break;
    key = nextDayKey(key);
  }
  return points;
}

/**
 * Allt adminvyn behöver, i ett anrop.
 *
 * `page_view` och `product_view` är båda sidvisningar — en produktsida är en
 * sida. Skillnaden finns bara för att kunna räkna produkter för sig, så varje
 * fråga som handlar om trafik räknar båda.
 */
export async function analyticsSummary(range: AnalyticsRange): Promise<AnalyticsSummary> {
  const window = windowFor(range);
  const db = getDb();
  const from = window.from.toISOString();
  const to = window.to.toISOString();

  const bucket =
    window.granularity === 'hour'
      ? sql`to_char(occurred_at at time zone ${TZ}, 'YYYY-MM-DD"T"HH24:00')`
      : sql`to_char(occurred_at at time zone ${TZ}, 'YYYY-MM-DD')`;

  const totalsFor = (start: string, end: string) => db.execute(sql`
    select count(*)::int as views,
           count(distinct visitor_id)::int as visitors,
           count(distinct session_id)::int as sessions
      from analytics_events
     where occurred_at >= ${start} and occurred_at < ${end}
  `);

  /** Samma form för varje enkolumnsuppdelning: etikett, besök, besökare. */
  const breakdown = (column: ReturnType<typeof sql>, limit: number) => db.execute(sql`
    select ${column} as label,
           count(distinct session_id)::int as visits,
           count(distinct visitor_id)::int as visitors
      from analytics_events
     where occurred_at >= ${from} and occurred_at < ${to}
     group by 1
     order by visits desc, visitors desc
     limit ${limit}
  `);

  const [
    totals,
    previous,
    series,
    sources,
    devices,
    browsers,
    operatingSystems,
    locales,
    countries,
    regions,
    locations,
    pages,
    products,
    hours,
  ] = await Promise.all([
    totalsFor(from, to),
    totalsFor(window.previousFrom.toISOString(), window.previousTo.toISOString()),
    db.execute(sql`
      select ${bucket} as date,
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1
       order by 1 asc
    `),
    db.execute(sql`
      select source_category as category,
             source_detail as label,
             count(distinct session_id)::int as visits,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1, 2
       order by visits desc, visitors desc
       limit 10
    `),
    breakdown(sql`device_category`, 8),
    breakdown(sql`browser_name`, 10),
    breakdown(sql`os_name`, 10),
    breakdown(sql`locale`, 4),
    // Kartan skuggar tre nivåer, och varje nivå har sin egen fråga. Att räkna
    // fram landets summa ur stadsraderna gjorde skuggningen beroende av hur
    // tunt trafiken var spridd: ett land med besökare i många små städer kunde
    // få varje rad under gränsen och försvinna helt från världskartan.
    db.execute(sql`
      select country_code as "countryCode",
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1
       order by visitors desc, views desc
       limit 300
    `),
    // Medvetet utan koordinater: ett medelvärde över alla städer i en region är
    // ingen plats. Kartan placerar oplacerade regioner ur stadsraderna nedan.
    db.execute(sql`
      select country_code as "countryCode", region_code as "regionCode", region,
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1, 2, 3
       order by visitors desc, views desc
       limit 1000
    `),
    db.execute(sql`
      select country_code as "countryCode", region_code as "regionCode", region, city,
             avg(latitude) as latitude, avg(longitude) as longitude,
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1, 2, 3, 4
       order by visitors desc, views desc
       limit 500
    `),
    db.execute(sql`
      select path,
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1
       order by views desc, visitors desc
       limit 12
    `),
    db.execute(sql`
      select product_handle as "productHandle",
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
         and event_type = 'product_view' and product_handle is not null
       group by 1
       order by views desc, visitors desc
       limit 12
    `),
    db.execute(sql`
      select extract(hour from occurred_at at time zone ${TZ})::int as hour,
             count(*)::int as views,
             count(distinct visitor_id)::int as visitors
        from analytics_events
       where occurred_at >= ${from} and occurred_at < ${to}
       group by 1
       order by 1 asc
    `),
  ]);

  const totalsRow = totals.rows[0] as Record<string, unknown> | undefined;
  const previousRow = previous.rows[0] as Record<string, unknown> | undefined;
  const hourMap = new Map(
    hours.rows.map(row => [count(row.hour), { hour: count(row.hour), views: count(row.views), visitors: count(row.visitors) }])
  );

  const named = (rows: Record<string, unknown>[]): NamedCount[] =>
    rows.map(row => ({
      label: text(row.label) ?? 'Okänd',
      visits: count(row.visits),
      visitors: count(row.visitors),
    }));

  return {
    range: { range, granularity: window.granularity, from, to },
    totals: totalsRow
      ? { views: count(totalsRow.views), visitors: count(totalsRow.visitors), sessions: count(totalsRow.sessions) }
      : EMPTY_TOTALS,
    previous: previousRow
      ? { views: count(previousRow.views), visitors: count(previousRow.visitors), sessions: count(previousRow.sessions) }
      : EMPTY_TOTALS,
    series: fillSeries(
      series.rows.map(row => ({
        date: String(row.date),
        views: count(row.views),
        visitors: count(row.visitors),
      })),
      window
    ),
    sources: sources.rows.map(row => ({
      category: text(row.category) ?? 'other',
      label: text(row.label) ?? 'Övrigt',
      visits: count(row.visits),
      visitors: count(row.visitors),
    })),
    devices: named(devices.rows as Record<string, unknown>[]),
    browsers: named(browsers.rows as Record<string, unknown>[]),
    operatingSystems: named(operatingSystems.rows as Record<string, unknown>[]),
    locales: named(locales.rows as Record<string, unknown>[]),
    countries: countries.rows.map(row => ({
      countryCode: text(row.countryCode),
      views: count(row.views),
      visitors: count(row.visitors),
    })),
    regions: regions.rows.map(row => ({
      countryCode: text(row.countryCode),
      regionCode: text(row.regionCode),
      region: text(row.region),
      views: count(row.views),
      visitors: count(row.visitors),
    })),
    locations: locations.rows.map(row => ({
      countryCode: text(row.countryCode),
      regionCode: text(row.regionCode),
      region: text(row.region),
      city: text(row.city),
      latitude: nullableNumber(row.latitude),
      longitude: nullableNumber(row.longitude),
      views: count(row.views),
      visitors: count(row.visitors),
    })),
    pages: pages.rows.map(row => ({
      path: text(row.path) ?? '/',
      views: count(row.views),
      visitors: count(row.visitors),
    })),
    products: products.rows.map(row => ({
      productHandle: text(row.productHandle) ?? '',
      views: count(row.views),
      visitors: count(row.visitors),
    })),
    hours: Array.from({ length: 24 }, (_, hour) => hourMap.get(hour) ?? { hour, views: 0, visitors: 0 }),
  };
}
