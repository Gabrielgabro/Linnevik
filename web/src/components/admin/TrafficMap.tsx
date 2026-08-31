'use client';

/**
 * Trafikkartan. Samma karta som i AiF: tre nivåer med ett visuellt språk —
 * världen skuggar länder, ett land skuggar sina regioner, en region faller
 * ner till graderade stadsprickar.
 *
 * Inget kartlager laddas utifrån. Geometrin är Natural Earth, vendorad under
 * /vendor/maps, och kortets bakgrund *är* havet. Det gör kartan gratis att
 * visa, oberoende av en tredje part, och ritad i adminvyns egna färger.
 *
 * Leaflet äger sin egen DOM, så den delen är imperativ och lever i refs.
 * Ramen runt om — brödsmulor, mått, teckenförklaring och tabellen — är vanlig
 * React och ritas ur samma tillstånd.
 */

import type * as Leaflet from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aggregate,
  buildLocator,
  citiesFor,
  EMPTY_SCALE,
  hasCoordinates,
  quantileScale,
  resolveRegions,
  scaleColor,
  unitList,
  unwrapGeometry,
  type Admin1Entry,
  type Aggregated,
  type GeoPayload,
  type Metric,
  type Resolved,
  type Scale,
} from '@/lib/adminMapGeo';

// Beskuren norr och söder om den bebodda världen, så att ramen fyller kortet
// i stället för att lägga svarta bälten av tomt hav över och under.
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-52, -160],
  [70, 172],
];

type Level = 'world' | 'country' | 'region';

/** `smoothFactor` hör till Path i Leaflets typer men skickas vidare av GeoJSON. */
type GeoJSONOptions = Leaflet.GeoJSONOptions & { smoothFactor?: number };

/** Bara det som används av topojson-client: objekten och deras namn. */
type Topology = { objects: Record<string, unknown> };

type Manifest = {
  countries: Record<string, { n: number; b: number[]; v?: number[] }>;
};

type Admin1File = {
  index: Record<string, string>;
  groups: Record<string, { m: string[]; n: string }>;
  topology: Topology;
};

type LoadedAdmin1 = Admin1Entry & {
  topology: Topology;
  collection: GeoJSON.FeatureCollection;
};

// Överlever ommonteringar, så att en återgång in i ett land aldrig hämtar om.
const admin1Cache: Record<string, LoadedAdmin1> = {};
const admin1Requests: Record<string, Promise<void>> = {};
let manifestCache: Manifest | null = null;

// ----- Laddning av leaflet och topojson ------------------------------------

declare global {
  interface Window {
    L?: typeof Leaflet;
    topojson?: {
      feature: (topology: unknown, object: unknown) => GeoJSON.FeatureCollection;
      mesh: (topology: unknown, object: unknown, filter?: (a: unknown, b: unknown) => boolean) => GeoJSON.MultiLineString;
    };
  }
}

let vendorPromise: Promise<void> | null = null;

/**
 * Leaflet och topojson ligger vendorade i /public och laddas först när kartan
 * faktiskt visas. De är tillsammans ~155 kB och hör inte hemma i buntet för
 * en adminvy där de flesta sidorna inte har någon karta.
 */
function loadVendor(): Promise<void> {
  if (vendorPromise) return vendorPromise;
  vendorPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/vendor/leaflet/leaflet.css';
      style.dataset.leaflet = 'true';
      document.head.appendChild(style);
    }
    const scripts = ['/vendor/leaflet/leaflet.js', '/vendor/maps/topojson-client.min.js'];
    let remaining = scripts.length;
    for (const src of scripts) {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (existing?.dataset.loaded === 'true') {
        if (--remaining === 0) resolve();
        continue;
      }
      const script = existing ?? document.createElement('script');
      script.src = src;
      script.async = true;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        if (--remaining === 0) resolve();
      });
      script.addEventListener('error', () => reject(new Error(src)));
      if (!existing) document.body.appendChild(script);
    }
  }).catch(error => {
    // Nästa montering ska få försöka igen i stället för att ärva felet.
    vendorPromise = null;
    throw error;
  });
  return vendorPromise;
}

// ----- Färger --------------------------------------------------------------

type Palette = ReturnType<typeof paletteFor>;

