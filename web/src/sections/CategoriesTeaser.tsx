// web/src/components/CategoriesTeaser.tsx
import Link from "next/link";
import Image from "next/image";
import { getAllCollections } from "@/lib/shopify";

export default async function CategoriesTeaser() {
    // Hämta många så att sektionen kan växa
    const cols = await getAllCollections(24);
    // Visa bara kollektioner som faktiskt har produkter (enkel gardering)
    const visible = cols.filter((c: any) => c.hasProducts);

    if (!visible.length) return null;

    return (
        <section className="bg-gray-100">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl py-16 sm:py-24 lg:max-w-none lg:py-32">

                    <div className="mt-6 space-y-12 lg:grid lg:grid-cols-3 lg:gap-x-6 lg:space-y-0">
                        {visible.map((c: any) => (
                            <Link key={c.id} href={`/collections/${c.handle}`} className="group relative block">
                                <div className="relative w-full rounded-lg bg-white overflow-hidden max-sm:h-80 sm:aspect-[2/1] lg:aspect-square">
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
                                        <div className="absolute inset-0 grid place-items-center text-gray-400 text-sm">
                                            Ingen bild
                                        </div>
                                    )}
                                </div>

                                <h3 className="mt-6 text-sm text-gray-500">
                                    <span className="absolute inset-0" aria-hidden="true" />
                                    {c.title}
                                </h3>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}