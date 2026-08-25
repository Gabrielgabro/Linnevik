import { getCollectionPage } from '@/lib/catalogDb';
import { getHreflang } from '@/lib/metadata';
import { SITE_URL, getSiteUrl } from '@/lib/site';
import ProductCard from "@/components/ProductCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import BreadcrumbJsonLd from "@/components/BreadcrumbJsonLd";
import { LocaleLink } from "@/components/LocaleLink";
import { notFound, permanentRedirect } from "next/navigation";
import { resolveHandleRedirect } from "@/lib/redirectsDb";
import { getTranslations } from "@/lib/i18n";
import { normalizeLocale } from "@/lib/i18n";

// Renderas per förfrågan, av samma skäl som produktsidan: katalogen ändras i
// /admin och ska slå igenom direkt. Se kommentaren i products/[handle]/page.tsx
// om varför generateStaticParams togs bort här och inte bara lämnades verkningslös.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

type Props = {
    params: Promise<{ locale: string; handle: string }>;
    searchParams: Promise<{ page?: string }>;
};

/** Sidnummer från 1 och uppåt. Skräp i adressfältet ger första sidan. */
function pageNumber(raw: string | undefined): number {
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
}

// Beskrivningarna är HTML i databasen, men rubrikraden och metadatan vill ha
// ren text. Taggarna är våra egna, inte kundinmatade — det här är formatering,
// inte sanering.
function plainText(html: string | null): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata({ params }: Props) {
    const { locale: localeParam, handle } = await params;
    const locale = normalizeLocale(localeParam);

    const page = await getCollectionPage(handle, locale, { limit: 0 });
    if (!page) {
        return { title: "Kategori ej funnen – Linnevik" };
    }

    const { collection } = page;
    const description = plainText(collection.description) || (locale === 'sv'
        ? `Utforska ${collection.title} för hotell hos Linnevik.`
        : `Browse ${collection.title} for hotels at Linnevik.`);
    const image = collection.image?.url;

    return {
        title: `${collection.title} – Linnevik`,
        description,
        metadataBase: new URL(SITE_URL),
        alternates: getHreflang(`/collections/${handle}`, locale),
        openGraph: {
            title: `${collection.title} – Linnevik`,
            description,
            url: getSiteUrl(`${locale}/collections/${handle}`),
            siteName: 'Linnevik',
            locale: locale === 'sv' ? 'sv_SE' : 'en_US',
            type: 'website',
            images: image ? [{
                url: image,
                alt: collection.title,
            }] : [],
        },
    };
}

export default async function CollectionPage({ params, searchParams }: Props) {
    const { locale: localeParam, handle } = await params;
    const { page: pageParam } = await searchParams;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);
    const page = pageNumber(pageParam);

    // Kategorin, dess underkategorier och produkterna i hela underträdet
    // kommer nu ur våra egna tabeller. En förälder visar alltså sina barns
    // produkter i stället för att vara en tom rubrik.
    const result = await getCollectionPage(handle, locale, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
    });

    // Om kategorin inte hittas alls: kolla först om handlen bytts i /admin —
    // en omdöpt kategori ska leda vidare, inte dö. Se redirectsDb.
    if (!result) {
        const moved = await resolveHandleRedirect('collection', handle);
        if (moved) permanentRedirect(`/${locale}${moved}`);
        notFound();
    }

    const { collection, children, products, total } = result;
    const description = plainText(collection.description);
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const shown = Math.min(page * PAGE_SIZE, total);

    const breadcrumbItems = [
        { href: "/collections", label: t.collections.detail.breadcrumbLabel },
        { href: `/collections/${handle}`, label: collection.title },
    ];

    const pageHref = (target: number) =>
        target <= 1 ? `/collections/${handle}` : `/collections/${handle}?page=${target}`;

    return (
        <main className="max-w-6xl mx-auto px-6 pt-32 pb-10 space-y-6">
            <BreadcrumbJsonLd
                locale={locale}
                items={breadcrumbItems}
                homeLabel={t.breadcrumb.home}
            />
            <Breadcrumbs items={breadcrumbItems} />

            <header className="flex items-end justify-between gap-4 border-b border-light pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-primary">{collection.title}</h1>
                    {description && (
                        <p className="text-secondary mt-2 max-w-2xl">{description}</p>
                    )}
                </div>
                {total > 0 && (
                    <div className="text-sm text-secondary flex-shrink-0">
                        {t.collections.detail.showingOf
                            .replace('{count}', String(shown))
                            .replace('{total}', String(total))}
                    </div>
                )}
            </header>

            {children.length > 0 && (
                <nav aria-label={t.collections.detail.subcategories}>
                    <h2 className="text-sm font-medium text-secondary">
                        {t.collections.detail.subcategories}
                    </h2>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {children.map((child) => (
                            <li key={child.id}>
                                <LocaleLink
                                    href={`/collections/${child.handle}`}
                                    className="inline-block rounded-full border border-light px-3 py-1 text-sm text-secondary hover:text-primary"
                                >
                                    {child.title}
                                </LocaleLink>
                            </li>
                        ))}
                    </ul>
                </nav>
            )}

            {products.length > 0 ? (
                <section className="grid gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
                    {products.map((p) => (
                        <ProductCard
                            key={p.id}
                            product={p}
                            locale={locale}
                            fromLabel={t.product.from}
                            noImageLabel={t.product.noImage}
                            unavailableLabel={t.product.unavailable}
                        />
                    ))}
                </section>
            ) : (
                <div className="text-center py-16">
                    <h2 className="text-xl font-medium text-primary">{t.collections.detail.emptyTitle}</h2>
                    <p className="text-secondary mt-2">{t.collections.detail.emptyBody}</p>
                </div>
            )}

            <footer className="flex items-center justify-center gap-3 pt-6">
                {page > 1 && (
                    <LocaleLink
                        href={pageHref(page - 1)}
                        className="px-4 py-2 rounded-md border border-light hover:bg-overlay"
                        scroll={false} // Förhindrar att sidan scrollar till toppen vid klick
                    >
                        {t.collections.detail.previous}
                    </LocaleLink>
                )}
                {page < lastPage ? (
                    <LocaleLink
                        href={pageHref(page + 1)}
                        className="px-4 py-2 rounded-md bg-neutral-800 text-white hover:bg-black"
                        scroll={false}
                    >
                        {t.collections.detail.loadMore}
                    </LocaleLink>
                ) : (
                    products.length > 0 && (
                        <span className="text-sm text-muted">{t.collections.detail.allLoaded}</span>
                    )
                )}
            </footer>
        </main>
    );
}
