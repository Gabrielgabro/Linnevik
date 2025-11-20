import { getCollectionByHandle } from "@/lib/shopify";
import ProductCard from "@/components/ProductCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerLanguage, toShopifyLanguage } from "@/lib/language";
import { getTranslations } from "@/lib/getTranslations";

type Props = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ after?: string }>;
};

// Generera metadata med felhantering
export async function generateMetadata({ params }: Props) {
    try {
        const { handle } = await params;
        const language = await getServerLanguage();
        const shopifyLang = toShopifyLanguage(language);
        const col = await getCollectionByHandle(handle, 1, undefined, shopifyLang);
        if (!col) {
            return { title: "Kategori ej funnen – Linnevik" };
        }
        return {
            title: `${col.title} – Linnevik`,
            description: col.description ?? undefined,
        };
    } catch (error) {
        const { handle } = await params;
        console.error(`Fel vid hämtning av metadata för kategori '${handle}':`, error);
        return {
            title: "Fel – Linnevik",
            description: "Kunde inte hämta information för denna kategori.",
        };
    }
}

export default async function CollectionPage({ params, searchParams }: Props) {
    const { handle } = await params;
    const { after } = await searchParams;
    const language = await getServerLanguage();
    const t = getTranslations(language);
    const shopifyLang = toShopifyLanguage(language);
    const first = 12;
    let col;

    try {
        col = await getCollectionByHandle(handle, first, after, shopifyLang);
    } catch (error) {
        console.error(`Fel vid hämtning av kategori '${handle}':`, error);
        // Visa ett generellt felmeddelande istället för att krascha
        return (
            <main className="max-w-6xl mx-auto px-6 py-10 text-center">
                <h1 className="text-2xl font-semibold mb-4">{t.collections.detail.errorTitle}</h1>
                <p>{t.collections.detail.errorBody}</p>
            </main>
        );
    }

    // Om kategorin inte hittas alls, rendera Next.js 404-sida
    if (!col) {
        notFound();
    }

    const products = col.products.edges.map(e => e.node);
    const pageInfo = col.products.pageInfo;

    return (
        <main className="max-w-6xl mx-auto px-6 pt-32 pb-10 space-y-6">
            <Breadcrumbs items={[{ href: "/collections", label: t.collections.detail.breadcrumbLabel }, { href: `/collections/${handle}`, label: col.title }]} />

            <header className="flex items-end justify-between gap-4 border-b border-light pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-primary">{col.title}</h1>
                    {col.description && (
                        <p className="text-secondary mt-2 max-w-2xl">{col.description}</p>
                    )}
                </div>
                {products.length > 0 && (
                    <div className="text-sm text-secondary flex-shrink-0">
                        {t.collections.detail.showing.replace('{count}', products.length.toString())}
                    </div>
                )}
            </header>

            {products.length > 0 ? (
                <section className="grid gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
                    {products.map((p) => <ProductCard key={p.id} product={p} />)}
                </section>
            ) : (
                <div className="text-center py-16">
                    <h2 className="text-xl font-medium text-primary">{t.collections.detail.emptyTitle}</h2>
                    <p className="text-secondary mt-2">{t.collections.detail.emptyBody}</p>
                </div>
            )}

            <footer className="flex items-center justify-center pt-6">
                {pageInfo.hasNextPage ? (
                    <Link
                        href={`/collections/${handle}?after=${encodeURIComponent(pageInfo.endCursor ?? "")}`}
                        className="px-4 py-2 rounded-md bg-neutral-800 text-white hover:bg-black"
                        scroll={false} // Förhindrar att sidan scrollar till toppen vid klick
                    >
                        {t.collections.detail.loadMore}
                    </Link>
                ) : (
                    products.length > 0 && (
                        <span className="text-sm text-muted">{t.collections.detail.allLoaded}</span>
                    )
                )}
            </footer>
        </main>
    );
}
