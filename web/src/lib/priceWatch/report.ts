/**
 * Jämför en körning mot förra körningen och mot baslinjen i
 * competitorPrices.ts, och formulerar larmet.
 *
 * Tre saker är värda ett mejl:
 *   1. Ett bevakat pris har sjunkit sedan förra körningen.
 *   2. Ett bevakat pris har hamnat under vårt föreslagna pris — då är vi
 *      dyrast, oavsett om det rörde sig idag eller för en månad sedan.
 *   3. En parser har slutat hitta priset. Det betyder inte att priset ändrats,
 *      det betyder att bevakningen är trasig, och det är minst lika viktigt.
 *
 * Punkt 3 rapporteras bara när felet är *nytt*, annars kommer samma mejl varje
 * dygn tills någon hinner laga det.
 */

import { competitorProducts } from '@/data/competitorPrices';
import type { Observation } from './scrape';
import type { Snapshot } from './store';

/** Under så här mycket rör sig priser av avrundning och kampanjbrus. */
export const DROP_PCT = 2;
export const DROP_MIN_SEK = 3;

export type Drop = {
  obs: Observation;
  previousSek: number;
  deltaSek: number;
  deltaPct: number;
  /** Priset ligger nu under vårt föreslagna pris för produkten. */
  undercutsUs: boolean;
};

export type NewFailure = { obs: Observation; error: string };

export type Findings = {
  drops: Drop[];
  undercuts: Observation[];
  newFailures: NewFailure[];
  ok: number;
  failed: number;
};

const titleOf = (skuPrefix: string) =>
  competitorProducts.find(p => p.skuPrefix === skuPrefix)?.skuPrefix ?? skuPrefix;

const suggestedOf = (skuPrefix: string) =>
  competitorProducts.find(p => p.skuPrefix === skuPrefix)?.suggestedSek ?? Infinity;

const sek = (v: number) => v.toLocaleString('sv-SE', { maximumFractionDigits: 0 });

export function compare(current: Observation[], previous: Snapshot | null): Findings {
  const before = new Map((previous?.observations ?? []).map(o => [o.id, o]));

  const drops: Drop[] = [];
  const undercuts: Observation[] = [];
  const newFailures: NewFailure[] = [];

  for (const obs of current) {
    const prev = before.get(obs.id);

    if (obs.priceSek == null) {
      // Nytt fel = förra körningen lyckades (eller fanns inte alls).
      if (!prev || prev.priceSek != null) newFailures.push({ obs, error: obs.error ?? 'okänt fel' });
      continue;
    }

    // Jämför i första hand mot förra körningen, annars mot baslinjen i filen.
    const reference = prev?.priceSek ?? obs.baselineSek;
    const deltaSek = reference - obs.priceSek;
    const deltaPct = reference > 0 ? (deltaSek / reference) * 100 : 0;
    const undercutsUs = obs.priceSek < suggestedOf(obs.skuPrefix);

    if (deltaSek >= DROP_MIN_SEK && deltaPct >= DROP_PCT) {
      drops.push({ obs, previousSek: reference, deltaSek, deltaPct, undercutsUs });
    } else if (undercutsUs) {
      undercuts.push(obs);
    }
  }

  return {
    drops: drops.sort((a, b) => b.deltaPct - a.deltaPct),
    undercuts,
    newFailures,
    ok: current.filter(o => o.priceSek != null).length,
    failed: current.filter(o => o.priceSek == null).length,
  };
}

export const worthEmailing = (f: Findings) =>
  f.drops.length > 0 || f.newFailures.length > 0;

export function subjectFor(f: Findings): string {
  if (f.drops.length > 0) {
    const worst = f.drops[0];
    return `Prisras: ${worst.obs.vendor} ${worst.obs.product} −${Math.round(worst.deltaPct)} %${
      f.drops.length > 1 ? ` (+${f.drops.length - 1} till)` : ''
    }`;
  }
  return `Prisbevakningen tappade ${f.newFailures.length} källa${f.newFailures.length === 1 ? '' : 'r'}`;
}

