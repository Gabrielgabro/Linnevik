import { getCollectionByHandle } from "@/lib/shopify";
import ProductCard from "@/components/ProductCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
    params: { handle: string };
    searchParams: { after?: string };
};

// Generera metadata med felhantering
export async function generateMetadata({ params }: Props) {
    try {
        const col = await getCollectionByHandle(params.handle, 1);
        if (!col) {
            return { title: "Kategori ej funnen – Linnevik" };
        }
        return {
            title: `${col.title} – Linnevik`,
            description: col.description ?? undefined,
        };
    } catch (error) {
        console.error(`Fel vid hämtning av metadata för kategori '${params.handle}':`, error);
        return {
            title: "Fel – Linnevik",
            description: "Kunde inte hämta information för denna kategori.",
        };
    }
}

export default async function CollectionPage({ params, searchParams }: Props) {
    const first = 12;
    let col;

    try {
        col = await getCollectionByHandle(params.handle, first, searchParams.after);
    } catch (error) {
        console.error(`Fel vid hämtning av kategori '${params.handle}':`, error);
        // Visa ett generellt felmeddelande istället för att krascha
        return (
            <main className="max-w-6xl mx-auto px-6 py-10 text-center">
                <h1 className="text-2xl font-semibold mb-4">Något gick fel</h1>
                <p>Vi kunde tyvärr inte hämta produkterna just nu. Försök igen senare.</p>
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
        <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
            <Breadcrumbs items={[{ href: "/collections", label: "Kategorier" }, { href: `/collections/${params.handle}`, label: col.title }]} />

            <header className="flex items-end justify-between gap-4 border-b pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-semibold">{col.title}</h1>
                    {col.description && (
                        <p className="text-black/70 mt-2 max-w-2xl">{col.description}</p>
                    )}
                </div>
                {products.length > 0 && (
                    <div className="text-sm text-black/60 flex-shrink-0">
                        Visar {products.length} produkter
                    </div>
                )}
            </header>

            {products.length > 0 ? (
                <section className="grid gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
                    {products.map((p) => <ProductCard key={p.id} product={p} />)}
                </section>
            ) : (
                <div className="text-center py-16">
                    <h2 className="text-xl font-medium">Tomt här!</h2>
                    <p className="text-black/60 mt-2">Det finns inga produkter i denna kategori än.</p>
                </div>
            )}

            <footer className="flex items-center justify-center pt-6">
                {pageInfo.hasNextPage ? (
                    <Link 
                        href={`/collections/${params.handle}?after=${encodeURIComponent(pageInfo.endCursor ?? "")}`}
                        className="px-4 py-2 rounded-md bg-neutral-800 text-white hover:bg-black"
                        scroll={false} // Förhindrar att sidan scrollar till toppen vid klick
                    >
                        Visa fler
                    </Link>
                ) : (
                    products.length > 0 && (
                        <span className="text-sm text-black/50">Du har sett alla produkter</span>
                    )
                )}
            </footer>
        </main>
    );
}