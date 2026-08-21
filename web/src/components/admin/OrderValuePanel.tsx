'use client';

/**
 * Redigering och modellering av `orderValue` — rabatt på ordervärde.
 *
 * Alla siffror här räknas av `priceOrder` i pricingRules.ts, alltså exakt
 * samma funktion som korgen och kassan använder. Det är avsiktligt: en
 * modelleringsvy som räknar på egen hand skulle förr eller senare visa en
 * annan marginal än den order faktiskt ger, och det är just den sortens
 * dubbla sanning prislogiken finns för att stänga.
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Field } from '@/components/admin/Fields';
import { Panel } from '@/components/admin/ui';
import type { PricingModelProduct } from '@/lib/pricingModelData';
import {
  capPercentForSku,
  orderValueTierFor,
  priceOrder,
  type PricingConfig,
} from '@/lib/pricingRules';

type OrderValue = PricingConfig['orderValue'];

/**
 * Standardkorgen modellen mäter mot: vad ett hotell behöver per rum.
 * Ett täcke, två kuddar, ett madrasskydd och två kuddskydd per bädd.
 */
const PER_ROOM: { skuPrefix: string; perRoom: number }[] = [
  { skuPrefix: 'TAC-DAN', perRoom: 1 },
  { skuPrefix: 'KUD-ERI', perRoom: 2 },
  { skuPrefix: 'MAD', perRoom: 1 },
  { skuPrefix: 'KSK', perRoom: 2 },
];

