// web/src/components/FeaturedGrid.tsx
import Image from 'next/image';
import Link from 'next/link';
import { getFeaturedProducts } from '@/lib/shopify';

export default async function FeaturedGrid() {
    const products = await getFeaturedProducts(6);

    return (
        <section className="py-16">
            <div className="max-w-6xl mx-auto px-6">
                <div className="flex items-baseline justify-between mb-6">
                    <h2 className="text-2xl md:text-3xl font-semibold text-primary">Utvalda produkter</h2>
                    <Link href="/collections/featured" className="text-accent underline">Visa alla →</Link>
                </div>

                <div className="grid grid-cols-2 gap-4 md:gap-8 md:grid-cols-3">
                    {products.map((p) => {
                        const img = p.images?.edges?.[0]?.node;
                        const price = p.priceRange?.minVariantPrice;
                        return (
                            <Link key={p.id} href={`/products/${p.handle}`} className="group block">
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
                                            <div className="w-full h-full grid place-items-center text-secondary">No image</div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1.5">
                                        <h3 className="font-medium text-primary text-sm md:text-base line-clamp-2 md:line-clamp-none leading-snug">
                                            {p.title}
                                        </h3>
                                        {price?.amount && (
                                            <p className="text-xs md:text-sm text-secondary">
                                                från {Number(price.amount).toLocaleString('sv-SE')} {price.currencyCode}
                                            </p>
                                        )}
                                    </div>
                                </article>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}