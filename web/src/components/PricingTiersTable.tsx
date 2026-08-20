import { priceLine, type PricingConfig } from '@/lib/pricingRules';

type Row = { fromQuantity: number; toQuantity: number | null; discountPercent: number };

/**
 * Trapporna för `progressive`, eller punkter längs kurvan för `linear` —
 * `margin` visas aldrig här (isClientComputable stoppar den innan denna
 * komponent ens får konfigurationen, se produktsidan).
 */
function rowsFor(config: PricingConfig): Row[] {
  if (config.strategy === 'progressive') {
    const sorted = [...config.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
    return sorted.map((tier, index) => ({
      fromQuantity: tier.minQuantity,
      toQuantity: sorted[index + 1] ? sorted[index + 1].minQuantity - 1 : null,
      discountPercent: tier.discountPercent,
    }));
  }

  const { startQuantity, quantityStep, percentPerStep, maxPercent } = config.linear;
  const rows: Row[] = [];
  let quantity = startQuantity;
  let percent = 0;
  // Max 10 rader — en trappa med litet steg och högt tak ska inte rendera
  // hundratals punkter.
  while (percent < maxPercent && rows.length < 9) {
    rows.push({ fromQuantity: quantity, toQuantity: quantity + quantityStep - 1, discountPercent: percent });
    percent = Math.min(maxPercent, percent + percentPerStep);
    quantity += quantityStep;
  }
  rows.push({ fromQuantity: quantity, toQuantity: null, discountPercent: maxPercent });
  return rows;
}

export default function PricingTiersTable({
  config,
  listPriceMinor,
  currency,
  title,
  fromLabel,
  unitsLabel,
  unitPriceLabel,
  savingsLabel,
}: {
  config: PricingConfig;
  listPriceMinor: number;
  currency: string;
  title: string;
  fromLabel: string;
  unitsLabel: string;
  unitPriceLabel: string;
  savingsLabel: string;
}) {
  const rows = rowsFor(config);

  return (
    <div className="pb-6 border-b border-[#E7EDF1] dark:border-[#374151]">
      <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b border-[#E7EDF1] dark:border-[#374151]">
              <th className="py-2 pr-4 font-medium">{fromLabel}</th>
              <th className="py-2 pr-4 font-medium">{unitPriceLabel}</th>
              <th className="py-2 font-medium">{savingsLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const unitAmountMinor = priceLine(config, {
                listPriceMinor,
                quantity: row.fromQuantity,
                isMto: true,
              }).unitAmountMinor;
              const rangeText = row.toQuantity
                ? `${row.fromQuantity}–${row.toQuantity} ${unitsLabel}`
                : `${row.fromQuantity}+ ${unitsLabel}`;
              return (
                <tr key={index} className="border-b border-[#E7EDF1] dark:border-[#374151] last:border-0">
                  <td className="py-2.5 pr-4 text-primary">{rangeText}</td>
                  <td className="py-2.5 pr-4 font-medium text-primary">
                    {(unitAmountMinor / 100).toLocaleString('sv-SE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </td>
                  <td className="py-2.5 text-[#0B3D2E] dark:text-[#379E7D] font-medium">
                    {row.discountPercent > 0 ? `-${row.discountPercent}%` : '—'}
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
