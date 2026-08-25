'use client';

import { useEffect, useRef, useState } from 'react';
import { landedPerPcs, products as landedProducts } from '@/data/landedCost';
import type { AdminUser } from '@/lib/adminAuth';
import {
  BASIS_LABEL,
  collectedAt,
  competitorProducts,
  eurSek,
  floorOf,
  primaryOf,
  type Channel,
  type Competitor,
  type CompetitorProduct,
} from '@/data/competitorPrices';
import { Axis, Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

type StoredSuggestion = {
  id: number;
  user: string;
  label: string | null;
  prices: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

/**
 * En färg per person. Tilldelas efter namnordning och inte efter inloggad
 * användare, så att Johans stapel har samma färg oavsett vem som tittar.
 */
const MEMBER_VARS = ['--viz-m1', '--viz-m2', '--viz-m3'] as const;
const memberVar = (index: number) => MEMBER_VARS[index % MEMBER_VARS.length];

const SERIES = {
  landed: { label: 'Landad kostnad', varName: '--viz-s3' },
  suggested: { label: 'Vårt pris (dra för att ändra)', varName: '--viz-s1' },
  b2b: { label: 'B2B-konkurrent', varName: '--viz-s2' },
  b2c: { label: 'B2C-referens', varName: '--viz-ink-3' },
} as const;

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

const titleOf = (skuPrefix: string) =>
  landedProducts.find(p => p.skuPrefix === skuPrefix)?.title ?? skuPrefix;

const handleOf = (skuPrefix: string) =>
  landedProducts.find(p => p.skuPrefix === skuPrefix)?.handle ?? null;

const landedOf = (skuPrefix: string) => {
  const p = landedProducts.find(x => x.skuPrefix === skuPrefix);
  return p ? landedPerPcs(p) : 0;
};

const marginPct = (p: CompetitorProduct, price: number) =>
  price <= 0 ? 0 : ((price - landedOf(p.skuPrefix)) / price) * 100;

const indexPct = (p: CompetitorProduct, price: number) => (price / primaryOf(p).priceSek) * 100;
const floorPct = (p: CompetitorProduct, price: number) => (price / floorOf(p).priceSek) * 100;

/** "132 %" säger inget om det är bra eller dåligt förrän man räknat själv. */
const overUnderLabel = (pct: number) => {
  const diff = Math.round(pct - 100);
  if (diff === 0) return 'samma pris';
  return diff > 0 ? `${diff} % dyrare` : `${Math.abs(diff)} % billigare`;
};

const INDEX_MAX = 250;

/**
 * Skalans tak är låst till underlaget, inte till det pris som dras. Annars skulle
 * alla staplar hoppa i sidled så fort man rör reglaget.
 */
const scaleMaxOf = (p: CompetitorProduct) => {
  const raw = Math.max(landedOf(p.skuPrefix), p.suggestedSek, ...p.competitors.map(c => c.priceSek)) * 1.25;
  const step = raw > 400 ? 100 : raw > 100 ? 25 : 5;
  return Math.ceil(raw / step) * step;
};

/** 1 kr känns rätt på ett kuddskydd, 5 kr på ett duntäcke. */
const stepOf = (p: CompetitorProduct) => (scaleMaxOf(p) > 400 ? 5 : 1);

// Ordningen i marginal- och indexgraferna låses vid ursprungsförslagen, så att
// raderna inte byter plats medan man drar.
const byInitialMargin = [...competitorProducts].sort(
  (a, b) => marginPct(b, b.suggestedSek) - marginPct(a, a.suggestedSek)
);
const byInitialFloor = [...competitorProducts].sort(
  (a, b) => floorPct(b, b.suggestedSek) - floorPct(a, a.suggestedSek)
);

type BarSpec = {
  id: string;
  label: string;
  value: number;
  varName: string;
  emphasis?: boolean;
  tipTitle: string;
  tipRows: string[];
  tipNote: string;
};

export default function CompetitorCharts({ user }: { user: AdminUser | null }) {
  const { tip, showTip, hideTip } = useTip();
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(competitorProducts.map(p => [p.skuPrefix, p.suggestedSek]))
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<StoredSuggestion[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hiddenMembers, setHiddenMembers] = useState<string[]>([]);
  const [removing, setRemoving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  /**
   * Medlemmarna i visningsordning, var och en med sin färg. Ett förslag per
   * person — det är tabellens kolumner och staplarnas rader.
   */
  const members = suggestions
    .slice()
    .sort((a, b) => a.user.localeCompare(b.user, 'sv'))
    .map((suggestion, index) => ({
      ...suggestion,
      varName: memberVar(index),
      hidden: hiddenMembers.includes(suggestion.user),
    }));
  const visibleMembers = members.filter(m => !m.hidden);
  const mine = members.find(m => m.user === user) ?? null;

  const toggleMember = (name: string) =>
    setHiddenMembers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );

  const priceOf = (p: CompetitorProduct) => prices[p.skuPrefix] ?? p.suggestedSek;
  const setPrice = (p: CompetitorProduct, next: number) =>
    setPrices(prev => ({ ...prev, [p.skuPrefix]: Math.max(0, Math.min(scaleMaxOf(p), Math.round(next))) }));
  const isEdited = (p: CompetitorProduct) => Math.round(priceOf(p)) !== Math.round(p.suggestedSek);
  const anyEdited = competitorProducts.some(isEdited);

  const loadSuggestions = async () => {
    const response = await fetch('/api/admin/suggestions');
    if (!response.ok) return;
    const body = await response.json();
    setSuggestions(body.suggestions ?? []);
    setSuggestionsLoaded(true);
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const saveSuggestion = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    const response = await fetch('/api/admin/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices, label: label.trim() || null }),
    });
    if (response.ok) {
      setLabel('');
      await loadSuggestions();
    } else {
      const body = await response.json().catch(() => ({}));
      setSaveError(body.error ?? 'Kunde inte spara förslaget.');
    }
    setSaving(false);
  };

  /**
   * Skriver ett förslag som faktiskt pris i katalogen. Till skillnad från
   * reglaget och "Använd" (som bara flyttar siffror i den här vyn) går detta
   * anrop mot /api/admin/suggestions/apply och ändrar priset kunden ser.
   */
  const applySuggestedPrice = async (p: CompetitorProduct, memberUser: string, priceSek: number) => {
    const handle = handleOf(p.skuPrefix);
    if (!handle) {
      setApplyError(`${titleOf(p.skuPrefix)} är inte kopplad till en produkt i katalogen.`);
      return;
    }
    const ok = window.confirm(
      `Sätt priset för ${titleOf(p.skuPrefix)} till ${sek(priceSek, 0)} kr (${memberUser}s förslag)?\n\n` +
        'Det här ändrar priset kunden ser, på alla varianter av produkten.'
    );
    if (!ok) return;

    const key = `${p.skuPrefix}:${memberUser}`;
    setApplying(key);
    setApplyError(null);
    try {
      const response = await fetch('/api/admin/suggestions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, priceSek }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setApplyError(body.error ?? `Kunde inte sätta priset för ${titleOf(p.skuPrefix)}.`);
        return;
      }
      // Reglaget ska stämma med det pris som nu faktiskt gäller.
      setPrice(p, priceSek);
    } finally {
      setApplying(null);
    }
  };

  const removeSuggestion = async () => {
    if (!mine) return;
    setRemoving(true);
    setSaveError(null);
    const response = await fetch('/api/admin/suggestions', { method: 'DELETE' });
    if (response.ok) {
      await loadSuggestions();
    } else {
      const body = await response.json().catch(() => ({}));
      setSaveError(body.error ?? 'Kunde inte ta bort förslaget.');
    }
    setRemoving(false);
  };

  const bar = (b: BarSpec, max: number, suffix: string) => (
    <div
      key={b.id}
      className="grid grid-cols-[178px_1fr_92px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
    >
      <div
        className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
        style={{ color: b.emphasis ? 'var(--viz-ink)' : 'var(--viz-ink-2)', fontWeight: b.emphasis ? 600 : 400 }}
      >
        {b.label}
      </div>
      <div className="flex h-[18px] items-stretch" style={{ width: `${Math.min(100, (b.value / max) * 100)}%` }}>
        <div
          tabIndex={0}
          role="img"
          aria-label={`${b.tipTitle}, ${b.label}: ${sek(b.value, 0)}${suffix}`}
          className="min-w-[2px] flex-1 cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
          style={{ background: `var(${b.varName})` }}
          onMouseEnter={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
          onMouseMove={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
          onFocus={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
          onMouseLeave={hideTip}
          onBlur={hideTip}
        />
      </div>
      <span
        className="whitespace-nowrap font-mono text-[11px] tabular-nums"
        style={{ color: b.emphasis ? 'var(--viz-ink)' : 'var(--viz-ink-2)' }}
      >
        {sek(b.value, 0)}
        {suffix}
      </span>
    </div>
  );

  /**
   * Som `bar`, men med ett fast spår och ett streck vid jämförelsens pris
   * (100 %) — annars syns bara att stapeln växer när man drar, inte om den
   * redan gått förbi konkurrentens pris eller inte.
   */
  const indexBar = (b: BarSpec, max: number) => {
    const pct = Math.min(100, (b.value / max) * 100);
    const refPct = (100 / max) * 100;
    const over = b.value > 100;
    return (
      <div
        key={b.id}
        className="grid grid-cols-[178px_1fr_108px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
      >
        <div
          className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {b.label}
        </div>
        <div className="relative h-[18px] rounded-[3px]" style={{ background: 'var(--viz-grid)' }}>
          <span
            aria-hidden
            title="Jämförelsens pris — samma pris som konkurrenten"
            className="pointer-events-none absolute bottom-0 top-0 w-px"
            style={{ left: `${refPct}%`, background: 'var(--viz-ink-3)', opacity: 0.9 }}
          />
          <div
            tabIndex={0}
            role="img"
            aria-label={`${b.tipTitle}, ${b.label}: ${sek(b.value, 0)} %, ${overUnderLabel(b.value)}`}
            className="absolute bottom-0 top-0 left-0 min-w-[2px] cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
            style={{ width: `${pct}%`, background: `var(${b.varName})` }}
            onMouseEnter={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
            onMouseMove={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
            onFocus={e => showTip(e, { title: b.tipTitle, rows: b.tipRows, note: b.tipNote })}
            onMouseLeave={hideTip}
            onBlur={hideTip}
          />
        </div>
        <span
          className="whitespace-nowrap font-mono text-[11px] tabular-nums"
          style={{ color: over ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
        >
          {overUnderLabel(b.value)}
        </span>
      </div>
    );
  };

  const competitorBar = (p: CompetitorProduct, c: Competitor): BarSpec => ({
    id: `${p.skuPrefix}-${c.vendor}-${c.product}-${c.size}`,
    label: `${c.vendor} · ${c.product}`,
    value: c.priceSek,
    varName: SERIES[c.channel as Channel].varName,
    tipTitle: `${c.vendor} — ${c.product}`,
    tipRows: [
      `${sek(c.priceSek, 0)} SEK/st exkl. moms`,
      `${c.spec} · ${c.size} cm`,
      c.channel === 'b2c' ? 'B2C-pris, omräknat från pris inkl. moms' : 'B2B-listpris',
    ],
    tipNote: c.caveat ?? (c.primary ? 'Vald som närmaste motsvarighet.' : 'Jämförelseprodukt.'),
  });

  return (
    <>
      <Card
        title="Vad marknaden tar för motsvarande produkt"
        sub="Per produkt: vår landade kostnad, vårt föreslagna listpris och de närmast likvärdiga produkterna hos svenska och nordiska hotelltextilleverantörer. Den blå stapeln går att dra — konkurrenternas står still. Marginalen och indexet i graferna nedanför följer med."
        note={
          <>
            Sortimentet delar sig i två. <b>På dun är marknaden dyr och trög</b> — 825–1 427 kr, allt är
            50/50 dun och fjäder, och våra 90/10 är helt enkelt en bättre produkt. Där kan vi ta premiumpris
            och ändå underskrida alla.{' '}
            <b>På fiber och skydd är den brutal.</b> Mandales säljer ett 800-grams fibertäcke för 190 kr,
            Livv en kudde för 95 kr och ett kuddskydd i exakt vår storlek för 45 kr. De prispunkterna
            ligger nära vår egen landade kostnad, och de går inte att möta — bara att förklara sig ifrån.
          </>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Legend
            items={[
              SERIES.landed,
              SERIES.suggested,
              ...visibleMembers.map(m => ({ label: `${m.user}s förslag`, varName: m.varName })),
              SERIES.b2b,
              SERIES.b2c,
            ]}
          />
          <button
            type="button"
            disabled={!anyEdited}
            onClick={() =>
              setPrices(Object.fromEntries(competitorProducts.map(p => [p.skuPrefix, p.suggestedSek])))
            }
            className="rounded-sm border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-opacity disabled:opacity-35"
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
          >
            Återställ förslagen
          </button>
        </div>

        <SuggestionPanel
          user={user}
          anyEdited={anyEdited}
          label={label}
          setLabel={setLabel}
          saving={saving}
          removing={removing}
          saveError={saveError}
          onSave={saveSuggestion}
          onRemove={removeSuggestion}
          members={members}
          mine={mine}
          suggestionsLoaded={suggestionsLoaded}
          onToggleMember={toggleMember}
          onUseMember={m => setPrices(prev => ({ ...prev, ...m.prices }))}
        />

        {applyError && (
          <p role="alert" className="text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
            {applyError}
          </p>
        )}

        <div className="flex flex-col gap-6">
          {competitorProducts.map(p => {
            const landed = landedOf(p.skuPrefix);
            const max = scaleMaxOf(p);
            const staticBars: BarSpec[] = [
              {
                id: `${p.skuPrefix}-landed`,
                label: 'Landad kostnad',
                value: landed,
                varName: SERIES.landed.varName,
                tipTitle: titleOf(p.skuPrefix),
                tipRows: [`${sek(landed)} SEK/st landad kostnad`, `${p.ourSpec}`],
                tipNote: 'Vara, frakt och tull fram till lagret i Uppsala.',
              },
              ...p.competitors.map(c => competitorBar(p, c)),
            ];

            return (
              <div key={p.skuPrefix} className="flex flex-col gap-[9px]">
                <div
                  className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b pb-1.5"
                  style={{ borderColor: 'var(--viz-grid)' }}
                >
                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
                    {titleOf(p.skuPrefix)}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--viz-ink-3)' }}>
                    {p.ourSpec} · {p.ourSize} cm
                  </span>
                </div>

                {bar(staticBars[0], max, ' kr')}

                <PriceSlider
                  product={p}
                  price={priceOf(p)}
                  max={max}
                  step={stepOf(p)}
                  landed={landed}
                  edited={isEdited(p)}
                  dragging={dragging === p.skuPrefix}
                  onDragChange={active => setDragging(active ? p.skuPrefix : null)}
                  onChange={next => setPrice(p, next)}
                  onReset={() => setPrice(p, p.suggestedSek)}
                />

                {visibleMembers.map(m => {
                  const theirs = m.prices[p.skuPrefix];
                  if (theirs === undefined) return null;
                  const current = priceOf(p);
                  const diff = theirs - current;
                  const applyKey = `${p.skuPrefix}:${m.user}`;
                  return (
                    <div key={`${p.skuPrefix}-member-row-${m.user}`} className="flex items-center gap-2">
                      <div className="flex-1">
                        {bar(
                          {
                            id: `${p.skuPrefix}-member-${m.user}`,
                            label: `${m.user}s förslag`,
                            value: theirs,
                            varName: m.varName,
                            tipTitle: `${m.user} — ${titleOf(p.skuPrefix)}`,
                            tipRows: [
                              `${sek(theirs, 0)} SEK/st`,
                              `${sek(marginPct(p, theirs), 1)} % bruttomarginal`,
                              diff === 0
                                ? 'Samma som priset du satt nu'
                                : `${diff > 0 ? '+' : ''}${sek(diff, 0)} kr mot priset du satt nu`,
                            ],
                            tipNote: m.label
                              ? `${m.label} · sparat ${fmtWhen(m.updatedAt ?? m.createdAt)}`
                              : `Sparat ${fmtWhen(m.updatedAt ?? m.createdAt)}`,
                          },
                          max,
                          ' kr'
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => applySuggestedPrice(p, m.user, theirs)}
                        disabled={applying === applyKey}
                        className="shrink-0 rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em] disabled:opacity-40"
                        style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
                        title={`Sätt ${titleOf(p.skuPrefix)}s pris till ${sek(theirs, 0)} kr — ${m.user}s förslag`}
                      >
                        {applying === applyKey ? 'Sätter…' : 'Sätt'}
                      </button>
                    </div>
                  );
                })}

                {staticBars.slice(1).map(b => bar(b, max, ' kr'))}
              </div>
            );
          })}
        </div>

        <MemberMatrix
          members={visibleMembers}
          currentPrices={prices}
          priceOf={priceOf}
        />
      </Card>

      <Card
        title="Bruttomarginal vid satt pris"
        sub="Priset minus landad kostnad, som andel av priset. Delad skala 0–100 %, så raderna går att jämföra rakt av. Ändras direkt när du drar i reglaget ovanför."
        note={
          <>
            Vid de ursprungliga förslagen ligger marginalen mellan{' '}
            {sek(Math.min(...competitorProducts.map(p => marginPct(p, p.suggestedSek))), 0)} och{' '}
            {sek(Math.max(...competitorProducts.map(p => marginPct(p, p.suggestedSek))), 0)} % över hela
            sortimentet, vilket är avsiktligt: förslagen är satta mot marknaden, inte mot ett fast pålägg.
            Marginalen är lägst där konkurrensen är hårdast, inte där produkten är billigast.{' '}
            <b>Väg marginalen mot volymen</b> — Kudde Sigrid är 16 sålda enheter och Kuddskydd 300, så det
            är Kuddskyddet som avgör om sortimentet bär sig.
          </>
        }
      >
        <div className="flex flex-col gap-[9px]">
          {byInitialMargin.map(p => {
            const price = priceOf(p);
            const m = marginPct(p, price);
            return bar(
              {
                id: `${p.skuPrefix}-margin`,
                label: titleOf(p.skuPrefix),
                value: Math.max(0, m),
                varName: m < 0 ? '--viz-flag' : SERIES.suggested.varName,
                tipTitle: titleOf(p.skuPrefix),
                tipRows: [
                  `${sek(m, 1)} % bruttomarginal`,
                  `${sek(price, 0)} kr pris − ${sek(landedOf(p.skuPrefix))} kr landad kostnad`,
                  `${sek(price - landedOf(p.skuPrefix), 0)} kr täckningsbidrag per styck`,
                ],
                tipNote: isEdited(p) ? `Ändrat från förslaget ${sek(p.suggestedSek, 0)} kr.` : p.rationale,
              },
              100,
              ' %'
            );
          })}
        </div>
        <Axis ticks={[0, 25, 50, 75, 100]} max={100} unit="bruttomarginal" format={t => `${t} %`} />
      </Card>

      <Card
        title="Vårt pris mot marknaden"
        sub="Två mått per produkt. Den övre stapeln jämför mot den B2B-produkt vi bedömt vara närmast likvärdig. Den undre jämför mot det billigaste B2B-alternativ vi hittat över huvud taget — den prispunkt en inköpare faktiskt kan välja i stället för oss. Det grå strecket i varje stapel är jämförelsens pris. Stapeln stannar före strecket när vi är billigare (blått/turkost) och sticker förbi det när vi är dyrare (rött)."
        flag
        note={
          <>
            Mot närmaste motsvarighet ser allt bra ut. Mot golvet gör det inte det. <b>Täcke Daniel och
            Kudde Eric ligger båda kring 170 % av det billigaste alternativet</b> — Mandales fibertäcke på
            190 kr och Livvs bollfiberkudde på 95 kr. Det är de två produkter som binder mest kapital i
            sändningen. Skillnaden är inte inbillad, den är produktkvalitet, men den måste gå att sälja in i
            ett anbud, annars är den inte värd något. Dunprodukterna är det motsatta: där ligger golvet på
            1 199 respektive 825 kr och vår produkt är bättre än allt vi jämför mot.
          </>
        }
      >
        <Legend
          items={[
            { label: 'Mot närmaste motsvarighet', varName: SERIES.suggested.varName },
            { label: 'Mot billigaste B2B-alternativ', varName: '--viz-s2' },
          ]}
        />
        <div className="flex flex-col gap-4">
          {byInitialFloor.map(p => {
            const price = priceOf(p);
            const near = primaryOf(p);
            const floor = floorOf(p);
            const idx = indexPct(p, price);
            const flr = floorPct(p, price);
            return (
              <div key={p.skuPrefix} className="flex flex-col gap-[5px]">
                <span className="text-[12.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
                  {titleOf(p.skuPrefix)}
                </span>
                {indexBar(
                  {
                    id: `${p.skuPrefix}-index`,
                    label: `${near.vendor} · ${sek(near.priceSek, 0)} kr`,
                    value: idx,
                    varName: idx > 100 ? '--viz-flag' : SERIES.suggested.varName,
                    tipTitle: `${titleOf(p.skuPrefix)} mot närmaste motsvarighet`,
                    tipRows: [
                      `${sek(idx, 0)} % av ${near.vendor}`,
                      `${sek(price, 0)} kr mot ${sek(near.priceSek, 0)} kr`,
                      `${near.product} · ${near.size} cm`,
                    ],
                    tipNote: near.caveat ?? 'Närmaste motsvarighet i underlaget.',
                  },
                  INDEX_MAX
                )}
                {indexBar(
                  {
                    id: `${p.skuPrefix}-floor`,
                    label: `${floor.vendor} · ${sek(floor.priceSek, 0)} kr`,
                    value: flr,
                    varName: flr > 100 ? '--viz-flag' : '--viz-s2',
                    tipTitle: `${titleOf(p.skuPrefix)} mot marknadens golv`,
                    tipRows: [
                      `${sek(flr, 0)} % av ${floor.vendor}`,
                      `${sek(price, 0)} kr mot ${sek(floor.priceSek, 0)} kr`,
                      `${floor.product} · ${floor.size} cm`,
                    ],
                    tipNote: floor.caveat ?? 'Billigaste B2B-alternativet i underlaget.',
                  },
                  INDEX_MAX
                )}
              </div>
            );
          })}
        </div>
        <Axis
          ticks={[0, 50, 100, 150, 200, 250]}
          max={INDEX_MAX}
          unit="av jämförelsen · streck vid 100 % = samma pris"
          format={t => `${t} %`}
        />
      </Card>

      <section
        className="rounded-[3px] border px-6 py-6"
        style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <caption
              className="pb-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.1em]"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              Källor · SEK per styck · insamlat {collectedAt} · EUR omräknat till {sek(eurSek, 3)} ·
              &rdquo;exkl.?&rdquo; = leverantören anger inte momsstatus, priset är antaget exkl. moms
            </caption>
            <thead>
              <tr>
                {['Vår produkt', 'Leverantör', 'Produkt', 'Specifikation', 'Storlek', 'Kanal', 'Prisbas', 'Pris'].map(
                  (h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`whitespace-nowrap border-b px-2.5 py-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.06em] ${
                        i === 7 ? 'text-right' : 'text-left'
                      }`}
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody style={{ color: 'var(--viz-ink)' }}>
              {competitorProducts.flatMap(p =>
                p.competitors.map((c, i) => (
                  <tr key={`${p.skuPrefix}-${c.vendor}-${c.product}-${c.size}`}>
                    <th
                      scope="row"
                      className="whitespace-nowrap border-b px-2.5 py-2 text-left font-normal"
                      style={{ borderColor: 'var(--viz-rule)', color: i === 0 ? 'var(--viz-ink)' : 'var(--viz-ink-3)' }}
                    >
                      {i === 0 ? titleOf(p.skuPrefix) : '↳'}
                    </th>
                    <td className="border-b px-2.5 py-2" style={{ borderColor: 'var(--viz-rule)' }}>
                      {c.vendor}
                    </td>
                    <td className="border-b px-2.5 py-2" style={{ borderColor: 'var(--viz-rule)' }}>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {c.product}
                      </a>
                      {c.primary && (
                        <span
                          className="ml-[7px] whitespace-nowrap rounded-sm border px-[5px] py-px font-mono text-[10px] uppercase tracking-[0.06em]"
                          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                          title="Indexet i tredje grafen räknas mot den här produkten."
                        >
                          motsvarighet
                        </span>
                      )}
                    </td>
                    <td
                      className="border-b px-2.5 py-2"
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
                    >
                      {c.spec}
                      {c.caveat && (
                        <span className="block text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
                          {c.caveat}
                        </span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-2.5 py-2 tabular-nums"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {c.size}
                    </td>
                    <td
                      className="border-b px-2.5 py-2 font-mono text-[11px] uppercase"
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                    >
                      {c.channel}
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-2.5 py-2 font-mono text-[10.5px]"
                      style={{
                        borderColor: 'var(--viz-rule)',
                        color: c.basis === 'ex-antag' ? 'var(--viz-flag)' : 'var(--viz-ink-3)',
                      }}
                      title={BASIS_LABEL[c.basis]}
                    >
                      {c.basis === 'ex' ? 'exkl.' : c.basis === 'ex-antag' ? 'exkl.?' : 'omräknat'}
                    </td>
                    <td
                      className="whitespace-nowrap border-b px-2.5 py-2 text-right tabular-nums"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {sek(c.priceSek, 0)} kr
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Tooltip tip={dragging ? null : tip} />
    </>
  );
}

/**
 * Vår prisstapel som reglage. Hela spåret är dragbart, och stapeln fungerar som
 * en ARIA-slider så att den går att styra med piltangenter också.
 */
function PriceSlider({
  product,
  price,
  max,
  step,
  landed,
  edited,
  dragging,
  onChange,
  onDragChange,
  onReset,
}: {
  product: CompetitorProduct;
  price: number;
  max: number;
  step: number;
  landed: number;
  edited: boolean;
  dragging: boolean;
  onChange: (next: number) => void;
  onDragChange: (active: boolean) => void;
  onReset: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const valueFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return price;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round((ratio * max) / step) * step;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onDragChange(true);
    onChange(valueFromEvent(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onChange(valueFromEvent(e.clientX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onDragChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 10 : 1;
    const keys: Record<string, number | undefined> = {
      ArrowRight: price + step * big,
      ArrowUp: price + step * big,
      ArrowLeft: price - step * big,
      ArrowDown: price - step * big,
      PageUp: price + step * 10,
      PageDown: price - step * 10,
      Home: 0,
      End: max,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(next);
  };

  const pct = Math.min(100, (price / max) * 100);
  const suggestedPct = Math.min(100, (product.suggestedSek / max) * 100);
  const marginNow = marginPct(product, price);
  const belowCost = price < landed;

  return (
    <div className="grid grid-cols-[178px_1fr_92px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1">
      <div
        className="flex items-center justify-end gap-2 text-right text-[12.5px] font-semibold leading-tight max-[620px]:col-span-full max-[620px]:justify-start max-[620px]:text-left"
        style={{ color: 'var(--viz-ink)' }}
      >
        {edited && (
          <button
            type="button"
            onClick={onReset}
            title={`Återställ till förslaget ${sek(product.suggestedSek, 0)} kr`}
            className="rounded-sm border px-[5px] py-px font-mono text-[9.5px] font-normal uppercase tracking-[0.06em]"
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
          >
            ↺
          </button>
        )}
        <span>Vårt pris</span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-[26px] touch-none select-none rounded-[3px]"
        style={{ background: 'var(--viz-grid)', cursor: dragging ? 'grabbing' : 'ew-resize' }}
      >
        {/* Var förslaget låg, så avvikelsen syns medan man drar. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 w-px"
          style={{ left: `${suggestedPct}%`, background: 'var(--viz-ink-3)', opacity: edited ? 0.65 : 0 }}
        />
        {/* Landad kostnad — under den här linjen säljer vi med förlust. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 w-px"
          style={{ left: `${(landed / max) * 100}%`, background: 'var(--viz-s3)', opacity: 0.9 }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Pris för ${titleOf(product.skuPrefix)}`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.round(price)}
          aria-valuetext={`${sek(price, 0)} kronor per styck, ${sek(marginNow, 0)} procent bruttomarginal`}
          onKeyDown={onKeyDown}
          className="absolute bottom-[4px] top-[4px] left-0 rounded-[3px_4px_4px_3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            width: `${pct}%`,
            minWidth: 2,
            background: belowCost ? 'var(--viz-flag)' : 'var(--viz-s1)',
            outlineColor: 'var(--viz-ink)',
          }}
        >
          <span
            aria-hidden
            className="absolute -right-px bottom-[-4px] top-[-4px] w-[3px] rounded-[2px]"
            style={{ background: 'var(--viz-ink)', opacity: dragging ? 1 : 0.55 }}
          />
        </div>
      </div>

      <span
        className="whitespace-nowrap font-mono text-[11px] tabular-nums"
        style={{ color: belowCost ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
      >
        {sek(price, 0)} kr
        <span className="block text-[10px]" style={{ color: 'var(--viz-ink-3)' }}>
          {sek(marginNow, 0)} % marg.
        </span>
      </span>
    </div>
  );
}

type Member = StoredSuggestion & { varName: string; hidden: boolean };

/**
 * Alla medlemmars bud sida vid sida, en kolumn per person.
 *
 * Den här tabellen är poängen med att flera sätter pris: spridningen mellan
 * lägsta och högsta bud säger var vi är oense, och det är de raderna som
 * behöver diskuteras. Rader där alla ligger lika behöver ingen tid alls.
 */
function MemberMatrix({
  members,
  currentPrices,
  priceOf,
}: {
  members: Member[];
  currentPrices: Record<string, number>;
  priceOf: (p: CompetitorProduct) => number;
}) {
  if (!members.length) return null;

  const cell = 'whitespace-nowrap border-b px-2.5 py-2 text-right font-mono tabular-nums';

  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-mono text-[10.5px] uppercase tracking-[0.1em]"
        style={{ color: 'var(--viz-ink-3)' }}
      >
        Vad var och en föreslår · SEK per styck exkl. moms
      </span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="whitespace-nowrap border-b px-2.5 py-2 text-left font-mono text-[10px] font-normal uppercase tracking-[0.06em]"
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
              >
                Produkt
              </th>
              <th
                scope="col"
                className="whitespace-nowrap border-b px-2.5 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-[0.06em]"
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                title="Landad kostnad per styck."
              >
                Landad
              </th>
              {members.map(m => (
                <th
                  key={m.user}
                  scope="col"
                  className="whitespace-nowrap border-b px-2.5 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-[0.06em]"
                  style={{ borderColor: 'var(--viz-rule)', color: `var(${m.varName})` }}
                >
                  {m.user}
                </th>
              ))}
              <th
                scope="col"
                className="whitespace-nowrap border-b px-2.5 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-[0.06em]"
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                title="Priset du satt med reglaget just nu."
              >
                Ditt reglage
              </th>
              <th
                scope="col"
                className="whitespace-nowrap border-b px-2.5 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-[0.06em]"
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                title="Skillnaden mellan högsta och lägsta medlemsbud."
              >
                Spridning
              </th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--viz-ink)' }}>
            {competitorProducts.map(p => {
              const values = members
                .map(m => m.prices[p.skuPrefix])
                .filter((v): v is number => typeof v === 'number');
              const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
              const lowest = values.length ? Math.min(...values) : null;
              const highest = values.length ? Math.max(...values) : null;
              const landed = landedOf(p.skuPrefix);

              return (
                <tr key={p.skuPrefix}>
                  <th
                    scope="row"
                    className="whitespace-nowrap border-b px-2.5 py-2 text-left font-normal"
                    style={{ borderColor: 'var(--viz-rule)' }}
                  >
                    {titleOf(p.skuPrefix)}
                  </th>
                  <td
                    className={cell}
                    style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                  >
                    {sek(landed, 0)}
                  </td>
                  {members.map(m => {
                    const value = m.prices[p.skuPrefix];
                    if (value === undefined) {
                      return (
                        <td
                          key={m.user}
                          className={cell}
                          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                        >
                          —
                        </td>
                      );
                    }
                    // Extremerna märks ut bara när någon faktiskt skiljer sig.
                    const isLow = spread > 0 && value === lowest;
                    const isHigh = spread > 0 && value === highest;
                    return (
                      <td
                        key={m.user}
                        className={cell}
                        style={{
                          borderColor: 'var(--viz-rule)',
                          color: value < landed ? 'var(--viz-flag)' : 'var(--viz-ink)',
                          fontWeight: isLow || isHigh ? 600 : 400,
                        }}
                        title={
                          value < landed
                            ? `Under landad kostnad (${sek(landed, 0)} kr)`
                            : `${sek(marginPct(p, value), 1)} % bruttomarginal${
                                isLow ? ' · lägsta budet' : isHigh ? ' · högsta budet' : ''
                              }`
                        }
                      >
                        {sek(value, 0)}
                        {isLow && spread > 0 && <span aria-hidden> ↓</span>}
                        {isHigh && spread > 0 && <span aria-hidden> ↑</span>}
                      </td>
                    );
                  })}
                  <td className={cell} style={{ borderColor: 'var(--viz-rule)' }}>
                    {sek(priceOf(p) ?? currentPrices[p.skuPrefix] ?? p.suggestedSek, 0)}
                  </td>
                  <td
                    className={cell}
                    style={{
                      borderColor: 'var(--viz-rule)',
                      color: spread === 0 ? 'var(--viz-ink-3)' : 'var(--viz-s2)',
                    }}
                  >
                    {spread === 0 ? 'eniga' : `${sek(spread, 0)} kr`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Spara den egna prisdragningen, och se allas bud bredvid varandra.
 *
 * Var och en har exakt ett levande förslag. Att spara igen skriver över sitt
 * eget — det finns inget "mitt förslag från i tisdags" att förväxla med det
 * aktuella. Historiken ligger i aktivitetsloggen.
 */
function SuggestionPanel({
  user,
  anyEdited,
  label,
  setLabel,
  saving,
  removing,
  saveError,
  onSave,
  onRemove,
  members,
  mine,
  suggestionsLoaded,
  onToggleMember,
  onUseMember,
}: {
  user: AdminUser | null;
  anyEdited: boolean;
  label: string;
  setLabel: (v: string) => void;
  saving: boolean;
  removing: boolean;
  saveError: string | null;
  onSave: () => void;
  onRemove: () => void;
  members: Member[];
  mine: Member | null;
  suggestionsLoaded: boolean;
  onToggleMember: (name: string) => void;
  onUseMember: (m: Member) => void;
}) {
  const chip =
    'rounded-sm border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-opacity disabled:opacity-35';

  return (
    <div
      className="flex flex-col gap-3 rounded-[3px] border px-4 py-3.5"
      style={{ borderColor: 'var(--viz-rule)', background: 'var(--viz-plane)' }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={mine?.label ?? (user ? `${user}s förslag …` : 'Förslag …')}
          maxLength={120}
          className="min-w-[160px] flex-1 rounded-[3px] border px-2.5 py-1.5 text-[13px]"
          style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
        />
        <button
          type="button"
          disabled={!user || !anyEdited || saving}
          onClick={onSave}
          className={chip}
          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
          title={
            !user
              ? 'Logga in för att spara ett förslag.'
              : !anyEdited
                ? 'Dra i minst ett pris innan du sparar.'
                : mine
                  ? 'Skriver över ditt nuvarande förslag.'
                  : undefined
          }
        >
          {saving ? 'Sparar…' : mine ? 'Uppdatera mitt förslag' : `Spara som ${user ?? '…'}s förslag`}
        </button>
        {mine && (
          <button
            type="button"
            disabled={removing}
            onClick={onRemove}
            className={chip}
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-flag)' }}
            title="Ta bort mitt förslag helt."
          >
            {removing ? 'Tar bort…' : 'Ta bort mitt'}
          </button>
        )}
      </div>

      {saveError && (
        <p role="alert" className="text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
          {saveError}
        </p>
      )}

      {suggestionsLoaded && members.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--viz-grid)' }}>
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.1em]"
            style={{ color: 'var(--viz-ink-3)' }}
          >
            Levande förslag ({members.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {members.map(m => (
              <span
                key={m.user}
                className="inline-flex items-center gap-2 rounded-[3px] border px-2.5 py-1.5 text-[12.5px]"
                style={{
                  borderColor: 'var(--viz-rule)',
                  background: 'var(--viz-surface)',
                  opacity: m.hidden ? 0.5 : 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => onToggleMember(m.user)}
                  aria-pressed={!m.hidden}
                  title={m.hidden ? `Visa ${m.user}s förslag` : `Dölj ${m.user}s förslag`}
                  className="inline-flex items-center gap-1.5"
                  style={{ color: 'var(--viz-ink)' }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-[9px] w-[9px] shrink-0 rounded-sm"
                    style={{
                      background: m.hidden ? 'transparent' : `var(${m.varName})`,
                      boxShadow: m.hidden ? `inset 0 0 0 1px var(${m.varName})` : undefined,
                    }}
                  />
                  <b className="font-semibold">{m.user}</b>
                  {m.user === user && (
                    <span style={{ color: 'var(--viz-ink-3)' }}>(du)</span>
                  )}
                </button>
                <span style={{ color: 'var(--viz-ink-3)' }}>
                  {fmtWhen(m.updatedAt ?? m.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => onUseMember(m)}
                  className="rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em]"
                  style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
                  title={`Läs in ${m.user}s priser i reglagen`}
                >
                  Använd
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
