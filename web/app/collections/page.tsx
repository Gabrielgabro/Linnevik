import { getAllCollections } from "@/lib/shopify";
import Link from "next/link";
import Image from "next/image";
import { getServerLanguage, toShopifyLanguage } from "@/lib/language";
import { getTranslations } from "@/lib/getTranslations";

export async function generateMetadata() {
    const language = await getServerLanguage();
    const t = getTranslations(language);
    return {
        title: t.collections.metadata.title,
        description: t.collections.metadata.description,
    };
}

export default async function CollectionsPage() {
    const language = await getServerLanguage();
    const t = getTranslations(language);
    const shopifyLang = toShopifyLanguage(language);
    const collections = await getAllCollections(30, shopifyLang);

    // Om listan är tom (antingen pga API-fel eller för att det inte finns några kategorier)
    // visa ett informativt meddelande istället för en tom sida.
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
                {collections.map((col) => (
                    <Link key={col.id} href={`/collections/${col.handle}`} className="group block">
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
                    </Link>
                ))}
            </section>
        </main>
    );
}