/**
 * Kartans färger. Skuggningen går i adminvyns gröna, prickarna i den varma
 * accenten — en pastellprick på en mättad yta läser som ett hål, så prickarna
 * har en egen, mörkare ramp.
 */
function paletteFor(dark: boolean) {
  return {
    ramp: dark
      ? ['hsl(160 24% 20%)', 'hsl(160 30% 27%)', 'hsl(160 36% 34%)', 'hsl(160 42% 42%)', 'hsl(160 48% 52%)']
      : ['hsl(160 30% 88%)', 'hsl(160 32% 77%)', 'hsl(160 34% 64%)', 'hsl(160 36% 50%)', 'hsl(162 42% 36%)'],
    dotRamp: dark
      ? ['hsl(28 60% 55%)', 'hsl(28 66% 62%)', 'hsl(28 72% 69%)', 'hsl(28 78% 76%)', 'hsl(28 84% 83%)']
      : ['hsl(28 62% 60%)', 'hsl(26 66% 52%)', 'hsl(24 70% 44%)', 'hsl(22 74% 36%)', 'hsl(20 76% 29%)'],
    noData: dark ? '#2a2721' : '#e7e2d8',
    context: dark ? '#232019' : '#ece7dd',
    canvas: dark ? '#2f2b23' : '#f2ede4',
    ocean: dark ? '#141310' : '#f6f3ee',
    hairline: dark ? 'rgba(245,239,231,.14)' : 'rgba(60,70,64,.18)',
    selected: dark ? '#6fcfae' : '#0b3d2e',
    dotStroke: dark ? '#141310' : '#ffffff',
  };
}

function isDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ----- Formatering ---------------------------------------------------------

const compact = new Intl.NumberFormat('sv-SE', { notation: 'compact', maximumFractionDigits: 1 });

function plural(value: number, one: string, many: string): string {
  return `${compact.format(value)} ${value === 1 ? one : many}`;
}

// ----- Komponenten ---------------------------------------------------------

