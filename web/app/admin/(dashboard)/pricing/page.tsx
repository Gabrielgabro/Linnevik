import PricingConfigPanel from '@/components/admin/PricingConfigPanel';
import { PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { getPricingConfigRow } from '@/lib/pricingConfigDb';
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
    minimumOrderQuantity: DEFAULT_PRICING_CONFIG.minimumOrderQuantity,
    updatedAt: new Date(),
    updatedBy: null,
  };

  return (
    <>
      <PageHeader
        kicker="Endast MTO-produkter"
        title="Prislogik"
        accent={accentFor('/admin/pricing')}
        description="Mängdrabatten som visas på produktsidan och som kassan debiterar. Gäller
          alltid bara MTO-taggade produkter — lagerförda varor påverkas aldrig härifrån."
      />
      <PricingConfigPanel initial={row} />
    </>
  );
}
