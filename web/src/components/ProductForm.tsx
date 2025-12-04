'use client';

import { useMemo, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';
import { calculateMTOPrice, MIN_ORDER_QUANTITY } from '@/lib/mtoPrice';

type Variant = {
    id: string;
    availableForSale: boolean;
    price: { amount: string; currencyCode: string };
    selectedOptions: { name: string; value: string }[];
    sku?: string | null;
};

export default function ProductForm({
    options,
    variants,
    moq,
    packSize,
    hasMTOTag = false,
    productId,
}: {
    options: { name: string; values: string[] }[];
    variants: Variant[];
    moq?: number | null;
    packSize?: number | null;
    hasMTOTag?: boolean;
    productId?: string;
}) {
    const { addItem, isLoading } = useCart();
    const { t } = useTranslation();
    const initial = useMemo(() => {
        const obj: Record<string, string> = {};
        options.forEach(o => { obj[o.name] = o.values[0]; });
        return obj;
    }, [options]);
    const [selected, setSelected] = useState<Record<string, string>>(initial);
    // For MTO products, start quantity at minimum order quantity
    const minQty = hasMTOTag ? MIN_ORDER_QUANTITY : (moq || 1);
    const [qtyInput, setQtyInput] = useState<string>(String(minQty));
    const qty = Number(qtyInput) || 0;
    const [addingToCart, setAddingToCart] = useState(false);

    const active = useMemo(() => {
        return variants.find(v =>
            v.selectedOptions.every(so => selected[so.name] === so.value)
        );
    }, [variants, selected]);

    const unitPrice = active?.price?.amount ? Number(active.price.amount) : 0;
    const totalUnits = packSize ? Math.ceil(qty / packSize) * packSize : qty;

    // MTO price calculation using imported function
    const mtoPrice = useMemo(() => {
        if (!hasMTOTag || unitPrice === 0) return null;
        return calculateMTOPrice(qty, unitPrice);
    }, [qty, unitPrice, hasMTOTag]);

    const effectiveQty = mtoPrice?.quantity || Math.max(qty, minQty);
    const currentTier = mtoPrice?.tier || null;
    const mtoUnitPrice = mtoPrice?.unitPrice || unitPrice;

    const handleAddToCart = async () => {
        if (!active?.id) return;

        setAddingToCart(true);
        try {
            await addItem(active.id, totalUnits);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setAddingToCart(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Price display */}
            {active?.price && (
                <div className="pb-6 border-b border-[#E7EDF1] dark:border-[#374151]">
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-3xl font-semibold text-primary">
                            {(hasMTOTag ? mtoUnitPrice : unitPrice).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {active.price.currencyCode}
                        </span>
                        <span className="text-sm text-secondary">/st (exkl. moms)</span>
                        {hasMTOTag && currentTier && currentTier.discountPercent > 0 && (
                            <span className="text-sm font-medium text-[#0B3D2E] dark:text-[#379E7D]">
                                -{currentTier.discountPercent}% volymrabatt
                            </span>
                        )}
                    </div>
                    {hasMTOTag && (
                        <p className="text-xs text-secondary mt-2">
                            Pris baserat på {effectiveQty} st. Större volymer ger lägre pris per enhet.
                        </p>
                    )}
                </div>
            )}

            {/* Options */}
            {options.map(opt => (
                <div key={opt.name} className="space-y-3">
                    <label className="block text-sm font-medium text-primary uppercase tracking-wide">{opt.name}</label>
                    <div className="flex flex-wrap gap-2">
                        {opt.values.map(v => {
                            const activeVal = selected[opt.name] === v;
                            return (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setSelected(s => ({ ...s, [opt.name]: v }))}
                                    className={`px-5 py-2.5 rounded-none text-sm font-medium transition-all duration-200 ${activeVal
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

            {/* Quantity */}
            <div className="space-y-3">
                <label className="block text-sm font-medium text-primary uppercase tracking-wide">
                    Antal {packSize ? `(pack om ${packSize})` : ''}
                </label>
                <input
                    type="number"
                    min={minQty}
                    step={packSize || (hasMTOTag ? 10 : 1)}
                    value={qtyInput}
                    onChange={e => setQtyInput(e.target.value)}
                    onBlur={() => {
                        const num = Number(qtyInput) || minQty;
                        setQtyInput(String(Math.max(minQty, num)));
                    }}
                    className="w-full px-4 py-3 rounded-none border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#145C45] transition-colors"
                />
                <div className="flex items-center gap-4 text-xs text-secondary">
                    {hasMTOTag ? (
                        <span>Minsta beställning för MTO: 50 st</span>
                    ) : (
                        moq && <span>Minsta beställning: {moq} st</span>
                    )}
                    {packSize && qty !== totalUnits && (
                        <span>Justerat till {totalUnits} st</span>
                    )}
                </div>
            </div>

            {/* Button - Sample Order for MTO products, Add to Cart for others */}
            {hasMTOTag && productId ? (
                <Link
                    href={`/samples?preselect=${encodeURIComponent(productId)}&variant=${encodeURIComponent(active?.selectedOptions.map(o => o.value).join(' / ') || '')}`}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-none font-semibold transition-all duration-200 shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    {t.product.orderSample}
                </Link>
            ) : (
                <button
                    type="button"
                    disabled={!active?.availableForSale || addingToCart || isLoading}
                    onClick={handleAddToCart}
                    className="w-full bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-none font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
                >
                    {addingToCart ? 'Lägger till...' : 'Lägg i varukorgen'}
                </button>
            )}

            {/* Total Price Summary for MTO */}
            {hasMTOTag && active?.price && effectiveQty > 0 && (
                <div className="p-5 bg-[#F3EDE4] dark:bg-[#1f2937] border border-[#EBDCCB] dark:border-[#374151]">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-primary uppercase tracking-wide">Prisuppskattning</span>
                        {currentTier && currentTier.discountPercent > 0 && (
                            <span className="text-xs font-medium px-2 py-1 bg-[#0B3D2E] text-white dark:bg-[#145C45]">
                                -{currentTier.discountPercent}% rabatt
                            </span>
                        )}
                    </div>
                    <div className="space-y-2 text-sm text-secondary">
                        <div className="flex justify-between">
                            <span>{effectiveQty} st × {mtoUnitPrice.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {active.price.currencyCode}</span>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#EBDCCB] dark:border-[#374151] flex items-baseline justify-between">
                        <span className="text-sm font-medium text-primary">Totalt</span>
                        <span className="text-2xl font-bold text-[#0B3D2E] dark:text-[#379E7D]">
                            {(mtoUnitPrice * effectiveQty).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {active.price.currencyCode}
                        </span>
                    </div>
                    <p className="text-xs text-secondary mt-2">Exkl. moms. Slutpris bekräftas vid offert.</p>
                </div>
            )}
        </div>
    );
}