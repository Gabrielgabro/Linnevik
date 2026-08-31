/**
 * Geometrin och räkningen bakom trafikkartan. Ingen DOM, ingen Leaflet — allt
 * här inne är indata in och tal ut, så reglerna går att prova för sig.
 *
 * Kartan visar tre nivåer med samma visuella språk: världen skuggar länder,
 * ett land skuggar sina regioner, en region faller ner till graderade
 * stadsprickar. Ritandet ligger i `TrafficMap.tsx`.
 */

import type { CountryRow, LocationRow, RegionRow } from '@/lib/analyticsDb';

export type GeoPayload = {
  countries: CountryRow[];
  regions: RegionRow[];
  locations: LocationRow[];
};

export type Metric = 'visitors' | 'views';

export type CountryEntry = {
  code: string;
  name: string;
  visitors: number;
  views: number;
};

export type RegionUnit = {
  key: string;
  name: string;
  members: string[];
  visitors: number;
  views: number;
  /** Sant för samlingsposten med det som inte gick att placera. */
  unknown?: boolean;
  /** Regionnamnen som hamnade där, som förklaring i tabellen. */
  labels?: string[];
};

/** En laddad regionfil: geometrin plus uppslagen som placerar en rad i den. */
export type Admin1Entry = {
  /** Uppslag från normaliserat namn eller kod till id, och grupperingar. */
  index: Record<string, string>;
  groups: Record<string, { m: string[]; n: string }>;
  names: Record<string, string>;
  locator: Locator[];
};

export type Locator = {
  id: string;
  geometry: GeoJSON.Geometry;
  box: [number, number, number, number];
};

export type Aggregated = {
  countries: Record<string, CountryEntry>;
  regionRows: Record<string, RegionRow[]>;
  cityRows: Record<string, LocationRow[]>;
};

export type Resolved = {
  units: Record<string, RegionUnit>;
  unknown: RegionUnit;
  cities: Record<string, LocationRow[]>;
  /** Från geometrins id till den enhet den hör till. */
  byFeature: Record<string, string>;
};

