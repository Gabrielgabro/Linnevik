import CommerceSettings from '@/components/admin/CommerceSettings';
import { PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { listDiscountCodes, listShippingRules } from '@/lib/commerceOperations';

export const dynamic = 'force-dynamic';
export default async function CommercePage() {
  const [discounts, shippingRules] = await Promise.all([listDiscountCodes(), listShippingRules()]);
  return (
    <>
      <PageHeader
        kicker={`${discounts.length} rabattkoder · ${shippingRules.length} fraktregler`}
        title="Handelsregler"
        accent={accentFor('/admin/commerce')}
        description="Rabattkoder och fraktregler som prissätts och fryses i den egna ordern innan
          Stripe Checkout öppnas."
      />
      <CommerceSettings discounts={discounts} shippingRules={shippingRules} />
    </>
  );
}
