// web/src/components/CategoriesTeaser.tsx
import { LocaleLink } from "@/components/LocaleLink";
import Image from "next/image";
import { listCollections } from "@/lib/catalogDb";

import { normalizeLocale, getTranslations } from "@/lib/i18n";

export default async function CategoriesTeaser({ locale }: { locale: string }) {
    const language = normalizeLocale(locale);
    const t = getTranslations(language);
    // Kategorierna kommer ur vår egen tabell. Bara rötterna visas här — det är
    // en teaser, inte hela trädet — och bara de som faktiskt har produkter
    // någonstans under sig.
    const cols = await listCollections(language);
    const visible = cols.filter(c => c.parentId === null && c.productCount > 0);

    if (!visible.length) return null;

    return (
        <section>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl py-16 sm:py-24 lg:max-w-none lg:py-32">

                    <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-x-6">
                        {visible.map((c) => (
                            <LocaleLink key={c.id} href={`/collections/${c.handle}`} className="group relative block">
                                <div className="relative w-full rounded-lg bg-overlay overflow-hidden aspect-square">
                                    {c.image?.url ? (
                                        <Image
                                            src={c.image.url}
                                            alt={c.image.altText ?? c.title}
                                            fill
                                            className="object-cover transition-opacity duration-300 group-hover:opacity-75"
                                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 66vw, 33vw"
                                            priority
                                        />
                                    ) : (
                                        // Fallback om kollektionen saknar bild
                                        <div className="absolute inset-0 grid place-items-center text-secondary text-sm">
                                            {t.product.noImage}
                                        </div>
                                    )}
                                </div>

                                <h3 className="mt-6 text-sm text-primary">
                                    <span className="absolute inset-0" aria-hidden="true" />
                                    {c.title}
                                </h3>
                            </LocaleLink>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
