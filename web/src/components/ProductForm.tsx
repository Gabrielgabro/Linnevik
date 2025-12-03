'use client';

import { useMemo, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import Link from 'next/link';

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
    const initial = useMemo(() => {
        const obj: Record<string, string> = {};
        options.forEach(o => { obj[o.name] = o.values[0]; });
        return obj;
    }, [options]);
    const [selected, setSelected] = useState<Record<string, string>>(initial);
    const [qty, setQty] = useState<number>(moq || 1);
    const [addingToCart, setAddingToCart] = useState(false);

    const active = useMemo(() => {
        return variants.find(v =>
            v.selectedOptions.every(so => selected[so.name] === so.value)
        );
    }, [variants, selected]);

    const unitPrice = active?.price?.amount ? Number(active.price.amount) : 0;
    const totalUnits = packSize ? Math.ceil(qty / packSize) * packSize : qty;

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
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-semibold text-primary">
                            {unitPrice.toLocaleString('sv-SE')} {active.price.currencyCode}
                        </span>
                        <span className="text-sm text-secondary">(exkl. moms)</span>
                    </div>
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
                    min={moq || 1}
                    step={packSize || 1}
                    value={qty}
                    onChange={e => setQty(Math.max(moq || 1, Number(e.target.value)))}
                    className="w-full px-4 py-3 rounded-none border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#145C45] transition-colors"
                />
                <div className="flex items-center gap-4 text-xs text-secondary">
                    {moq && <span>Minsta beställning: {moq} st</span>}
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
                    Beställ prov
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
        </div>
    );
}