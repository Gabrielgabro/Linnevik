'use client';

/**
 * Val av period och nedladdning.
 *
 * Filerna hämtas som vanliga länkar och inte via fetch: en nedladdning ska
 * kunna öppnas, avbrytas och göras om av webbläsaren som vilken fil som helst.
 * Summan över perioden visas innan man laddar ner, så att en orimlig siffra
 * upptäcks här och inte i deklarationen.
 */

import { useEffect, useState } from 'react';
import { Button, ErrorNote, Field } from '@/components/admin/Fields';
import Panel from '@/components/admin/ui/Panel';
import { formatMinor } from '@/lib/money';

type Summary = {
  orders: number;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  refundedMinor: number;
  refundedVatMinor: number;
};

/**
 * Innevarande månad, som är den period man nästan alltid vill ha.
 *
 * Räknad i svensk tid och inte i UTC. Bokföringen förs i svensk tid, och den
 * första i månaden strax efter midnatt ligger Stockholm en eller två timmar
 * före UTC — då hade UTC-varianten föreslagit månaden som just tog slut.
 */
function currentMonth(): { from: string; to: string } {
  // sv-SE ger ÅÅÅÅ-MM-DD, vilket är precis det format fälten vill ha.
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0));
  return {
    from: `${today.slice(0, 7)}-01`,
    to: last.toISOString().slice(0, 10),
  };
}

export default function ExportPanel({ icon }: { icon?: React.ReactNode }) {
  const [period, setPeriod] = useState(currentMonth);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/export/summary?from=${period.from}&to=${period.to}`)
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('fel'))))
      .then(data => {
        if (!cancelled) setSummary(data.summary);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setError('Kunde inte räkna fram perioden.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const query = `from=${period.from}&to=${period.to}`;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Period" meta="Datumen är inklusive, i svensk tid.">
        <div className="flex flex-wrap items-end gap-4">
          <Field
            label="Från"
            name="from"
            type="date"
            value={period.from}
            onChange={event => setPeriod({ ...period, from: event.target.value })}
          />
          <Field
            label="Till"
            name="to"
            type="date"
            value={period.to}
            onChange={event => setPeriod({ ...period, to: event.target.value })}
          />
          <Button type="button" variant="quiet" onClick={() => setPeriod(currentMonth())}>
            Denna månad
          </Button>
        </div>

        {summary && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-3">
            <div className="flex flex-col">
              <dt className="text-ink-3">Betalda ordrar</dt>
              <dd className="font-mono tabular-nums text-ink">{summary.orders}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-ink-3">Netto</dt>
              <dd className="font-mono tabular-nums text-ink">
                {formatMinor(summary.netMinor, 'sek')}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-ink-3">Utgående moms</dt>
              <dd className="font-mono tabular-nums text-ink">
                {formatMinor(summary.vatMinor, 'sek')}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-ink-3">Brutto</dt>
              <dd className="font-mono tabular-nums text-ink">
                {formatMinor(summary.grossMinor, 'sek')}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-ink-3">Återbetalt</dt>
              <dd className="font-mono tabular-nums text-ink">
                {formatMinor(summary.refundedMinor, 'sek')}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-ink-3">Varav moms åter</dt>
              <dd className="font-mono tabular-nums text-ink">
                {formatMinor(summary.refundedVatMinor, 'sek')}
              </dd>
            </div>
          </dl>
        )}
        <ErrorNote>{error}</ErrorNote>
      </Panel>

      <Panel title="Filer" meta="CSV med semikolon och BOM, så att svensk Excel öppnar dem rätt.">
        {/* eslint-disable @next/next/no-html-link-for-pages --
            De här är filnedladdningar, inte navigering. <Link> skulle göra dem
            till klientsidiga övergångar, och då laddas ingen fil ner. */}
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/admin/export?kind=orders&${query}`}
            className="inline-flex items-center gap-2 rounded-ctl border border-rule px-3.5 py-2 text-[13.5px] text-ink hover:bg-plane"
          >
            {icon}
            Ordrar i perioden
          </a>
          <a
            href={`/api/admin/export?kind=refunds&${query}`}
            className="inline-flex items-center gap-2 rounded-ctl border border-rule px-3.5 py-2 text-[13.5px] text-ink hover:bg-plane"
          >
            {icon}
            Återbetalningar i perioden
          </a>
          <a
            href="/api/admin/export?kind=catalog"
            className="inline-flex items-center gap-2 rounded-ctl border border-rule px-3.5 py-2 text-[13.5px] text-ink hover:bg-plane"
          >
            {icon}
            Hela katalogen
          </a>
        </div>
        {/* eslint-enable @next/next/no-html-link-for-pages */}
      </Panel>
    </div>
  );
}
