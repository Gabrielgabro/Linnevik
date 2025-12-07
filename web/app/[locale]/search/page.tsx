import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getHreflang } from '@/lib/metadata';
import { getProductsBasic } from '@/lib/shopify';
import LiveSearch from '@/components/LiveSearch';
import SearchPageClient from '@/components/SearchPageClient';
import { normalizeLocale } from '@/lib/i18n';
import { toShopifyLanguage } from '@/lib/languageConfig';


type Props = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Sök | Linnevik",
        alternates: getHreflang('/search'),
    };
}

export default async function SearchPage({ params, searchParams }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const { q } = await searchParams;
    const query = q?.trim() || '';
    const shopifyLang = toShopifyLanguage(locale);

    // Hämta produkter baserat på sökningen
    const products = query ? await getProductsBasic(60, query, shopifyLang) : [];

    return (
        <div className="min-h-screen pt-32 pb-16">
            <div className="max-w-6xl mx-auto px-6">
                {/* Sökfält med live search */}
                <div className="mb-12">
                    <Suspense fallback={
                        <div className="relative max-w-2xl mx-auto">
                            <input
                                type="search"
                                placeholder="Sök efter produkter..."
                                className="w-full px-6 py-4 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                                disabled
                            />
                        </div>
                    }>
                        <LiveSearch />
                    </Suspense>
                </div>

                {/* Resultat */}
                <SearchPageClient query={query} products={products} />
            </div>
        </div>
    );
}