export function htmlFor(f: Findings, runAt: string): string {
  const row = (cells: string[], bold = false) =>
    `<tr>${cells
      .map(
        (c, i) =>
          `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;${
            i > 0 ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''
          }${bold ? 'font-weight:600;' : ''}">${c}</td>`
      )
      .join('')}</tr>`;

  const section = (title: string, body: string) =>
    `<h3 style="font:600 15px system-ui,sans-serif;color:#0B3D2E;margin:26px 0 8px;">${title}</h3>${body}`;

  const table = (headers: string[], rows: string) =>
    `<table style="width:100%;border-collapse:collapse;font:13px system-ui,sans-serif;color:#111;">
      <thead><tr>${headers
        .map(
          (h, i) =>
            `<th style="padding:6px 10px;border-bottom:2px solid #0B3D2E;text-align:${
              i > 0 ? 'right' : 'left'
            };font:600 11px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;">${h}</th>`
        )
        .join('')}</tr></thead><tbody>${rows}</tbody></table>`;

  let html = `<div style="max-width:680px;margin:0 auto;font:14px system-ui,sans-serif;color:#111;">
    <h2 style="font:600 19px system-ui,sans-serif;color:#0B3D2E;border-bottom:2px solid #0B3D2E;padding-bottom:9px;">
      Prisbevakning · ${new Date(runAt).toLocaleString('sv-SE')}
    </h2>`;

  if (f.drops.length > 0) {
    html += section(
      `${f.drops.length} pris har sjunkit`,
      table(
        ['Leverantör / produkt', 'Förr', 'Nu', 'Förändring'],
        f.drops
          .map(d =>
            row([
              `${d.obs.vendor} — ${d.obs.product} (${d.obs.size})<br>
               <span style="color:#6b7280;font-size:12px;">påverkar ${titleOf(d.obs.skuPrefix)}${
                 d.undercutsUs ? ' · <b style="color:#b91c1c;">under vårt pris</b>' : ''
               }</span>`,
              `${sek(d.previousSek)} kr`,
              `<b>${sek(d.obs.priceSek!)} kr</b>`,
              `<span style="color:#b91c1c;">−${sek(d.deltaSek)} kr / −${d.deltaPct.toFixed(1)} %</span>`,
            ])
          )
          .join('')
      )
    );
  }

  if (f.undercuts.length > 0) {
    html += section(
      `${f.undercuts.length} konkurrent ligger under vårt föreslagna pris`,
      table(
        ['Leverantör / produkt', 'Deras pris', 'Vårt förslag'],
        f.undercuts
          .map(o =>
            row([
              `${o.vendor} — ${o.product} (${o.size})`,
              `${sek(o.priceSek!)} kr`,
              `${sek(suggestedOf(o.skuPrefix))} kr`,
            ])
          )
          .join('')
      )
    );
  }

  if (f.newFailures.length > 0) {
    html += section(
      `${f.newFailures.length} källa slutade svara`,
      table(
        ['Leverantör / produkt', 'Fel'],
        f.newFailures
          .map(x => row([`${x.obs.vendor} — ${x.obs.product}`, `<span style="color:#b45309;">${x.error}</span>`]))
          .join('')
      ) +
        `<p style="color:#6b7280;font-size:12.5px;margin-top:8px;">
           Det här betyder inte att priset ändrats — det betyder att sidan byggts om och att
           utläsaren i <code>src/lib/priceWatch/parsers.ts</code> behöver ses över.
         </p>`
    );
  }

  html += `<p style="color:#6b7280;font-size:12px;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:14px;">
      ${f.ok} av ${f.ok + f.failed} bevakade priser lästes in.
      Tröskel för larm: ${DROP_PCT} % och minst ${DROP_MIN_SEK} kr.
      Underlaget finns i <code>/admin</code>.
    </p></div>`;

  return html;
}
