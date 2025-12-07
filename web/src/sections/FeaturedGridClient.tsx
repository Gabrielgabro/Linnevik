'use client';

import Image from 'next/image';
import { LocaleLink } from '@/components/LocaleLink';
import { useTranslation } from '@/contexts/LocaleContext';

type Product = {
    id: string;
    handle: string;
    title: string;
    images: { edges: { node: { url: string; altText: string | null } }[] };
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
};

export default function FeaturedGridClient({ products }: { products: Product[] }) {
    const { t, locale } = useTranslation();

    return (
        <section className="py-16">
            <div className="max-w-6xl mx-auto px-6">
                <div className="flex items-baseline justify-between mb-6">
                    <h2 className="text-2xl md:text-3xl font-semibold text-primary">{t.home.featuredGrid.title}</h2>
                    <LocaleLink href="/collections/featured" className="text-accent underline">{t.home.featuredGrid.viewAll} →</LocaleLink>
                </div>

                <div className="grid grid-cols-2 gap-4 md:gap-8 md:grid-cols-3">
                    {products.map((p) => {
                        const img = p.images?.edges?.[0]?.node;
                        const price = p.priceRange?.minVariantPrice;
                        return (
                            <LocaleLink key={p.id} href={`/products/${p.handle}`} className="group block">
                                <article className="flex flex-col h-full">
                                    <div className="relative aspect-square bg-overlay rounded overflow-hidden mb-3">
                                        {img?.url ? (
                                            <Image
                                                src={img.url}
                                                alt={img.altText ?? p.title}
                                                fill
                                                className="object-cover transition-transform group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full grid place-items-center text-secondary">{t.home.featuredGrid.noImage}</div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1.5">
                                        <h3 className="font-medium text-primary text-sm md:text-base line-clamp-2 md:line-clamp-none leading-snug">
                                            {p.title}
                                        </h3>
                                        {price?.amount && (
                                            <p className="text-xs md:text-sm text-secondary">
                                                {t.home.featuredGrid.from} {Number(price.amount).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')} {price.currencyCode}
                                            </p>
                                        )}
                                    </div>
                                </article>
                            </LocaleLink>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