export default function TrafficMap({ geo }: { geo: GeoPayload }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const worldLayerRef = useRef<Leaflet.GeoJSON | null>(null);
  const regionLayerRef = useRef<Leaflet.GeoJSON | null>(null);
  const borderLayerRef = useRef<Leaflet.GeoJSON | null>(null);
  const cityLayerRef = useRef<Leaflet.LayerGroup | null>(null);

  const [level, setLevel] = useState<Level>('world');
  const [country, setCountry] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('visitors');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeKey, setActiveKey] = useState('');
  // Räknare i stället för ett värde: en laddad regionfil ändrar inget i
  // tillståndet men allt på skärmen, så den bumpar den här för att rita om.
  const [revision, setRevision] = useState(0);

  const data = useMemo<Aggregated>(() => aggregate(geo), [geo]);

  // Tillstånd som ritfunktionerna nedan läser. De körs inne i Leaflets egna
  // återanrop, som inte får en ny closure när React renderar om — därför en
  // ref, och därför skriven i en effekt och aldrig under renderingen.
  const view = useRef({ level, country, region, metric, data });
  useEffect(() => {
    view.current = { level, country, region, metric, data };
  }, [level, country, region, metric, data]);

  // Färgerna behövs på två håll med olika regler: React ritar ramen ur ett
  // vanligt värde, medan Leaflets återanrop lever utanför renderingen och
  // läser samma palett ur en ref som hålls i takt av effekten längre ner.
  const [dark, setDark] = useState(false);
  const palette = useMemo<Palette>(() => paletteFor(dark), [dark]);
  const paletteRef = useRef<Palette>(paletteFor(false));

  const countries = useMemo(
    () => Object.values(data.countries).sort((a, b) => b[metric] - a[metric]),
    [data, metric]
  );

  const drillable = useCallback(
    (code: string | null): boolean => Boolean(code && manifestCache?.countries?.[code]),
    // `revision` ser inte ut att användas men är det som gör svaret färskt:
    // manifestet är modulglobalt och kan ha tappat ett land vars fil inte gick
    // att läsa, och den ändringen syns bara som en bump här.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision]
  );

  const resolved = useMemo<Resolved | null>(() => {
    if (!country) return null;
    const entry = admin1Cache[country];
    return entry ? resolveRegions(data, country, entry) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, country, revision]);

  const units = useMemo(
    () => (resolved ? unitList(resolved, metric) : []),
    [resolved, metric]
  );

  const cities = useMemo(
    () =>
      country
        ? citiesFor(data, resolved, country, level === 'region' ? region : null).sort(
            (a, b) => b[metric] - a[metric]
          )
        : [],
    [data, resolved, country, region, level, metric]
  );

  const scales = useMemo(() => {
    const world = quantileScale(countries.map(item => item[metric]));
    if (!country) return { world, region: EMPTY_SCALE, city: EMPTY_SCALE };
    return {
      world,
      region: quantileScale(units.filter(unit => !unit.unknown).map(unit => unit[metric])),
      city: quantileScale(cities.map(row => row[metric])),
    };
  }, [countries, units, cities, country, metric]);

  const scalesRef = useRef(scales);
  const resolvedRef = useRef(resolved);
  useEffect(() => {
    scalesRef.current = scales;
    resolvedRef.current = resolved;
    paletteRef.current = palette;
  }, [scales, resolved, palette]);

  // ---- ritning i Leaflet --------------------------------------------------

  const worldStyle = useCallback((feature?: GeoJSON.Feature): Leaflet.PathOptions => {
    const state = view.current;
    const palette = paletteRef.current;
    const code = String(feature?.properties?.countryCode ?? '');
    const total = state.data.countries[code];
    // Länderna bär ingen egen kantlinje: kustlinjen läses som gränsen mellan
    // land och hav, och de inre gränserna kommer från en enda nätbana. Att
    // stryka varje polygon ritade dessutom Rysslands och Fijis datumgränsskarv
    // som fullbreda vågräta streck tvärs över havet.
    if (state.level === 'world') {
      const fill = total ? scaleColor(scalesRef.current.world, total[state.metric], palette.ramp) : null;
      return {
        pane: 'linnevikWorld',
        className: 'map-country',
        stroke: false,
        weight: 0,
        fillColor: fill ?? palette.noData,
        fillOpacity: 1,
      };
    }
    // Nedborrat: platt geografisk kontext. Landet man borrat i är genomskinligt
    // bara när ett regionlager faktiskt täcker det — annars hade det försvunnit
    // och lämnat sina stadsprickar på bart hav.
    const covered = code === state.country && Boolean(admin1Cache[code]);
    return {
      pane: 'linnevikWorld',
      className: 'map-country',
      stroke: false,
      weight: 0,
      fillColor: code === state.country ? palette.canvas : palette.context,
      fillOpacity: covered ? 0 : 1,
    };
  }, []);

  const regionStyle = useCallback((feature?: GeoJSON.Feature): Leaflet.PathOptions => {
    const state = view.current;
    const palette = paletteRef.current;
    const current = resolvedRef.current;
    const unitKey = current ? current.byFeature[String(feature?.properties?.id ?? '')] : null;
    const unit = unitKey ? current?.units[unitKey] : null;
    // På regionnivå har skuggningen redan gjort sitt en nivå upp, och att
    // behålla den hade lagt graderade prickar ovanpå en mättad yta. Regionen
    // blir en neutral duk i stället, och prickarna bär kodningen.
    if (state.level === 'region') {
      const selected = unitKey === state.region;
      return {
        pane: 'linnevikRegions',
        className: 'map-region',
        stroke: selected,
        color: palette.selected,
        weight: selected ? 1.5 : 0,
        fillColor: selected ? palette.canvas : palette.context,
        fillOpacity: selected ? 1 : 0.6,
      };
    }
    const fill = unit ? scaleColor(scalesRef.current.region, unit[state.metric], palette.ramp) : null;
    return {
      pane: 'linnevikRegions',
      className: 'map-region',
      stroke: false,
      weight: 0,
      fillColor: fill ?? palette.noData,
      fillOpacity: 1,
    };
  }, []);

  const hoverCard = useCallback((title: string, subtitle: string, item: { visitors: number; views: number }) => {
    const escape = (value: string) =>
      value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string);
    return (
      `<strong>${escape(title)}</strong>` +
      (subtitle ? `<br><span style="opacity:.75">${escape(subtitle)}</span>` : '') +
      `<br>${plural(item.visitors, 'besökare', 'besökare')} · ${plural(item.views, 'visning', 'visningar')}`
    );
  }, []);

  const countryBounds = useCallback((code: string): Leaflet.LatLngBounds | null => {
    const L = window.L;
    const entry = manifestCache?.countries?.[code];
    if (L && entry?.v) return L.latLngBounds([entry.v[1], entry.v[0]], [entry.v[3], entry.v[2]]);
    let bounds: Leaflet.LatLngBounds | null = null;
    worldLayerRef.current?.eachLayer(layer => {
      const path = layer as Leaflet.Polygon & { feature?: GeoJSON.Feature };
      if (path.feature?.properties?.countryCode === code) bounds = path.getBounds();
    });
    return bounds;
  }, []);

  const frameCountry = useCallback(
    (code: string) => {
      const bounds = countryBounds(code);
      if (bounds) mapRef.current?.fitBounds(bounds, { padding: [26, 26], maxZoom: 7 });
    },
    [countryBounds]
  );

  /** Hämtar och tolkar ett lands regionfil. Varje land hämtas högst en gång. */
  const loadAdmin1 = useCallback((code: string) => {
    if (!manifestCache?.countries?.[code] || admin1Cache[code]) return;
    admin1Requests[code] ??= fetch(`/vendor/maps/admin1/${code}.json`)
      .then(response => {
        if (!response.ok) throw new Error('admin1');
        return response.json() as Promise<Admin1File>;
      })
      .then(file => {
        const topojson = window.topojson;
        if (!topojson) throw new Error('topojson');
        const collection = topojson.feature(file.topology, file.topology.objects.regions);
        // Alaskas aleuter och Nya Zeelands ytteröar viker också runt jorden.
        for (const feature of collection.features) unwrapGeometry(feature.geometry);
        const names: Record<string, string> = {};
        for (const feature of collection.features) {
          names[String(feature.properties?.id)] = String(feature.properties?.n ?? '');
        }
        admin1Cache[code] = {
          index: file.index ?? {},
          groups: file.groups ?? {},
          names,
          locator: buildLocator(collection.features),
          topology: file.topology,
          collection,
        };
      })
      .catch(() => {
        // Behandlas precis som ett land utan regiondata: posten tas ur
        // manifestet, så kartan faller tillbaka på stadsprickar.
        if (manifestCache?.countries) delete manifestCache.countries[code];
      });

    admin1Requests[code].then(() => setRevision(value => value + 1));
  }, []);

  const drillCountry = useCallback(
    (code: string) => {
      if (!data.countries[code]) return;
      setCountry(code);
      setRegion(null);
      setLevel('country');
      frameCountry(code);
      loadAdmin1(code);
    },
    [data, frameCountry, loadAdmin1]
  );

  const drillRegion = useCallback((key: string) => {
    const current = resolvedRef.current;
    if (!current?.units[key]) return;
    setRegion(key);
    setLevel('region');
    let bounds: Leaflet.LatLngBounds | null = null;
    regionLayerRef.current?.eachLayer(layer => {
      const path = layer as Leaflet.Polygon & { feature?: GeoJSON.Feature };
      if (current.byFeature[String(path.feature?.properties?.id ?? '')] !== key) return;
      bounds = bounds ? bounds.extend(path.getBounds()) : path.getBounds();
    });
    if (bounds) mapRef.current?.fitBounds(bounds, { padding: [34, 34], maxZoom: 8 });
  }, []);

  const goToWorld = useCallback(() => {
    setLevel('world');
    setCountry(null);
    setRegion(null);
    mapRef.current?.fitBounds(WORLD_BOUNDS, { padding: [8, 8] });
  }, []);

  const goToCountry = useCallback(() => {
    if (!view.current.country) return;
    setLevel('country');
    setRegion(null);
    frameCountry(view.current.country);
  }, [frameCountry]);

  // ---- montering ----------------------------------------------------------

  useEffect(() => {
    let disposed = false;
    const element = containerRef.current;
    if (!element) return;

    loadVendor()
      .then(() =>
        Promise.all([
          fetch('/vendor/maps/countries-110m.json').then(response => response.json()),
          fetch('/vendor/maps/iso-codes.json').then(response => response.json()),
          manifestCache
            ? Promise.resolve(manifestCache)
            : fetch('/vendor/maps/admin1/manifest.json').then(response => response.json()),
        ])
      )
      .then(([worldTopology, isoCodes, manifest]) => {
        const L = window.L;
        const topojson = window.topojson;
        if (disposed || !L || !topojson || !element) return;
        manifestCache = manifest as Manifest;
        paletteRef.current = paletteFor(isDark());
        const palette = paletteRef.current;

        const map = L.map(element, {
          minZoom: 1,
          maxZoom: 8,
          zoomSnap: 0.25,
          zoomDelta: 0.5,
          maxBounds: L.latLngBounds([-60, -180], [84, 180]),
          maxBoundsViscosity: 1,
          worldCopyJump: false,
          // Rullhjulet zoomar först när kartan har fokus, annars fastnar sidan
          // i kartan när man skrollar förbi den.
          scrollWheelZoom: false,
          zoomControl: false,
          attributionControl: false,
        });
        mapRef.current = map;

        // Uttalade lager: utan dem kan en stadsprick hamna bakom en regionyta.
        map.createPane('linnevikWorld').style.zIndex = '410';
        map.createPane('linnevikRegions').style.zIndex = '420';
        map.createPane('linnevikBorders').style.zIndex = '430';
        map.getPane('linnevikBorders')!.style.pointerEvents = 'none';
        map.createPane('linnevikCities').style.zIndex = '460';

        map.on('focus', () => map.scrollWheelZoom.enable());
        map.on('blur', () => map.scrollWheelZoom.disable());

        cityLayerRef.current = L.layerGroup([], { pane: 'linnevikCities' }).addTo(map);

        const numericToAlpha2: Record<string, string> = {};
        for (const row of isoCodes as [string, string, string][]) numericToAlpha2[row[2]] = row[0];

        const world = topojson.feature(worldTopology, (worldTopology as Topology).objects.countries);
        // Antarktis ligger utanför maxBounds och bidrar bara med brus längs
        // nederkanten.
        world.features = world.features.filter(feature => String(feature.id) !== '010');
        for (const feature of world.features) {
          feature.properties = feature.properties ?? {};
          feature.properties.countryCode = numericToAlpha2[String(feature.id).padStart(3, '0')] ?? '';
          unwrapGeometry(feature.geometry);
        }

        const mesh = topojson.mesh(
          worldTopology,
          (worldTopology as Topology).objects.countries,
          (a, b) => a !== b
        );
        unwrapGeometry(mesh);
        // En enda hårfin bana för alla inre gränser i stället för en kantlinje
        // på var och en av upp till 193 polygoner: skarpare, och långt billigare.
        L.geoJSON(mesh, {
          pane: 'linnevikBorders',
          interactive: false,
          style: { className: 'map-borders', color: palette.hairline, weight: 0.6, opacity: 1, fill: false },
        }).addTo(map);

        worldLayerRef.current = L.geoJSON(world, {
          pane: 'linnevikWorld',
          // Förenklar banorna vid låg zoom. Sitter på Path och inte på
          // GeoJSON i typerna, men skickas vidare till varje lager.
          smoothFactor: 1.2,
          style: worldStyle,
          onEachFeature: (feature, layer) => {
            const code = String(feature.properties?.countryCode ?? '');
            const total = view.current.data.countries[code];
            if (!total) return;
            layer.bindTooltip(hoverCard(total.name, '', total), {
              sticky: true,
              className: 'map-hover-card',
              opacity: 1,
            });
            layer.on('mouseover', () => {
              // `interactive` sätts vid skapandet och går inte att stila om, så
              // nivåkollen bor i hanteraren och inte i inställningarna.
              if (view.current.level !== 'world') return;
              (layer as Leaflet.Path).setStyle({ weight: 1.6, color: palette.selected });
              (layer as Leaflet.Path).bringToFront();
              setActiveKey(code);
            });
            layer.on('mouseout', () => {
              if (view.current.level !== 'world') return;
              worldLayerRef.current?.resetStyle(layer as Leaflet.Path);
              setActiveKey('');
            });
            layer.on('click', () => {
              if (view.current.level !== 'world') return;
              drillCountry(code);
            });
          },
        } as GeoJSONOptions).addTo(map);

        map.fitBounds(WORLD_BOUNDS, { padding: [8, 8] });
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      worldLayerRef.current = null;
      regionLayerRef.current = null;
      borderLayerRef.current = null;
      cityLayerRef.current = null;
      setReady(false);
    };
    // Monteras en gång. Alla omritningar går via effekterna nedan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Färgerna följer systemets läge, precis som resten av adminvyn.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setDark(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  // Ett byte av läge ändrar inget i underlaget men allt på kartan, så lagren
  // måste ritas om med den nya paletten.
  useEffect(() => {
    setRevision(value => value + 1);
  }, [palette]);

  // Världslagret ritas om vid varje ändring av nivå, land eller mått.
  useEffect(() => {
    if (!ready) return;
    worldLayerRef.current?.setStyle(worldStyle);
  }, [ready, level, country, metric, revision, worldStyle, data]);

  // Regionlagret byggs om när landet byts eller dess fil landar.
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    if (regionLayerRef.current) {
      map.removeLayer(regionLayerRef.current);
      regionLayerRef.current = null;
    }
    if (borderLayerRef.current) {
      map.removeLayer(borderLayerRef.current);
      borderLayerRef.current = null;
    }
    const entry = country ? admin1Cache[country] : null;
    if (!entry || level === 'world') return;

    const palette = paletteRef.current;
    const current = resolvedRef.current;

    regionLayerRef.current = L.geoJSON(entry.collection, {
      pane: 'linnevikRegions',
      smoothFactor: 1,
      style: regionStyle,
      onEachFeature: (feature, layer) => {
        const unitKey = current ? current.byFeature[String(feature.properties?.id ?? '')] : null;
        const unit = unitKey ? current?.units[unitKey] : null;
        const label = unit ? unit.name : String(feature.properties?.n ?? '');
        if (unit && country) {
          layer.bindTooltip(hoverCard(label, data.countries[country]?.name ?? '', unit), {
            sticky: true,
            className: 'map-hover-card',
            opacity: 1,
          });
        }
        layer.on('mouseover', () => {
          (layer as Leaflet.Path).setStyle({ weight: 1.6, color: palette.selected });
          (layer as Leaflet.Path).bringToFront();
          if (unitKey) setActiveKey(unitKey);
        });
        layer.on('mouseout', () => {
          regionLayerRef.current?.resetStyle(layer as Leaflet.Path);
          setActiveKey('');
        });
        layer.on('click', event => {
          if (event.originalEvent) L.DomEvent.stop(event.originalEvent);
          if (unitKey) drillRegion(unitKey);
        });
      },
    } as GeoJSONOptions).addTo(map);

    const topojson = window.topojson;
    if (topojson) {
      const mesh = topojson.mesh(entry.topology, entry.topology.objects.regions, (a, b) => a !== b);
      borderLayerRef.current = L.geoJSON(mesh, {
        pane: 'linnevikBorders',
        interactive: false,
        style: { className: 'map-borders', color: palette.hairline, weight: 0.6, opacity: 1, fill: false },
      }).addTo(map);
    }
  }, [ready, level, country, region, metric, revision, regionStyle, hoverCard, drillRegion, data]);

  // Stadsprickarna: bara bladnivån, plus länder som saknar regiondata och
  // därför inte har någon regionnivå att gå ner i.
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    const layer = cityLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const showDots = level === 'region' || (level === 'country' && !drillable(country));
    if (!showDots || !country) return;

    const rows = (level === 'region' ? cities : (data.cityRows[country] ?? [])).filter(hasCoordinates);
    if (!rows.length) return;

    const palette = paletteRef.current;
    const scale: Scale = scalesRef.current.city;
    const max = scale.max || 1;

    for (const row of rows) {
      const value = row[metric];
      // Ytan, inte radien, växer med talet: dubbelt så många besökare ska se
      // dubbelt så stora ut, inte fyra gånger.
      const radius = 4 + Math.sqrt(Math.max(0, value) / max) * 11;
      const marker = L.circleMarker([row.latitude as number, row.longitude as number], {
        pane: 'linnevikCities',
        className: 'map-city-dot',
        radius,
        weight: 1.5,
        color: palette.dotStroke,
        fillColor: scaleColor(scale, value, palette.dotRamp) ?? palette.dotRamp[0],
        fillOpacity: 0.92,
      }).addTo(layer);

      const label = row.city || row.region || data.countries[country]?.name || '';
      const context = [row.region && row.region !== label ? row.region : '', data.countries[country]?.name]
        .filter(Boolean)
        .join(', ');
      marker.bindTooltip(hoverCard(label, context, row), {
        direction: 'top',
        className: 'map-hover-card',
        opacity: 1,
      });
      const key = `${row.latitude},${row.longitude}`;
      marker.on('mouseover', () => {
        marker.setStyle({ radius: radius + 2 });
        setActiveKey(key);
      });
      marker.on('mouseout', () => {
        marker.setStyle({ radius });
        setActiveKey('');
      });
    }
  }, [ready, level, country, region, metric, revision, cities, data, drillable, hoverCard]);

  // Ett land som försvinner ur underlaget när perioden byts får inte lämna
  // kartan nedborrad i ingenting.
  useEffect(() => {
    if (country && !data.countries[country]) goToWorld();
  }, [data, country, goToWorld]);

  // ---- ramen --------------------------------------------------------------

  type Row = { key: string; name: string; visitors: number; views: number; muted?: boolean; title?: string };

  /**
   * Tabellen under kartan visar alltid nivån man står på: länder, regioner
   * eller städer. Bara data här — klicket ligger i `pickRow` nedan, så att
   * raderna går att räkna fram under renderingen utan att röra en enda ref.
   */
  const tableHead = level === 'world' ? 'Land' : level === 'country' && drillable(country) ? 'Region' : 'Stad';

  const cityRows = useMemo(
    () =>
      level === 'region'
        ? cities
        : [...(data.cityRows[country ?? ''] ?? [])].sort((a, b) => b[metric] - a[metric]),
    [level, cities, data, country, metric]
  );

  const tableRows = useMemo<Row[]>(() => {
    if (level === 'world') {
      return countries.map(item => ({
        key: item.code,
        name: item.name,
        visitors: item.visitors,
        views: item.views,
      }));
    }
    if (level === 'country' && drillable(country)) {
      return units.map(unit => ({
        key: unit.key,
        name: unit.name,
        visitors: unit.visitors,
        views: unit.views,
        muted: unit.unknown,
        title: unit.unknown && unit.labels?.length ? `Oplacerade: ${unit.labels.join(', ')}` : undefined,
      }));
    }
    return cityRows.map(row => ({
      key: `${row.latitude},${row.longitude}`,
      name: row.city || row.region || 'Okänd stad',
      visitors: row.visitors,
      views: row.views,
    }));
  }, [level, country, countries, units, cityRows, drillable]);

  /** Klicket på en rad. Bladnivån har inget att borra i och panorerar i stället. */
  const pickRow = (row: Row, index: number) => {
    if (level === 'world') return drillCountry(row.key);
    if (level === 'country' && drillable(country)) {
      if (!row.muted) drillRegion(row.key);
      return;
    }
    const source = cityRows[index];
    if (source && hasCoordinates(source)) {
      mapRef.current?.setView([source.latitude as number, source.longitude as number], 7);
    }
  };

  const summary = useMemo(() => {
    if (level === 'world') {
      const total = countries.reduce((sum, item) => sum + item[metric], 0);
      const word = metric === 'visitors' ? 'besökare' : 'visningar';
      return `${compact.format(total)} ${word} från ${countries.length} ${countries.length === 1 ? 'land' : 'länder'}`;
    }
    if (level === 'country') {
      if (!drillable(country)) {
        const count = (data.cityRows[country ?? ''] ?? []).length;
        return `${count} ${count === 1 ? 'stad' : 'städer'} · ingen regiondata för landet`;
      }
      const withTraffic = units.filter(unit => !unit.unknown).length;
      return `${withTraffic} ${withTraffic === 1 ? 'region' : 'regioner'} med trafik`;
    }
    const dots = cities.filter(hasCoordinates).length;
    return `${dots} ${dots === 1 ? 'stad' : 'städer'} utsatta`;
  }, [level, country, countries, units, cities, data, metric, drillable]);

  const dotLevel = level === 'region' || (level === 'country' && !drillable(country));
  const scale = level === 'world' ? scales.world : dotLevel ? scales.city : scales.region;
  const maxValue = Math.max(1, ...tableRows.map(row => (metric === 'visitors' ? row.visitors : row.views)));
  const regionName = region ? resolved?.units[region]?.name : null;

  if (failed) {
    return (
      <p className="rounded-card border border-rule bg-plane px-4 py-8 text-center text-[13.5px] text-ink-2">
        Kartan kunde inte laddas. Ladda om sidan för att försöka igen.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
          <nav aria-label="Plats på kartan" className="flex items-center gap-1.5">
            {level === 'world' ? (
              <span aria-current="location" className="font-semibold text-ink">
                Världen
              </span>
            ) : (
              <button type="button" onClick={goToWorld} className="underline-offset-2 hover:text-ink hover:underline">
                Världen
              </button>
            )}
            {country && (
              <>
                <span aria-hidden className="text-ink-3">
                  ›
                </span>
                {level === 'country' ? (
                  <span aria-current="location" className="font-semibold text-ink">
                    {data.countries[country]?.name ?? country}
                  </span>
                ) : (
                  <button type="button" onClick={goToCountry} className="underline-offset-2 hover:text-ink hover:underline">
                    {data.countries[country]?.name ?? country}
                  </button>
                )}
              </>
            )}
            {level === 'region' && (
              <>
                <span aria-hidden className="text-ink-3">
                  ›
                </span>
                <span aria-current="location" className="font-semibold text-ink">
                  {regionName ?? 'Region'}
                </span>
              </>
            )}
          </nav>
          <span aria-hidden className="text-ink-3">
            /
          </span>
          <span>{summary}</span>
        </span>

        <div className="flex items-center gap-3">
          <div role="group" aria-label="Mått på kartan" className="inline-flex rounded-[8px] border border-rule bg-plane p-[2px]">
            {(['visitors', 'views'] as Metric[]).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={metric === option}
                onClick={() => setMetric(option)}
                className={
                  metric === option
                    ? 'rounded-[6px] bg-surface px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink shadow-card'
                    : 'rounded-[6px] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink-2'
                }
              >
                {option === 'visitors' ? 'Besökare' : 'Visningar'}
              </button>
            ))}
          </div>

          {scale.bins > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <span>Färre</span>
              {dotLevel ? (
                <span className="inline-flex items-center gap-1">
                  {[5, 9, 14].map((size, index) => (
                    <i
                      key={size}
                      className="block rounded-full"
                      style={{
                        width: size,
                        height: size,
                        background: palette.dotRamp[Math.round((index * (palette.dotRamp.length - 1)) / 2)],
                      }}
                    />
                  ))}
                </span>
              ) : (
                <span className="inline-flex gap-[2px]">
                  {Array.from({ length: scale.bins }, (_, bin) => (
                    <i
                      key={bin}
                      className="block h-[7px] w-[17px] rounded-[2px]"
                      style={{
                        background:
                          scale.bins <= 1
                            ? palette.ramp[palette.ramp.length - 1]
                            : palette.ramp[Math.round((bin * (palette.ramp.length - 1)) / (scale.bins - 1))],
                      }}
                    />
                  ))}
                </span>
              )}
              <span>Fler</span>
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        role="application"
        aria-label="Interaktiv trafikkarta"
        className="h-[430px] overflow-hidden rounded-card"
        style={{ background: palette.ocean }}
      />

      <div className="border-t border-rule" aria-live="polite">
        {tableRows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13.5px] text-ink-2">Ingen trafik i området under perioden.</p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-3 px-3 pb-1.5 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
              <span>{tableHead}</span>
              <span className="text-right">Besökare</span>
              <span className="text-right">Visningar</span>
            </div>
            {tableRows.map((row, index) => (
              <button
                key={row.key}
                type="button"
                title={row.title}
                onMouseEnter={() => setActiveKey(row.key)}
                onMouseLeave={() => setActiveKey('')}
                onClick={() => pickRow(row, index)}
                className={`relative grid w-full grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-3 border-t border-rule px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                  activeKey === row.key ? 'bg-plane' : 'hover:bg-plane'
                } ${row.muted ? 'text-ink-3' : 'text-ink'}`}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-1 left-0 rounded-r-[4px]"
                  style={{
                    width: `${Math.max(2, ((metric === 'visitors' ? row.visitors : row.views) / maxValue) * 100)}%`,
                    background: 'color-mix(in srgb, var(--viz-s3) 12%, transparent)',
                  }}
                />
                <span className="relative truncate font-medium">{row.name}</span>
                <span className="relative text-right font-mono tabular-nums">{compact.format(row.visitors)}</span>
                <span className="relative text-right font-mono tabular-nums">{compact.format(row.views)}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
