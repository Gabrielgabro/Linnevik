/**
 * Lagring av prisobservationer i Vercel Blob.
 *
 * Två saker skrivs per körning:
 *   price-watch/latest.json          — skrivs över, används för diffen
 *   price-watch/history/<iso>.json   — en fil per körning, för trend bakåt
 *
 * Blobbarna är privata. Innehållet är visserligen publika listpriser, men en
 * sammanställd konkurrentbevakning är inget vi vill ha liggande på en gissbar
 * URL.
 *
 * Saknas BLOB_READ_WRITE_TOKEN kör boten vidare utan historik och jämför bara
 * mot baslinjen i competitorPrices.ts. Då larmar den fortfarande, men den kan
 * inte säga "sedan förra körningen".
 */

import { head, list, put } from '@vercel/blob';
import type { Observation } from './scrape';

export type Snapshot = { runAt: string; observations: Observation[] };

const LATEST = 'price-watch/latest.json';

export const storeConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function readLatest(): Promise<Snapshot | null> {
  if (!storeConfigured()) return null;
  try {
    // head() ger downloadUrl även för privata blobbar; den är kortlivad och
    // signerad, så den går att hämta med vanlig fetch.
    const meta = await head(LATEST).catch(() => null);
    const url = meta?.downloadUrl ?? meta?.url;
    if (!url) return null;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Snapshot;
    return Array.isArray(data?.observations) ? data : null;
  } catch (e) {
    console.error('[price-watch] kunde inte läsa senaste snapshot:', e);
    return null;
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  if (!storeConfigured()) return;
  const body = JSON.stringify(snapshot, null, 2);
  const opts = { access: 'private' as const, contentType: 'application/json' };
  await Promise.all([
    put(LATEST, body, { ...opts, allowOverwrite: true, addRandomSuffix: false }),
    put(`price-watch/history/${snapshot.runAt}.json`, body, { ...opts, addRandomSuffix: false }),
  ]);
}

/** Antal sparade körningar — används av statusrapporten. */
export async function historyCount(): Promise<number> {
  if (!storeConfigured()) return 0;
  try {
    const { blobs } = await list({ prefix: 'price-watch/history/' });
    return blobs.length;
  } catch {
    return 0;
  }
}
