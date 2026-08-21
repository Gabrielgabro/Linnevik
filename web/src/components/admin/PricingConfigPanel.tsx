'use client';

/**
 * Mängdrabattsidan i admin. Tre strategier att välja mellan — trappstegsrabatt
 * (progressive), en jämn kurva (linear) och rabatt på ordervärde (orderValue).
 * Ingen marginalbaserad strategi här: den kräver landad kostnad per rad i
 * prissättningen och skulle stänga av produktsidans förhandsvisning (se
 * `isClientComputable` i pricingRules.ts). `appliesTo` visas inte som ett
 * val — mängdrabatt gäller alltid bara MTO-produkter, aldrig lagerförda
 * varor, och det är fast i servern, inte något admin kan råka slå på.
 *
 * `orderValue` visar landad kostnad i modelleringsvyn. Det är avsiktligt och
 * gäller bara här: adminvyn ligger bakom inloggning och gör redan samma sak i
 * CostCharts. Produktsidan får aldrig konfigurationen för den strategin.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ErrorNote, Field } from '@/components/admin/Fields';
import LinearCurveChart from '@/components/admin/LinearCurveChart';
import OrderValuePanel from '@/components/admin/OrderValuePanel';
import { Panel } from '@/components/admin/ui';
import type { PricingConfigRow } from '@/lib/db/schema';
import type { PricingModelProduct } from '@/lib/pricingModelData';
import { DEFAULT_PRICING_CONFIG, type PricingConfig } from '@/lib/pricingRules';

type Tier = { minQuantity: number; discountPercent: number };
type Linear = { startQuantity: number; quantityStep: number; percentPerStep: number; maxPercent: number };
type Strategy = 'progressive' | 'linear' | 'orderValue';

export default function PricingConfigPanel({
  initial,
  modelProducts,
}: {
  initial: PricingConfigRow;
  modelProducts: PricingModelProduct[];
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy>(initial.strategy as Strategy);
  const [tiers, setTiers] = useState<Tier[]>(
    initial.tiers.length ? initial.tiers : [{ minQuantity: 50, discountPercent: 0 }]
  );
  const [linear, setLinear] = useState<Linear>({
    startQuantity: initial.linearStartQuantity,
    quantityStep: initial.linearQuantityStep,
    percentPerStep: initial.linearPercentPerStep,
    maxPercent: initial.linearMaxPercent,
  });
  const [orderValue, setOrderValue] = useState<PricingConfig['orderValue']>({
    ladder: initial.orderValueLadder.length
      ? initial.orderValueLadder
      : DEFAULT_PRICING_CONFIG.orderValue.ladder,
    caps: initial.orderValueCaps.length
      ? initial.orderValueCaps
      : DEFAULT_PRICING_CONFIG.orderValue.caps,
    defaultMaxPercent: initial.orderValueDefaultMaxPercent,
  });
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState(initial.minimumOrderQuantity);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateTier(index: number, field: keyof Tier, value: number) {
    setTiers(current => current.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const response = await fetch('/api/admin/pricing-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, tiers, linear, orderValue, minimumOrderQuantity }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'Kunde inte spara.');
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      <Panel title="Strategi" accent="var(--adm-brand)" meta="Gäller alltid bara MTO-produkter">
        <div className="flex flex-wrap gap-3">
          <StrategyOption
            label="Trappstegsrabatt"
            hint="Rabatten hoppar upp vid bestämda antal, t.ex. 5 % från 200 st."
            active={strategy === 'progressive'}
            onClick={() => setStrategy('progressive')}
          />
          <StrategyOption
            label="Jämn kurva"
            hint="Rabatten växer stegvis med antalet, upp till ett tak."
            active={strategy === 'linear'}
            onClick={() => setStrategy('linear')}
          />
          <StrategyOption
            label="Rabatt på ordervärde"
            hint="Trappan mäts på hela orderns värde, med eget tak per produkt."
            active={strategy === 'orderValue'}
            onClick={() => setStrategy('orderValue')}
          />
        </div>
      </Panel>

      {strategy === 'progressive' && (
        <Panel
          title="Trappor"
          accent="var(--viz-s2)"
          meta={`${tiers.length} trappor`}
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setTiers(current => [...current, { minQuantity: 0, discountPercent: 0 }])}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Lägg till trappa
            </Button>
          }
        >
          <div className="grid gap-3">
            {tiers.map((tier, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                <Field
                  label="Antal från och med"
                  name={`tier-quantity-${index}`}
                  type="number"
                  min="0"
                  defaultValue={String(tier.minQuantity)}
                  onChange={event => updateTier(index, 'minQuantity', Number(event.target.value))}
                />
                <Field
                  label="Rabatt (%)"
                  name={`tier-discount-${index}`}
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={String(tier.discountPercent)}
                  onChange={event => updateTier(index, 'discountPercent', Number(event.target.value))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Ta bort trappa"
                  disabled={tiers.length <= 1}
                  onClick={() => setTiers(current => current.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {strategy === 'linear' && (
        <Panel title="Kurva" accent="var(--viz-s2)">
          <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
            <Field
              label="Startantal"
              name="linear-start"
              type="number"
              min="0"
              defaultValue={String(linear.startQuantity)}
              onChange={event => setLinear(l => ({ ...l, startQuantity: Number(event.target.value) }))}
              hint="Under det här antalet ges ingen rabatt alls."
            />
            <Field
              label="Antal per steg"
              name="linear-step"
              type="number"
              min="1"
              defaultValue={String(linear.quantityStep)}
              onChange={event => setLinear(l => ({ ...l, quantityStep: Number(event.target.value) }))}
              hint="Hur många enheter som krävs för nästa procentenhet."
            />
            <Field
              label="Rabatt per steg (%)"
              name="linear-percent"
              type="number"
              min="0"
              max="100"
              defaultValue={String(linear.percentPerStep)}
              onChange={event => setLinear(l => ({ ...l, percentPerStep: Number(event.target.value) }))}
            />
            <Field
              label="Rabatttak (%)"
              name="linear-max"
              type="number"
              min="0"
              max="100"
              defaultValue={String(linear.maxPercent)}
              onChange={event => setLinear(l => ({ ...l, maxPercent: Number(event.target.value) }))}
            />
          </div>
          <LinearCurveChart linear={linear} minimumOrderQuantity={minimumOrderQuantity} />
        </Panel>
      )}

      {strategy === 'orderValue' && (
        <OrderValuePanel
          orderValue={orderValue}
          minimumOrderQuantity={minimumOrderQuantity}
          products={modelProducts}
          onChange={setOrderValue}
        />
      )}

      <Panel title="Minsta orderantal" accent="var(--adm-info)">
        <Field
          label="Minsta antal för MTO-produkter"
          name="minimumOrderQuantity"
          type="number"
          min="1"
          defaultValue={String(minimumOrderQuantity)}
          onChange={event => setMinimumOrderQuantity(Number(event.target.value))}
          hint="Sätter också startvärdet i antalsrutan på produktsidan."
        />
      </Panel>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Sparar…' : 'Spara mängdrabatt'}
        </Button>
        {saved && <span className="text-[13px] text-ink-2">Sparat.</span>}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}

function StrategyOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex max-w-[280px] flex-col gap-1 rounded-ctl border px-4 py-3 text-left transition-colors ${
        active ? 'border-brand bg-plane' : 'border-rule bg-surface hover:bg-plane'
      }`}
    >
      <span className="text-[14px] font-medium text-ink">{label}</span>
      <span className="text-[12px] leading-[1.5] text-ink-3">{hint}</span>
    </button>
  );
}
