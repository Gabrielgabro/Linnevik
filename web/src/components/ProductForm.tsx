'use client';

import { useMemo, useState } from 'react';

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
                                    }: {
    options: { name: string; values: string[] }[];
    variants: Variant[];
    moq?: number | null;
    packSize?: number | null;
}) {
    const initial = useMemo(() => {
        const obj: Record<string, string> = {};
        options.forEach(o => { obj[o.name] = o.values[0]; });
        return obj;
    }, [options]);
    const [selected, setSelected] = useState<Record<string, string>>(initial);
    const [qty, setQty] = useState<number>(moq || 1);

    const active = useMemo(() => {
        return variants.find(v =>
            v.selectedOptions.every(so => selected[so.name] === so.value)
        );
    }, [variants, selected]);

    const unitPrice = active?.price?.amount ? Number(active.price.amount) : 0;
    const totalUnits = packSize ? Math.ceil(qty / packSize) * packSize : qty;

    const addToEnquiry = () => {
        const key = 'linnevik:enquiry';
        const payload = {
            variantId: active?.id,
            options: selected,
            qty: totalUnits,
            moq: moq || 1,
            packSize: packSize || 1,
            price: unitPrice,
            currency: active?.price.currencyCode,
            addedAt: Date.now(),
        };
        const curr = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([...curr, payload]));
        alert('Tillagd i offertlistan.');
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
                                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                                        activeVal
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
                    className="w-full px-4 py-3 rounded-xl border-2 border-[#E7EDF1] dark:border-[#374151] bg-transparent text-primary focus:outline-none focus:border-[#0B3D2E] dark:focus:border-[#145C45] transition-colors"
                />
                <div className="flex items-center gap-4 text-xs text-secondary">
                    {moq && <span>Minsta beställning: {moq} st</span>}
                    {packSize && qty !== totalUnits && (
                        <span>Justerat till {totalUnits} st</span>
                    )}
                </div>
            </div>

            {/* Add to enquiry button */}
            <button
                type="button"
                disabled={!active?.availableForSale}
                onClick={addToEnquiry}
                className="w-full bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
            >
                Lägg i offertlistan
            </button>
        </div>
    );
}