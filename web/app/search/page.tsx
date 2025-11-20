import { Suspense } from 'react';
import { getProductsBasic } from '@/lib/shopify';
import LiveSearch from '@/components/LiveSearch';
import SearchPageClient from '@/components/SearchPageClient';
import { getServerLanguage, toShopifyLanguage } from '@/lib/language';

type Props = {
    searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
    const { q } = await searchParams;
    const query = q?.trim() || '';
    const language = await getServerLanguage();
    const shopifyLang = toShopifyLanguage(language);

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
