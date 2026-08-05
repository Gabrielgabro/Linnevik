/**
 * Hämtar konkurrentsidorna och läser ut priserna.
 *
 * Sidorna hämtas en gång var, även när flera bevakade produkter ligger på
 * samma sida — Tingstads och Livvs kategorisidor innehåller sex respektive
 * nio bevakade rader.
 */

import { watchTargets, type WatchTarget } from '@/data/competitorPrices';
import { parsePrice } from './parsers';

export type Observation = {
  id: string;
  skuPrefix: string;
  vendor: string;
  product: string;
  size: string;
  baselineSek: number;
  priceSek: number | null;
  error?: string;
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function fetchPage(url: string): Promise<{ html: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'sv-SE,sv;q=0.9' },
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    if (html.length < 5_000) return { error: `misstänkt kort svar (${html.length} tecken)` };
    return { html };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'okänt nätverksfel' };
  }
}

export async function collect(targets: WatchTarget[] = watchTargets): Promise<Observation[]> {
  const pages = [...new Set(targets.map(t => t.watch.fetchUrl))];

  // Hämta sidorna sekventiellt med en kort paus. Det här är sex till åtta
  // förfrågningar mot sju sajter en gång per dygn — ingen anledning att
  // belasta dem parallellt.
  const fetched = new Map<string, { html: string } | { error: string }>();
  for (const url of pages) {
    fetched.set(url, await fetchPage(url));
    await new Promise(r => setTimeout(r, 800));
  }

  return targets.map(t => {
    const base = {
      id: t.id,
      skuPrefix: t.skuPrefix,
      vendor: t.vendor,
      product: t.product,
      size: t.size,
      baselineSek: t.baselineSek,
    };
    const page = fetched.get(t.watch.fetchUrl);
    if (!page || 'error' in page) {
      return { ...base, priceSek: null, error: page ? page.error : 'sidan hämtades aldrig' };
    }
    const parsed = parsePrice(page.html, t.watch);
    if ('error' in parsed) return { ...base, priceSek: null, error: parsed.error };
    return { ...base, priceSek: Math.round(parsed.priceSek * 100) / 100 };
  });
}
