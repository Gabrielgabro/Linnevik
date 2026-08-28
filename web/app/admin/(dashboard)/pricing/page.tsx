import PricingConfigPanel from '@/components/admin/PricingConfigPanel';
import { listPricingVersions } from '@/lib/pricingConfigDb';
import { Panel } from '@/components/admin/ui';
import { PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { getPricingConfigRow } from '@/lib/pricingConfigDb';
import { getPricingModelProducts } from '@/lib/pricingModelData';
import { DEFAULT_PRICING_CONFIG } from '@/lib/pricingRules';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const row = (await getPricingConfigRow()) ?? {
    id: 1,
    strategy: DEFAULT_PRICING_CONFIG.strategy,
    tiers: DEFAULT_PRICING_CONFIG.tiers,
    linearStartQuantity: DEFAULT_PRICING_CONFIG.linear.startQuantity,
    linearQuantityStep: DEFAULT_PRICING_CONFIG.linear.quantityStep,
    linearPercentPerStep: DEFAULT_PRICING_CONFIG.linear.percentPerStep,
    linearMaxPercent: DEFAULT_PRICING_CONFIG.linear.maxPercent,
    orderValueLadder: DEFAULT_PRICING_CONFIG.orderValue.ladder,
    orderValueCaps: DEFAULT_PRICING_CONFIG.orderValue.caps,
    orderValueDefaultMaxPercent: DEFAULT_PRICING_CONFIG.orderValue.defaultMaxPercent,
    minimumOrderQuantity: DEFAULT_PRICING_CONFIG.minimumOrderQuantity,
    updatedAt: new Date(),
    updatedBy: null,
  };

  const modelProducts = await getPricingModelProducts();
  // Reglerna skrevs förr över vid varje sparning. Arkivet gör att en order som
  // prissattes i somras går att förklara i vinter. Se 0028.
  const versions = await listPricingVersions(20).catch(() => []);
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Stockholm',
  });

  return (
    <>
      <PageHeader
        kicker="Endast MTO-produkter"
        title="Mängdrabatt"
        accent={accentFor('/admin/pricing')}
        description="Underlag för att bestämma hur rabatten ska trappas, och inställningen kassan
          sedan debiterar efter. Gäller alltid bara MTO-taggade produkter — lagerförda varor
          påverkas aldrig härifrån. Listpriserna i katalogen är ännu platshållare, så marginalerna
          i modellen är riktmärken tills priserna är satta."
      />
      <PricingConfigPanel
        initial={row}
        modelProducts={modelProducts}
        liveVersion={versions[0]?.version ?? null}
      />

      {versions.length > 0 && (
        <Panel
          title="Versioner"
          meta="Varje sparning arkiveras. Ordrar bär versionen de prissattes under."
        >
          <ul className="flex flex-col">
            {versions.map((version, index) => (
              <li
                key={version.version}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-grid py-2 text-[13px] last:border-b-0"
              >
                <span className="font-mono text-ink">{version.version}</span>
                {index === 0 && <span className="text-[12px] text-ink-3">gäller nu</span>}
                <span className="font-mono text-[11.5px] text-ink-3">
                  {stamp.format(version.createdAt)}
                </span>
                <span className="text-[12.5px] text-ink-3">{version.updatedBy ?? 'okänd'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
