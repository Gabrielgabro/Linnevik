import React from "react";

type PriceTier = {
    id: string;
    range: string;      // quantity range
    priceSek: number;   // price per pillow
};

const priceTiers: PriceTier[] = [
    { id: "t1", range: "50–200 st", priceSek: 190 },
    { id: "t2", range: "200–400 st", priceSek: 180 },
    { id: "t3", range: "400–600 st", priceSek: 170 },
    { id: "t4", range: "600–1000 st", priceSek: 160 },
    { id: "t5", range: "> 1000 st", priceSek: 150 },
];

const GooseDown90PriceTiers: React.FC = () => {
    return (
        <section className="w-full max-w-xl mx-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-1">
                90&nbsp;% gåsdun – prisindikation
            </h2>
            <p className="text-xs text-neutral-600 mb-4">
                100&nbsp;% bomull, 233&nbsp;TC duntätt tyg. Exempelpriser per kudde
                vid olika volymer.
            </p>

            <ul className="space-y-3">
                {priceTiers.map((tier) => (
                    <li
                        key={tier.id}
                        className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3"
                    >
                        <div className="text-sm font-medium">{tier.range}</div>
                        <div className="text-sm font-semibold">
                            {tier.priceSek} kr<span className="text-xs text-neutral-500"> / st exkl. moms</span>
                        </div>
                    </li>
                ))}
            </ul>

            <p className="mt-3 text-xs text-neutral-500">
                Priserna är ungefärliga och baseras på serietillverkning. Slutpris
                offereras efter volym och specifikation.
            </p>
        </section>
    );
};

export default GooseDown90PriceTiers;
