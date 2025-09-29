"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Facets = Record<string, string[]>; // { Fyllning: ["Dun","Syntet"], Storlek: ["50x60","60x80"] }

export default function FilterBar({
                                      facets,
                                      sortOptions = [
                                          { value: "relevance", label: "Relevans" },
                                          { value: "price-asc", label: "Pris: Lågt → Högt" },
                                          { value: "price-desc", label: "Pris: Högt → Lågt" },
                                      ],
                                  }: {
    facets: Facets;
    sortOptions?: { value: string; label: string }[];
}) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();

    // läs nuvarande val
    const selectedTags = search.getAll("t"); // flera ?t= går bra
    const selected = useMemo(() => new Set(selectedTags), [selectedTags]);
    const sort = search.get("sort") ?? "relevance";

    function toggleTag(tag: string) {
        const params = new URLSearchParams(search.toString());
        const current = new Set(params.getAll("t"));
        if (current.has(tag)) current.delete(tag);
        else current.add(tag);

        params.delete("t");
        for (const t of current) params.append("t", t);

        // reset pagination vid filter
        params.delete("after");
        router.push(`${pathname}?${params.toString()}`);
    }

    function onSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const params = new URLSearchParams(search.toString());
        params.set("sort", e.target.value);
        params.delete("after");
        router.push(`${pathname}?${params.toString()}`);
    }

    const groups = Object.entries(facets);

    return (
        <div className="sticky top-14 z-40 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-y border-black/5">
            <div className="mx-auto max-w-6xl px-6 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                {/* Chips */}
                <div className="flex gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {groups.length === 0 && (
                        <span className="text-sm text-black/50">Inga filter tillgängliga</span>
                    )}
                    {groups.map(([group, values]) =>
                        values.map((v) => {
                            const tag = `${group}:${v}`;
                            const active = selected.has(tag);
                            return (
                                <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition
                    ${active ? "bg-black text-white border-black" : "bg-white text-black border-black/20 hover:border-black/50"}`}
                                    aria-pressed={active}
                                >
                                    {group}: {v}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Sortering */}
                <div className="flex items-center gap-2 shrink-0">
                    <label htmlFor="sort" className="text-sm text-black/60">Sortera</label>
                    <select
                        id="sort"
                        className="text-sm border border-black/20 rounded px-2 py-1 bg-white"
                        value={sort}
                        onChange={onSortChange}
                    >
                        {sortOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}