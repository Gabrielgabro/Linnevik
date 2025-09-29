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
        <div className="space-y-6">
            {options.map(opt => (
                <div key={opt.name}>
                    <div className="mb-2 font-medium">{opt.name}</div>
                    <div className="flex flex-wrap gap-2">
                        {opt.values.map(v => {
                            const activeVal = selected[opt.name] === v;
                            return (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setSelected(s => ({ ...s, [opt.name]: v }))}
                                    className={`px-3 py-2 rounded border text-sm ${activeVal ? 'bg-black text-white border-black' : 'border-gray-300'}`}
                                >
                                    {v}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div className="space-y-1">
                <label className="font-medium">Antal {packSize ? `(pack om ${packSize})` : ''}</label>
                <input
                    type="number"
                    min={moq || 1}
                    step={packSize || 1}
                    value={qty}
                    onChange={e => setQty(Math.max(moq || 1, Number(e.target.value)))}
                    className="border px-3 py-2 rounded w-32"
                />
                {moq && <div className="text-sm text-gray-600">Minsta beställning: {moq} st</div>}
            </div>

            <div className="text-sm text-gray-700">
                {active?.price && (
                    <>
                        Pris: {unitPrice.toLocaleString('sv-SE')} {active.price.currencyCode} <span className="text-gray-500">(exkl. moms)</span>
                        {packSize && qty !== totalUnits && (
                            <div>Justerat till {totalUnits} st (pack om {packSize}).</div>
                        )}
                    </>
                )}
            </div>

            <button
                type="button"
                disabled={!active?.availableForSale}
                onClick={addToEnquiry}
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded disabled:opacity-50"
            >
                Lägg i offertlistan
            </button>
        </div>
    );
}