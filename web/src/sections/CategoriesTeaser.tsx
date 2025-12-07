// web/src/components/CategoriesTeaser.tsx
import { LocaleLink } from "@/components/LocaleLink";
import Image from "next/image";
import { getAllCollections } from "@/lib/shopify";
import { toShopifyLanguage } from "@/lib/language";

import { normalizeLocale, getTranslations } from "@/lib/i18n";

export default async function CategoriesTeaser({ locale }: { locale: string }) {
    const language = normalizeLocale(locale);
    const t = getTranslations(language);
    const shopifyLang = toShopifyLanguage(language);
    // Hämta många så att sektionen kan växa
    const cols = await getAllCollections(24, shopifyLang);
    // Visa bara kollektioner som faktiskt har produkter (enkel gardering)
    const visible = cols.filter((c: any) => c.hasProducts);

    if (!visible.length) return null;

    return (
        <section>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl py-16 sm:py-24 lg:max-w-none lg:py-32">

                    <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-x-6">
                        {visible.map((c: any) => (
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
