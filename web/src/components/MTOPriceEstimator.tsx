'use client';

import { useState, useMemo } from 'react';

type Variant = {
    id: string;
    selectedOptions: { name: string; value: string }[];
    price: { amount: string; currencyCode: string };
};

type PriceTier = {
    minQty: number;
    maxQty: number | null;
    discountPercent: number;
};

const priceTiers: PriceTier[] = [
    { minQty: 50, maxQty: 199, discountPercent: 0 },
    { minQty: 200, maxQty: 399, discountPercent: 5 },
    { minQty: 400, maxQty: 599, discountPercent: 10 },
    { minQty: 600, maxQty: 999, discountPercent: 15 },
    { minQty: 1000, maxQty: null, discountPercent: 20 },
];

export default function MTOPriceEstimator({
    options,
    variants,
}: {
    options: { name: string; values: string[] }[];
    variants: Variant[];
}) {
    const initial = useMemo(() => {
        const obj: Record<string, string> = {};
        options.forEach(o => { obj[o.name] = o.values[0]; });
        return obj;
    }, [options]);

    const [selected, setSelected] = useState<Record<string, string>>(initial);
    const [quantity, setQuantity] = useState<number>(50);

    const activeVariant = useMemo(() => {
        return variants.find(v =>
            v.selectedOptions.every(so => selected[so.name] === so.value)
        );
    }, [variants, selected]);

    const basePrice = activeVariant?.price?.amount ? Number(activeVariant.price.amount) : 0;

    const currentTier = useMemo(() => {
        return priceTiers.find(tier =>
            quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)
        );
    }, [quantity]);

    const estimatedPrice = useMemo(() => {
        if (!currentTier || basePrice === 0) return 0;
        return basePrice * (1 - currentTier.discountPercent / 100);
    }, [basePrice, currentTier]);

    const totalEstimate = estimatedPrice * quantity;

    return (
        <section className="w-full max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-primary mb-2">
                Prisuppskattning
            </h2>
            <p className="text-sm text-secondary mb-6">
                Välj variant och ange önskad volym för att få en ungefärlig prisindikation.
            </p>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1f2937] p-6 shadow-sm space-y-6">
                {/* Variant Selection */}
                {options.map(opt => (
                    <div key={opt.name} className="space-y-3">
                        <label className="block text-sm font-medium text-primary uppercase tracking-wide">
                            {opt.name}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {opt.values.map(v => {
                                const isActive = selected[opt.name] === v;
                                return (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setSelected(s => ({ ...s, [opt.name]: v }))}
                                        className={`px-4 py-2 rounded-none text-sm font-medium transition-all duration-200 ${isActive
                                                ? 'bg-[#0B3D2E] text-white border-2 border-[#0B3D2E] dark:bg-[#145C45] dark:border-[#145C45]'
                                                : 'bg-transparent text-primary border-2 border-[#E7EDF1] dark:border-[#374151] hover:border-[#0B3D2E] dark:hover:border-[#145C45]'
                                            }`}
                                    >
                                        {v}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Quantity Input */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-primary uppercase tracking-wide">
                        Förväntad volym (st)
                    </label>
                    <input
                        type="number"
                        min={50}
                        step={10}
                        value={quantity}
                        onChange={e => setQuantity(Math.max(50, Number(e.target.value)))}
                        className="w-full px-4 py-3 rounded-none border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#145C45] transition-colors"
                    />
                    <p className="text-xs text-secondary">
                        Minsta volym för MTO-beställning: 50 st
                    </p>
                </div>

                {/* Price Tiers Display */}
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
                    <h3 className="text-sm font-semibold text-primary mb-3">Volymrabatter</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {priceTiers.map((tier, idx) => {
                            const isCurrentTier = currentTier === tier;
                            const rangeText = tier.maxQty
                                ? `${tier.minQty}–${tier.maxQty} st`
                                : `> ${tier.minQty - 1} st`;

                            return (
                                <div
                                    key={idx}
                                    className={`px-3 py-2 rounded-xl border text-center transition-all ${isCurrentTier
                                            ? 'border-[#0B3D2E] bg-[#F3EDE4] dark:border-[#145C45] dark:bg-[#1f2937]'
                                            : 'border-neutral-100 bg-neutral-50 dark:border-neutral-700 dark:bg-[#111827]'
                                        }`}
                                >
                                    <div className="text-xs font-medium text-primary">{rangeText}</div>
                                    <div className="text-xs text-secondary">
                                        {tier.discountPercent > 0 ? `-${tier.discountPercent}%` : 'Baspris'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Price Estimate */}
                {estimatedPrice > 0 && (
                    <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-secondary">Uppskattat pris per enhet:</span>
                            <span className="text-xl font-semibold text-primary">
                                {estimatedPrice.toFixed(2)} SEK
                                <span className="text-xs text-secondary ml-1">exkl. moms</span>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm text-secondary">Total uppskattning ({quantity} st):</span>
                            <span className="text-2xl font-bold text-[#0B3D2E] dark:text-[#379E7D]">
                                {totalEstimate.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SEK
                                <span className="text-xs text-secondary ml-1">exkl. moms</span>
                            </span>
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
                    <p className="text-xs text-secondary">
                        <strong>Observera:</strong> Priserna är ungefärliga och baseras på serietillverkning.
                        Slutpris offereras efter volym och specifikation. Kontakta oss för exakt offert.
                    </p>
                </div>
            </div>
        </section>
    );
}
