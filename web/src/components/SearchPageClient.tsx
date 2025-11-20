'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';

type Product = {
    id: string;
    title: string;
    handle: string;
    productType?: string | null;
    featuredImage?: { url: string; altText?: string | null } | null;
};

type Props = {
    query: string;
    products: Product[];
};

export default function SearchPageClient({ query, products }: Props) {
    const { t } = useTranslation();

    if (!query) {
        return (
            <div className="text-center py-16">
                <h1 className="text-2xl md:text-3xl font-semibold text-primary mb-4">
                    {t.search.landing.title}
                </h1>
                <p className="text-secondary">
                    {t.search.landing.subtitle}
                </p>
            </div>
        );
    }

    return (
        <>
            <h1 className="text-2xl md:text-3xl font-semibold text-primary mb-8">
                {products.length > 0
                    ? t.search.results.withResults.replace('{count}', products.length.toString()).replace('{query}', query)
                    : t.search.results.noResults.replace('{query}', query)
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
                                            {t.search.grid.noImage}
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
                        {t.search.noResultsSection.helpText}
                    </p>
                    <Link
                        href="/collections"
                        className="inline-block px-6 py-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-colors"
                    >
                        {t.search.noResultsSection.viewCategories}
                    </Link>
                </div>
            )}
        </>
    );
}