const kr = (minor: number, decimals = 0) =>
  (minor / 100).toLocaleString('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const pct = (value: number, decimals = 1) =>
  value.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function OrderValuePanel({
  orderValue,
  minimumOrderQuantity,
  products,
  onChange,
}: {
  orderValue: OrderValue;
  minimumOrderQuantity: number;
  products: PricingModelProduct[];
  onChange: (next: OrderValue) => void;
}) {
  const [rooms, setRooms] = useState(50);

  const byPrefix = useMemo(
    () => new Map(products.map(product => [product.skuPrefix, product])),
    [products]
  );

  /** En konfiguration som bara skiljer sig i `orderValue` — resten är utan verkan här. */
  const config = useMemo<PricingConfig>(
    () => ({
      strategy: 'orderValue',
      tiers: [],
      linear: { startQuantity: 0, quantityStep: 1, percentPerStep: 0, maxPercent: 0 },
      orderValue,
      marginTargetPercent: 0,
      marginFloorPercent: null,
      minimumOrderQuantity,
      appliesTo: 'mto',
    }),
    [orderValue, minimumOrderQuantity]
  );

  const basket = useMemo(() => {
    const lines = PER_ROOM.map(entry => {
      const product = byPrefix.get(entry.skuPrefix);
      return product ? { product, quantity: entry.perRoom * rooms } : null;
    }).filter((line): line is { product: PricingModelProduct; quantity: number } => line !== null);

    const priced = priceOrder(
      config,
      lines.map(line => ({
        sku: line.product.skuPrefix,
        listPriceMinor: line.product.listPriceMinor,
        quantity: line.quantity,
        isMto: true,
        landedCostMinor: line.product.landedCostMinor,
      }))
    );

    const costMinor = priced.lines.reduce(
      (sum, priceLine, index) => sum + lines[index].product.landedCostMinor * priceLine.quantity,
      0
    );

    return { lines, priced, costMinor };
  }, [config, byPrefix, rooms]);

  const marginPercent =
    basket.priced.subtotalMinor > 0
      ? ((basket.priced.subtotalMinor - basket.costMinor) / basket.priced.subtotalMinor) * 100
      : 0;
  const listMarginPercent =
    basket.priced.listSubtotalMinor > 0
      ? ((basket.priced.listSubtotalMinor - basket.costMinor) / basket.priced.listSubtotalMinor) * 100
      : 0;

  const sortedLadder = [...orderValue.ladder].sort(
    (a, b) => a.minOrderValueMinor - b.minOrderValueMinor
  );
  const topPercent = Math.max(...orderValue.ladder.map(tier => tier.discountPercent), 0);

  const updateTier = (index: number, patch: Partial<OrderValue['ladder'][number]>) =>
    onChange({
      ...orderValue,
      ladder: orderValue.ladder.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    });

  const updateCap = (index: number, patch: Partial<OrderValue['caps'][number]>) =>
    onChange({
      ...orderValue,
      caps: orderValue.caps.map((cap, i) => (i === index ? { ...cap, ...patch } : cap)),
    });

  return (
    <>
      <Panel
        title="Ordervärdestrappa"
        accent="var(--viz-s1)"
        meta={`${orderValue.ladder.length} trappsteg · upp till ${topPercent} %`}
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...orderValue,
                ladder: [...orderValue.ladder, { minOrderValueMinor: 0, discountPercent: 0 }],
              })
            }
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Lägg till steg
          </Button>
        }
      >
        <p className="text-[13px] leading-[1.6] text-ink-2">
          Rabatten avgörs av vad hela ordern är värd till listpris, inte av antalet i en enskild
          rad. Bara MTO-rader räknas in i summan, och bara de får rabatt. Ett hotell som köper
          täcken, kuddar och skydd i samma order når alltså ett trappsteg som ingen av raderna
          hade nått var för sig.
        </p>

        <div className="grid gap-3">
          {orderValue.ladder.map((tier, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field
                label="Ordervärde från (kr)"
                name={`ov-value-${index}`}
                type="number"
                min="0"
                step="1000"
                defaultValue={String(Math.round(tier.minOrderValueMinor / 100))}
                onChange={event =>
                  updateTier(index, {
                    minOrderValueMinor: Math.round(Number(event.target.value) * 100),
                  })
                }
              />
              <Field
                label="Rabatt (%)"
                name={`ov-percent-${index}`}
                type="number"
                min="0"
                max="100"
                defaultValue={String(tier.discountPercent)}
                onChange={event =>
                  updateTier(index, { discountPercent: Number(event.target.value) })
                }
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Ta bort trappsteg"
                disabled={orderValue.ladder.length <= 1}
                onClick={() =>
                  onChange({
                    ...orderValue,
                    ladder: orderValue.ladder.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden />
              </Button>
            </div>
          ))}
        </div>

        <LadderBar ladder={sortedLadder} current={basket.priced.eligibleListSubtotalMinor} />
      </Panel>

      <Panel
        title="Tak per produkt"
        accent="var(--viz-s3)"
        meta={`${orderValue.caps.length} tak · standard ${orderValue.defaultMaxPercent} %`}
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({ ...orderValue, caps: [...orderValue.caps, { skuPrefix: '', maxPercent: 10 }] })
            }
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Lägg till tak
          </Button>
        }
      >
        <p className="text-[13px] leading-[1.6] text-ink-2">
          Taket kan bara sänka trappstegets rabatt, aldrig höja den. Det är så olika produkter kan
          dela en trappa utan att den tunnaste marginalen sätter nivån för alla. Skrymmande
          produkter tål mer: frakten låg på 2 294 kr/CBM i sändning HTL26-01, och det är den
          kostnaden som faller när en order blir stor nog att konsolideras.
        </p>

        <div className="grid gap-3">
          {orderValue.caps.map((cap, index) => {
            const product = byPrefix.get(cap.skuPrefix);
            return (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                <Field
                  label="SKU-prefix"
                  name={`cap-sku-${index}`}
                  defaultValue={cap.skuPrefix}
                  hint={product?.title}
                  onChange={event => updateCap(index, { skuPrefix: event.target.value.trim() })}
                />
                <Field
                  label="Rabatttak (%)"
                  name={`cap-max-${index}`}
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={String(cap.maxPercent)}
                  onChange={event => updateCap(index, { maxPercent: Number(event.target.value) })}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Ta bort tak"
                  onClick={() =>
                    onChange({ ...orderValue, caps: orderValue.caps.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="max-w-[280px]">
          <Field
            label="Standardtak (%)"
            name="cap-default"
            type="number"
            min="0"
            max="100"
            defaultValue={String(orderValue.defaultMaxPercent)}
            onChange={event =>
              onChange({ ...orderValue, defaultMaxPercent: Number(event.target.value) })
            }
            hint="Gäller produkter utan eget tak — alltså de tio som saknar landad kostnad."
          />
        </div>
      </Panel>

      <Panel
        title="Referenskorg"
        accent="var(--viz-s2)"
        meta={`${rooms} rum · ${basket.lines.reduce((sum, line) => sum + line.quantity, 0)} st`}
      >
        <p className="text-[13px] leading-[1.6] text-ink-2">
          En komplett hotellutrustning: per rum ett täcke, två kuddar, ett madrasskydd och två
          kuddskydd. Siffrorna nedan räknas av <code className="font-mono text-[12px]">priceOrder</code>,
          samma funktion som kassan debiterar med.
        </p>

        <div className="max-w-[220px]">
          <Field
            label="Antal rum"
            name="model-rooms"
            type="number"
            min="1"
            max="2000"
            defaultValue={String(rooms)}
            onChange={event => setRooms(Math.max(1, Number(event.target.value) || 1))}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
                <th className="py-2 pr-3 font-medium">Produkt</th>
                <th className="py-2 pr-3 text-right font-medium">Antal</th>
                <th className="py-2 pr-3 text-right font-medium">Listpris</th>
                <th className="py-2 pr-3 text-right font-medium">Rabatt</th>
                <th className="py-2 pr-3 text-right font-medium">Styckpris</th>
                <th className="py-2 pr-3 text-right font-medium">Radsumma</th>
                <th className="py-2 text-right font-medium">Marginal</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {basket.priced.lines.map((line, index) => {
                const product = basket.lines[index].product;
                const lineMargin =
                  line.unitAmountMinor > 0
                    ? ((line.unitAmountMinor - product.landedCostMinor) / line.unitAmountMinor) * 100
                    : 0;
                return (
                  <tr key={product.skuPrefix} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-3 text-ink">{product.title}</td>
                    <td className="py-2 pr-3 text-right text-ink-2">{line.quantity}</td>
                    <td className="py-2 pr-3 text-right text-ink-2">{kr(line.listUnitAmountMinor)}</td>
                    <td className="py-2 pr-3 text-right">
                      <span className={line.capApplied ? 'text-warn' : 'text-ink-2'}>
                        {line.discountPercent > 0 ? `−${line.discountPercent} %` : '—'}
                      </span>
                      {line.capApplied && (
                        <span className="ml-1 font-mono text-[10.5px] text-ink-3">
                          tak {line.capPercent}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-ink">
                      {kr(line.unitAmountMinor, 2)}
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-2">{kr(line.totalAmountMinor)}</td>
                    <td
                      className={`py-2 text-right ${lineMargin < 40 ? 'text-danger' : 'text-ink-2'}`}
                    >
                      {pct(lineMargin)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-4 gap-3 max-[760px]:grid-cols-2">
          <Figure label="Ordervärde (list)" value={`${kr(basket.priced.listSubtotalMinor)} kr`} />
          <Figure
            label="Trappsteg"
            value={`${basket.priced.ladderPercent} %`}
            note={
              orderValueTierFor(config, basket.priced.eligibleListSubtotalMinor)
                ? `från ${kr(
                    orderValueTierFor(config, basket.priced.eligibleListSubtotalMinor)!
                      .minOrderValueMinor
                  )} kr`
                : undefined
            }
          />
          <Figure
            label="Kunden betalar"
            value={`${kr(basket.priced.subtotalMinor)} kr`}
            note={`−${pct(basket.priced.effectiveDiscountPercent)} % efter tak`}
          />
          <Figure
            label="Marginal"
            value={`${pct(marginPercent)} %`}
            note={`${pct(listMarginPercent)} % utan rabatt`}
            danger={marginPercent < 40}
          />
        </div>
      </Panel>

      <Panel title="Per produkt" accent="var(--viz-s4)" meta="Vid nuvarande trappsteg">
        <p className="text-[13px] leading-[1.6] text-ink-2">
          Vad varje produkt tål. <b className="font-medium text-ink">Golv</b> är billigaste
          jämförbara B2B-pris ur konkurrentanalysen — ligger vårt pris redan under golvet köper en
          djup rabatt ingen konkurrensfördel vi inte redan har. Landad kostnad är räknad per
          produkt och storlek, inte per utförande: and och gås delar kostnad, och raden visar då
          den billigaste variantens pris.
        </p>

        {products.some(product => product.belowCost) && (
          <p
            className="rounded-ctl border px-3.5 py-3 text-[13px] leading-[1.6]"
            style={{
              borderColor: 'color-mix(in srgb, var(--adm-danger) 40%, transparent)',
              background: 'color-mix(in srgb, var(--adm-danger) 9%, transparent)',
              color: 'var(--adm-danger)',
            }}
          >
            <b className="font-semibold">
              {products.filter(product => product.belowCost).length} produkter har listpris under
              landad kostnad
            </b>{' '}
            — de går med förlust redan utan rabatt, och ingen trappa här kan rädda det. Sätt
            listpriserna först; rabattlogiken är meningslös ovanpå ett pris som redan är för lågt.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
                <th className="py-2 pr-3 font-medium">Produkt</th>
                <th className="py-2 pr-3 text-right font-medium">Landad</th>
                <th className="py-2 pr-3 text-right font-medium">Listpris</th>
                <th className="py-2 pr-3 text-right font-medium">Tak</th>
                <th className="py-2 pr-3 text-right font-medium">Pris vid tak</th>
                <th className="py-2 pr-3 text-right font-medium">Marginal vid tak</th>
                <th className="py-2 text-right font-medium">Mot golv</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {products.map(product => {
                const cap = capPercentForSku(config, product.skuPrefix);
                const applied = Math.min(cap, topPercent);
                const atCap = Math.round(product.listPriceMinor * (1 - applied / 100));
                const margin =
                  atCap > 0 ? ((atCap - product.landedCostMinor) / atCap) * 100 : 0;
                const vsFloor =
                  product.competitorFloorMinor && product.competitorFloorMinor > 0
                    ? ((atCap - product.competitorFloorMinor) / product.competitorFloorMinor) * 100
                    : null;
                return (
                  <tr key={product.skuPrefix} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-3 text-ink">
                      {product.title}
                      {product.size && (
                        <span className="ml-1.5 font-mono text-[10px] text-ink-3">{product.size}</span>
                      )}
                      {product.listPriceSource === 'analysis' && (
                        <span
                          className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3"
                          title="Priset kommer från prisanalysen — varianten hittades inte i katalogen."
                        >
                          förslag
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-2">{kr(product.landedCostMinor, 2)}</td>
                    <td className="py-2 pr-3 text-right text-ink-2">{kr(product.listPriceMinor)}</td>
                    <td className="py-2 pr-3 text-right text-ink-2">{cap} %</td>
                    <td className="py-2 pr-3 text-right font-medium text-ink">{kr(atCap, 2)}</td>
                    <td className={`py-2 pr-3 text-right ${margin < 40 ? 'text-danger' : 'text-ink-2'}`}>
                      {pct(margin)} %
                    </td>
                    <td className="py-2 text-right">
                      {vsFloor == null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className={vsFloor <= 0 ? 'text-ok' : 'text-ink-2'}>
                          {vsFloor > 0 ? '+' : ''}
                          {pct(vsFloor, 0)} %
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Figure({
  label,
  value,
  note,
  danger,
}: {
  label: string;
  value: string;
  note?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-ctl border border-rule bg-plane px-3.5 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span
        className={`text-[19px] font-semibold tabular-nums tracking-[-0.01em] ${
          danger ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </span>
      {note && <span className="text-[11.5px] text-ink-3">{note}</span>}
    </div>
  );
}

/** Trappan som en linjal, med korgens ordervärde utsatt. */
function LadderBar({
  ladder,
  current,
}: {
  ladder: { minOrderValueMinor: number; discountPercent: number }[];
  current: number;
}) {
  const max = Math.max(
    ...ladder.map(tier => tier.minOrderValueMinor),
    current * 1.15,
    1
  );

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="relative h-[30px] rounded-[3px] bg-plane">
        {ladder.map(tier => {
          const left = (tier.minOrderValueMinor / max) * 100;
          const reached = current >= tier.minOrderValueMinor;
          return (
            <div
              key={tier.minOrderValueMinor}
              className="absolute top-0 flex h-full flex-col justify-center border-l pl-1"
              style={{
                left: `${Math.min(left, 98)}%`,
                borderColor: reached ? 'var(--viz-s1)' : 'var(--viz-rule)',
              }}
            >
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: reached ? 'var(--viz-s1)' : 'var(--viz-ink-3)' }}
              >
                {tier.discountPercent} %
              </span>
              <span className="font-mono text-[9.5px] tabular-nums text-ink-3">
                {kr(tier.minOrderValueMinor)}
              </span>
            </div>
          );
        })}
        <div
          className="absolute top-0 h-full w-[2px]"
          style={{ left: `${Math.min((current / max) * 100, 100)}%`, background: 'var(--viz-s2)' }}
          aria-hidden
        />
      </div>
      <span className="text-[11.5px] text-ink-3">
        Markören visar referenskorgens rabattberättigade ordervärde: {kr(current)} kr.
      </span>
    </div>
  );
}