export function countryName(code: string | null): string {
  if (!code) return 'Okänt land';
  try {
    return new Intl.DisplayNames(['sv'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Viker bort skiftläge, accenter och skiljetecken. Speglar regionfilerna. */
export function mapNorm(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ----- Skalor --------------------------------------------------------------

export type Scale = { thresholds: number[]; bins: number; max: number };

export const EMPTY_SCALE: Scale = { thresholds: [], bins: 0, max: 0 };

/**
 * Kvantilklasser, inte en linjär eller logaritmisk ramp.
 *
 * Webbtrafik har en lång svans: när ett hemland bär större delen av besökarna
 * blir en linjär skala lika blek överallt annars, och en logaritmisk lika
 * mellanmörk överallt. Kvantiler garanterar att varje ruta i teckenförklaringen
 * faktiskt används.
 */
export function quantileScale(values: number[]): Scale {
  const positive = values.filter(value => value > 0).sort((a, b) => a - b);
  if (!positive.length) return EMPTY_SCALE;
  const unique = positive.filter((value, index) => !index || value !== positive[index - 1]);
  const bins = Math.min(5, unique.length);
  const thresholds: number[] = [];
  for (let step = 1; step < bins; step += 1) {
    const value = positive[Math.floor((positive.length * step) / bins)];
    if (value > positive[0] && !thresholds.includes(value)) thresholds.push(value);
  }
  return { thresholds, bins: thresholds.length + 1, max: positive[positive.length - 1] };
}

export function scaleBin(scale: Scale, value: number): number {
  if (!(value > 0)) return -1;
  let bin = 0;
  while (bin < scale.thresholds.length && value >= scale.thresholds[bin]) bin += 1;
  return bin;
}

export function scaleColor(scale: Scale, value: number, ramp: string[]): string | null {
  const bin = scaleBin(scale, value);
  if (bin < 0) return null;
  if (scale.bins <= 1) return ramp[ramp.length - 1];
  return ramp[Math.round((bin * (ramp.length - 1)) / (scale.bins - 1))];
}

// ----- Geometri ------------------------------------------------------------

type Ring = number[][];

/**
 * Ringar som korsar datumgränsen kommer in spända över hela -180..180 —
 * Rysslands fastland gör det, för Tjuktjerna viker runt — och Leaflet ritar
 * dem som en fylld strimma tvärs över kartan. Uttryck den västra halvan öster
 * om 180 i stället, så att ringen hänger ihop. Att kasta ringen hade raderat
 * Ryssland.
 */
function unwrapRing(ring: Ring): void {
  let min = Infinity;
  let max = -Infinity;
  let negative = 0;
  for (const point of ring) {
    if (point[0] < min) min = point[0];
    if (point[0] > max) max = point[0];
    if (point[0] < 0) negative += 1;
  }
  if (max - min <= 180) return;
  // Flytta den sida som är i minoritet, så att formen stannar där den hör
  // hemma: Rysslands få Tjuktjer-punkter går öster om 180, medan Alaskas
  // handfull aleutiska punkter går väster om -180 i stället för att dra hela
  // delstaten över Stilla havet.
  const shiftNegative = negative * 2 <= ring.length;
  for (const point of ring) {
    if (shiftNegative) {
      if (point[0] < 0) point[0] += 360;
    } else if (point[0] > 0) {
      point[0] -= 360;
    }
  }
}

export function unwrapGeometry(geometry: GeoJSON.Geometry | null | undefined): void {
  if (!geometry) return;
  if (geometry.type === 'Polygon') geometry.coordinates.forEach(unwrapRing);
  else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(polygon => polygon.forEach(unwrapRing));
  } else if (geometry.type === 'LineString') unwrapRing(geometry.coordinates);
  else if (geometry.type === 'MultiLineString') geometry.coordinates.forEach(unwrapRing);
}

function eachPolygon(geometry: GeoJSON.Geometry, visit: (polygon: Ring[]) => void): void {
  if (geometry.type === 'Polygon') visit(geometry.coordinates);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(visit);
}

function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  let inside = false;
  rings.forEach((ring, index) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    if (index === 0) inside = hit;
    else if (hit) inside = false; // ett hål stansar ur den yttre ringen
  });
  return inside;
}

/** Omslutande rutor först, så att ett uppslag i praktiken är ett par ringtest. */
export function buildLocator(features: GeoJSON.Feature[]): Locator[] {
  return features.map(feature => {
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    if (feature.geometry) {
      eachPolygon(feature.geometry, polygon => {
        for (const point of polygon[0]) {
          if (point[0] < box[0]) box[0] = point[0];
          if (point[1] < box[1]) box[1] = point[1];
          if (point[0] > box[2]) box[2] = point[0];
          if (point[1] > box[3]) box[3] = point[1];
        }
      });
    }
    return { id: String(feature.properties?.id ?? ''), geometry: feature.geometry, box };
  });
}

export function locatePoint(locator: Locator[], lng: number, lat: number): string | null {
  for (const item of locator) {
    if (lng < item.box[0] || lng > item.box[2] || lat < item.box[1] || lat > item.box[3]) continue;
    let found: string | null = null;
    eachPolygon(item.geometry, polygon => {
      if (!found && pointInPolygon(lng, lat, polygon)) found = item.id;
    });
    if (found) return found;
  }
  return null;
}

export function hasCoordinates(row: { latitude: number | null; longitude: number | null }): boolean {
  return (
    row.latitude !== null &&
    row.longitude !== null &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude)
  );
}

// ----- Sammanräkning -------------------------------------------------------

export function aggregate(payload: GeoPayload): Aggregated {
  const countries: Record<string, CountryEntry> = {};
  for (const row of payload.countries) {
    const code = (row.countryCode ?? '').toUpperCase();
    if (!code) continue;
    countries[code] = {
      code,
      name: countryName(code),
      visitors: row.visitors,
      views: row.views,
    };
  }
  const regionRows: Record<string, RegionRow[]> = {};
  for (const row of payload.regions) {
    const code = (row.countryCode ?? '').toUpperCase();
    if (!code) continue;
    (regionRows[code] ??= []).push(row);
  }
  const cityRows: Record<string, LocationRow[]> = {};
  for (const row of payload.locations) {
    const code = (row.countryCode ?? '').toUpperCase();
    if (!code) continue;
    (cityRows[code] ??= []).push(row);
  }
  return { countries, regionRows, cityRows };
}

function regionRowKey(row: { regionCode: string | null; region: string | null }): string {
  return `${row.regionCode ?? ''} ${row.region ?? ''}`;
}

/**
 * Placerar en rad i en regionenhet ur enbart dess attribut, i fallande
 * auktoritet: hel ISO 3166-2-kod, bar kod, regionnamn, sedan gruppering.
 *
 * Den hela koden måste gå först. Regionfilerna indexerar även den bara koden,
 * och där kommer den ur Natural Earths förkortningsfält, som inte är ISO: i
 * DE.json pekar `be` på Brandenburg medan `de be` pekar på Berlin. Vercel
 * skickar just den bara koden, så utan prefixet hamnade varje Berlinbesök i
 * Brandenburg.
 */
function resolveByAttributes(
  entry: Admin1Entry,
  countryCode: string,
  row: { regionCode: string | null; region: string | null }
): { key: string; members: string[]; label?: string } | null {
  const code = mapNorm(row.regionCode);
  const name = mapNorm(row.region);
  const qualified = code ? mapNorm(`${countryCode} ${row.regionCode}`) : '';
  if (qualified && entry.index[qualified]) {
    return { key: entry.index[qualified], members: [entry.index[qualified]] };
  }
  if (code && entry.index[code]) return { key: entry.index[code], members: [entry.index[code]] };
  if (name && entry.index[name]) return { key: entry.index[name], members: [entry.index[name]] };
  if (name && entry.groups[name]) {
    return { key: `g:${name}`, members: entry.groups[name].m, label: entry.groups[name].n };
  }
  if (code && entry.groups[code]) {
    return { key: `g:${code}`, members: entry.groups[code].m, label: entry.groups[code].n };
  }
  return null;
}

/**
 * Sista utvägen: placera raden ur dess egna koordinater. Används bara på
 * stadsrader. En regionrads koordinater är ett medelvärde över varje stad i
 * gruppen, och ett medelvärde av två städer är ingen plats.
 */
function resolveByPoint(entry: Admin1Entry, row: LocationRow) {
  if (!hasCoordinates(row)) return null;
  const hit = locatePoint(entry.locator, row.longitude as number, row.latitude as number);
  return hit ? { key: hit, members: [hit] } : null;
}

/** Regionenheterna för ett land, när dess regionfil är laddad. */
export function resolveRegions(
  data: Aggregated,
  code: string,
  entry: Admin1Entry
): Resolved {
  const units: Record<string, RegionUnit> = {};
  const cities: Record<string, LocationRow[]> = {};
  const unknown: RegionUnit = {
    key: '__unknown',
    name: 'Okänd region',
    members: [],
    visitors: 0,
    views: 0,
    unknown: true,
    labels: [],
  };

  const bucketFor = (unit: { key: string; members: string[]; label?: string }): RegionUnit =>
    (units[unit.key] ??= {
      key: unit.key,
      name: unit.label || entry.names[unit.key] || unit.key,
      members: unit.members,
      visitors: 0,
      views: 0,
    });

  const citiesByRegion: Record<string, LocationRow[]> = {};
  for (const row of data.cityRows[code] ?? []) {
    (citiesByRegion[regionRowKey(row)] ??= []).push(row);
  }

  for (const row of data.regionRows[code] ?? []) {
    const unit = resolveByAttributes(entry, code, row);
    if (unit) {
      // Regionsumman är exakt och aldrig avhuggen, så den används hel.
      const bucket = bucketFor(unit);
      bucket.visitors += row.visitors;
      bucket.views += row.views;
      for (const city of citiesByRegion[regionRowKey(row)] ?? []) {
        (cities[unit.key] ??= []).push(city);
      }
      continue;
    }
    // Varken kod eller namn matchade: placera i stället varje stad i regionen
    // ur sina egna koordinater. Det som blir över — städer bortom radgränsen,
    // eller rader helt utan koordinater — stannar synligt som Okänd i stället
    // för att tyst försvinna.
    let claimedVisitors = 0;
    let claimedViews = 0;
    for (const city of citiesByRegion[regionRowKey(row)] ?? []) {
      const cityUnit = resolveByPoint(entry, city);
      if (!cityUnit) {
        (cities.__unknown ??= []).push(city);
        continue;
      }
      const bucket = bucketFor(cityUnit);
      bucket.visitors += city.visitors;
      bucket.views += city.views;
      claimedVisitors += city.visitors;
      claimedViews += city.views;
      (cities[cityUnit.key] ??= []).push(city);
    }
    const restVisitors = row.visitors - claimedVisitors;
    const restViews = row.views - claimedViews;
    if (restVisitors > 0 || restViews > 0) {
      unknown.visitors += Math.max(0, restVisitors);
      unknown.views += Math.max(0, restViews);
      if (row.region && !unknown.labels?.includes(row.region)) unknown.labels?.push(row.region);
    }
  }

  const byFeature: Record<string, string> = {};
  for (const key of Object.keys(units)) {
    for (const id of units[key].members) byFeature[id] = key;
  }

  return { units, unknown, cities, byFeature };
}

/** Enheterna i fallande ordning efter måttet, med Okänd sist när den finns. */
export function unitList(resolved: Resolved, metric: Metric): RegionUnit[] {
  const list = Object.values(resolved.units).sort((a, b) => b[metric] - a[metric]);
  if (resolved.unknown.visitors || resolved.unknown.views) list.push(resolved.unknown);
  return list;
}

export function citiesFor(
  data: Aggregated,
  resolved: Resolved | null,
  code: string,
  unitKey: string | null
): LocationRow[] {
  if (!resolved) return [...(data.cityRows[code] ?? [])];
  if (!unitKey) return Object.values(resolved.cities).flat();
  return [...(resolved.cities[unitKey] ?? [])];
}
