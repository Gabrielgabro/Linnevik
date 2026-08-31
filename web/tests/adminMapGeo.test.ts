import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregate,
  quantileScale,
  resolveRegions,
  scaleColor,
  unitList,
  unwrapGeometry,
  type Admin1Entry,
} from '@/lib/adminMapGeo';
import type { CountryRow, LocationRow, RegionRow } from '@/lib/analyticsDb';

function admin1(code: string): Admin1Entry {
  const file = JSON.parse(
    readFileSync(resolve(__dirname, `../public/vendor/maps/admin1/${code}.json`), 'utf8')
  );
  const names: Record<string, string> = {};
  for (const geometry of file.topology.objects.regions.geometries) {
    names[geometry.properties.id] = geometry.properties.n;
  }
  return { index: file.index, groups: file.groups ?? {}, names, locator: [] };
}

const country = (code: string, visitors: number, views: number): CountryRow => ({
  countryCode: code,
  visitors,
  views,
});
const region = (
  countryCode: string,
  regionCode: string | null,
  name: string | null,
  visitors: number
): RegionRow => ({ countryCode, regionCode, region: name, visitors, views: visitors * 2 });
const city = (
  countryCode: string,
  regionCode: string | null,
  name: string | null,
  cityName: string,
  visitors: number
): LocationRow => ({
  countryCode,
  regionCode,
  region: name,
  city: cityName,
  latitude: null,
  longitude: null,
  visitors,
  views: visitors * 2,
});

describe('kvantilskalan', () => {
  it('använder varje ruta i teckenförklaringen trots en lång svans', () => {
    // Ett hemland med 900 besökare och fem små marknader: en linjär skala hade
    // gett alla fem samma blekaste ton.
    const scale = quantileScale([900, 12, 9, 6, 4, 2]);
    const ramp = ['a', 'b', 'c', 'd', 'e'];
    const used = new Set([900, 12, 9, 6, 4, 2].map(value => scaleColor(scale, value, ramp)));
    expect(used.size).toBeGreaterThan(2);
    expect(scaleColor(scale, 900, ramp)).toBe('e');
    expect(scaleColor(scale, 0, ramp)).toBeNull();
  });

  it('tål ett tomt underlag', () => {
    expect(quantileScale([]).bins).toBe(0);
    expect(quantileScale([0, 0]).bins).toBe(0);
  });
});

describe('regionplacering', () => {
  it('tolkar Vercels bara ISO-kod som ISO och inte som Natural Earths förkortning', () => {
    // DE.json indexerar 'be' som Brandenburg och 'de be' som Berlin. Vercel
    // skickar 'BE' för Berlin, så den hela koden måste vinna.
    const data = aggregate({
      countries: [country('DE', 10, 20)],
      regions: [region('DE', 'BE', 'BE', 10)],
      locations: [],
    });
    const resolved = resolveRegions(data, 'DE', admin1('DE'));
    expect(Object.keys(resolved.units)).toEqual(['DE-BE']);
    expect(resolved.units['DE-BE'].name).toBe('Berlin');
  });

  it('placerar svenska län på sin kod', () => {
    const data = aggregate({
      countries: [country('SE', 30, 60)],
      regions: [region('SE', 'AB', 'AB', 20), region('SE', 'O', 'O', 10)],
      locations: [city('SE', 'AB', 'AB', 'Stockholm', 20)],
    });
    const resolved = resolveRegions(data, 'SE', admin1('SE'));
    expect(resolved.units['SE-AB'].name).toBe('Stockholm');
    expect(resolved.units['SE-AB'].visitors).toBe(20);
    expect(resolved.cities['SE-AB']).toHaveLength(1);
  });

  it('behåller det som inte gick att placera som Okänd i stället för att tappa det', () => {
    const data = aggregate({
      countries: [country('SE', 15, 30)],
      regions: [region('SE', 'ZZ', 'Ingenstans', 15)],
      locations: [],
    });
    const resolved = resolveRegions(data, 'SE', admin1('SE'));
    expect(Object.keys(resolved.units)).toHaveLength(0);
    expect(resolved.unknown.visitors).toBe(15);
    expect(resolved.unknown.labels).toContain('Ingenstans');
    // Okänd hamnar sist i listan, aldrig överst bland riktiga regioner.
    expect(unitList(resolved, 'visitors').at(-1)?.unknown).toBe(true);
  });
});

describe('datumgränsen', () => {
  it('håller ihop en ring som spänner över -180..180', () => {
    // Ryssland: några punkter öster om datumgränsen, resten väster om den.
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[[-179, 65], [-178, 66], [140, 60], [150, 62], [-179, 65]]],
    };
    unwrapGeometry(geometry);
    const longitudes = geometry.coordinates[0].map(point => point[0]);
    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThanOrEqual(180);
  });

  it('lämnar en vanlig ring orörd', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[[11, 55], [24, 55], [24, 69], [11, 69], [11, 55]]],
    };
    const before = JSON.stringify(geometry);
    unwrapGeometry(geometry);
    expect(JSON.stringify(geometry)).toBe(before);
  });
});
