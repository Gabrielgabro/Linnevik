import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { getProductsBasic } from '@/lib/shopify';
import LiveSearch from '@/components/LiveSearch';

type Props = {
    searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
    const { q } = await searchParams;
    const query = q?.trim() || '';

    // Hämta produkter baserat på sökningen
    const products = query ? await getProductsBasic(60, query) : [];

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
                {query ? (
                    <>
                        <h1 className="text-2xl md:text-3xl font-semibold text-primary mb-8">
                            {products.length > 0 
                                ? `${products.length} resultat för "${query}"`
                                : `Inga resultat för "${query}"`
                            }
                        </h1>

                        {products.length > 0 ? (
                            <div className="grid grid-cols-2 gap-4 md:gap-8 md:grid-cols-3 lg:grid-cols-4">
                                {products.map((product) => (
                                    <Link 
                                        key={product.id} 
                                        href={`/products/${product.handle}`}
                                        className="group block"
                                    >
                                        <article>
                                            <div className="relative aspect-square bg-overlay rounded overflow-hidden">
                                                {product.featuredImage?.url ? (
                                                    <Image
                                                        src={product.featuredImage.url}
                                                        alt={product.featuredImage.altText ?? product.title}
                                                        fill
                                                        className="object-cover transition-transform group-hover:scale-105"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full grid place-items-center text-secondary text-sm">
                                                        Ingen bild
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="mt-3 font-medium text-primary line-clamp-2">
                                                {product.title}
                                            </h3>
                                            {product.productType && (
                                                <p className="text-xs text-secondary mt-1">
                                                    {product.productType}
                                                </p>
                                            )}
                                        </article>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <p className="text-secondary mb-4">
                                    Försök söka med andra sökord eller bläddra bland våra kategorier.
                                </p>
                                <Link 
                                    href="/collections"
                                    className="inline-block px-6 py-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-colors"
                                >
                                    Visa kategorier
                                </Link>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-16">
                        <h1 className="text-2xl md:text-3xl font-semibold text-primary mb-4">
                            Sök bland våra produkter
                        </h1>
                        <p className="text-secondary">
                            Skriv in vad du letar efter ovan
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
