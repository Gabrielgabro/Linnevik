import PricingConfigPanel from '@/components/admin/PricingConfigPanel';
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
      <PricingConfigPanel initial={row} modelProducts={modelProducts} />
    </>
  );
}
