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
                    <Link href="/products" className="text-accent underline">Visa alla →</Link>
                </div>

                <div className="grid gap-8 md:grid-cols-3">
                    {products.map((p) => {
                        const img = p.images?.edges?.[0]?.node;
                        const price = p.priceRange?.minVariantPrice;
                        return (
                            <Link key={p.id} href={`/products/${p.handle}`} className="group block">
                                <article>
                                    <div className="relative aspect-square bg-overlay rounded overflow-hidden">
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
                                    <h3 className="mt-3 font-medium text-primary">{p.title}</h3>
                                    {price?.amount && (
                                        <p className="text-sm text-secondary">
                                            från {Number(price.amount).toLocaleString('sv-SE')} {price.currencyCode}
                                        </p>
                                    )}
                                </article>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}