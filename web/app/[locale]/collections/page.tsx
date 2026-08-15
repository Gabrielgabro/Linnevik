import { listCollections } from "@/lib/catalogDb";
import { LocaleLink } from "@/components/LocaleLink";
import { getHreflang } from '@/lib/metadata';
import Image from "next/image";
import { getTranslations } from "@/lib/getTranslations";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);
    return {
        title: t.collections.metadata.title,
        description: t.collections.metadata.description,
        alternates: getHreflang('/collections', locale),
    };
}

export default async function CollectionsPage({ params }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    // Kategorierna kommer ur vår egen tabell, inte ur Shopify. Det är först
    // därmed som föräldern i admin betyder något för den som besöker sajten:
    // rötterna blir rubriker och barnen listas under sin förälder.
    const collections = await listCollections(locale);
    const roots = collections.filter(col => col.parentId === null);
    const childrenOf = (id: number) => collections.filter(col => col.parentId === id);

    // Om listan är tom (antingen pga fel eller för att det inte finns några
    // kategorier) visa ett informativt meddelande istället för en tom sida.
    if (collections.length === 0) {
        return (
            <main className="max-w-6xl mx-auto px-6 pt-32 pb-10 text-center">
                <h1 className="text-3xl font-semibold mb-4">{t.collections.emptyState.title}</h1>
                <p className="text-black/60">
                    {t.collections.emptyState.body}
                </p>
            </main>
        );
    }

    return (
        <main className="max-w-6xl mx-auto px-6 pt-32 pb-10 space-y-8">
            <h1 className="text-3xl font-semibold">{t.collections.title}</h1>

            <section className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {roots.map((col) => {
                    const children = childrenOf(col.id);
                    return (
                        <div key={col.id}>
                            <LocaleLink href={`/collections/${col.handle}`} className="group block">
                                <div className="aspect-square w-full bg-neutral-100 rounded-lg overflow-hidden relative">
                                    {col.image ? (
                                        <Image
                                            src={col.image.url}
                                            alt={col.image.altText ?? col.title}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-neutral-200"></div>
                                    )}
                                </div>
                                <h2 className="mt-3 text-lg font-medium group-hover:underline">{col.title}</h2>
                            </LocaleLink>
                            <p className="text-sm text-secondary">
                                {t.collections.productCount.replace('{count}', String(col.productCount))}
                            </p>
                            {children.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {children.map((child) => (
                                        <li key={child.id}>
                                            <LocaleLink
                                                href={`/collections/${child.handle}`}
                                                className="text-sm text-secondary hover:text-primary hover:underline"
                                            >
                                                {child.title}
                                            </LocaleLink>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </section>
        </main>
    );
}
