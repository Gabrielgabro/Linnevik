import CommerceSettings from '@/components/admin/CommerceSettings';
import { listDiscountCodes, listShippingRules } from '@/lib/commerceOperations';

export const dynamic = 'force-dynamic';
export default async function CommercePage() {
  const [discounts, shippingRules] = await Promise.all([listDiscountCodes(), listShippingRules()]);
  return (
    <>
      <header className="border-t-2 pt-5" style={{ borderColor: 'var(--viz-ink)' }}>
        <h1 className="font-heading text-4xl">Handelsregler</h1>
        <p className="mt-3 max-w-2xl text-sm" style={{ color: 'var(--viz-ink-2)' }}>
          Rabattkoder och fraktregler som prissätts och fryses i den egna ordern innan Stripe Checkout öppnas.
        </p>
      </header>
      <CommerceSettings discounts={discounts} shippingRules={shippingRules} />
    </>
  );
}
