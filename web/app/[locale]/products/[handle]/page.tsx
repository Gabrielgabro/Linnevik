import ProductGallery from '@/components/ProductGallery';
import ProductForm from '@/components/ProductForm';
import Breadcrumbs from '@/components/Breadcrumbs';
import { Metadata } from 'next';

import { getCatalogProduct, getProductBreadcrumb } from '@/lib/catalogDb';
import { getPricingConfig } from '@/lib/pricing';
import { isClientComputable } from '@/lib/pricingRules';
import { getHreflang } from '@/lib/metadata';
import { SITE_URL, getSiteUrl } from '@/lib/site';
import { normalizeLocale, getTranslations } from '@/lib/i18n';
import JsonLd from '@/components/JsonLd';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import { notFound } from 'next/navigation';

// export const dynamic = 'force-dynamic';

import { getProductStaticParams } from '@/lib/staticParams';

export async function generateStaticParams() {
    return getProductStaticParams();
}

type Props = {
    params: Promise<{ locale: string; handle: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam, handle } = await params;
    const locale = normalizeLocale(localeParam);

    try {
        const product = await getCatalogProduct(handle, locale);

        if (!product) {
            return {
                title: 'Product not found | Linnevik',
                description: 'The requested product could not be found.',
            };
        }

        const image = product.images?.edges?.[0]?.node?.url;

        // Strip HTML from description for meta description
        const plainDescription = product.descriptionHtml
            ?.replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 155) || product.title;

        return {
            title: `${product.title} | Linnevik`,
            description: plainDescription,
            metadataBase: new URL(SITE_URL),
            alternates: getHreflang(`/products/${handle}`, locale),
            openGraph: {
                title: `${product.title} | Linnevik`,
                description: plainDescription,
                url: getSiteUrl(`${locale}/products/${handle}`),
                siteName: 'Linnevik',
                locale: locale === 'sv' ? 'sv_SE' : 'en_US',
                type: 'website',
                images: image ? [{
                    url: image,
                    alt: product.title,
                }] : [],
            },
        };
    } catch (error) {
        console.error(`Error generating metadata for product ${handle}:`, error);
        return {
            title: 'Product | Linnevik',
            description: 'View product details at Linnevik.',
        };
    }
}

export default async function ProductPage({ params }: Props) {
    const { locale: localeParam, handle } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);
    const product = await getCatalogProduct(handle, locale);
    if (!product) notFound();

    const images = product.images.edges.map(e => e.node);

    // `availableForSale` väger redan in båda villkoren kassan kräver
    // (`cartRules`): vårt eget beslut att sälja varan alls, och att den finns i
    // lager. Se getCatalogProduct.
    const variants = product.variants.edges.map(e => e.node);
    const { moq, packSize } = product;
    const hasMTOTag = product.tags.includes('MTO');
    // Kan inte säljas styckvis — bara prov och en priskalkyl, aldrig
    // "Lägg i varukorgen". Se cartDb.ts requireVariant för samma spärr i korgen.
    const hasSampleOnlyTag = product.tags.includes('SAMPLE_ONLY');

    // Samma prislogik som korgen och kassan räknar med, skickad ned så att
    // förhandsvisningen inte kan gå isär från det som debiteras. Kräver logiken
    // landad kostnad skickas den inte alls — inköpspriset hör inte hemma i
    // sidans HTML.
    const pricingConfig = await getPricingConfig();
    const clientPricingConfig = isClientComputable(pricingConfig) ? pricingConfig : null;

    // Brödsmulorna följer den primära kategorin och trädet uppåt. Fallbacket
    // mot Shopifys kategorilista är borta med katalogläsningen: en produkt utan
    // primär kategori får /products-smulan i stället.
    const categoryTrail = await getProductBreadcrumb(handle, locale);

    const breadcrumbItems = categoryTrail.length
        ? [
            { href: "/collections", label: t.breadcrumb.categories },
            ...categoryTrail.map(crumb => ({
                href: `/collections/${crumb.handle}`,
                label: crumb.title,
            })),
            { href: `/products/${handle}`, label: product.title }
        ]
        : [
            { href: "/products", label: t.breadcrumb.products },
            { href: `/products/${handle}`, label: product.title }
        ];

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-7xl mx-auto px-6 pt-32 pb-16">
                <JsonLd product={{
                    title: product.title,
                    description: product.descriptionHtml?.replace(/<[^>]*>/g, '') || undefined,
                    images: product.images,
                    options: product.options,
                    // Samma överskrivna tillgänglighet som knappen går efter.
                    // Strukturerad data får inte påstå "i lager" om något vi
                    // inte tänker sälja.
                    variants: { edges: variants.map(node => ({ node })) },
                    moq,
                    packSize,
                }} url={getSiteUrl(`${locale}/products/${handle}`)} />
                <BreadcrumbJsonLd
                    locale={locale}
                    items={breadcrumbItems}
                    homeLabel={t.breadcrumb.home}
                />
                <Breadcrumbs
                    items={breadcrumbItems}
                    homeLabel={t.breadcrumb.home}
                    ariaLabel={t.breadcrumb.ariaLabel}
                />

                {/* Product grid */}
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 mt-8">
                    {/* Gallery */}
                    <ProductGallery images={images} productTitle={product.title} />

                    {/* Product info */}
                    <div className="space-y-8">
                        {/* Title and SKU */}
                        <div className="space-y-2">
                            <h1 className="text-4xl lg:text-5xl font-bold text-primary leading-tight">{product.title}</h1>
                            {variants[0]?.sku && (
                                <p className="text-sm text-secondary">SKU: {variants[0].sku}</p>
                            )}
                        </div>

                        {/* Product Form */}
                        <ProductForm
                            options={product.options}
                            variants={variants}
                            moq={moq}
                            packSize={packSize}
                            hasMTOTag={hasMTOTag}
                            hasSampleOnlyTag={hasSampleOnlyTag}
                            productId={product.id}
                            pricingConfig={clientPricingConfig}
                        />

                        {/* Lead time */}
                        {product.leadTime && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-[#F3EDE4] dark:bg-[#1f2937] rounded-xl border border-[#EBDCCB] dark:border-[#374151]">
                                <svg className="w-5 h-5 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-primary">{t.product.leadTime}: {product.leadTime}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Product description */}
                {product.descriptionHtml && (
                    <div className="mt-16 pt-16 border-t border-[#E7EDF1] dark:border-[#374151]">
                        <h2 className="text-2xl font-bold text-primary mb-6">{t.product.informationHeading}</h2>
                        <div
                            className="prose prose-lg prose-neutral dark:prose-invert max-w-none prose-headings:text-primary prose-p:text-secondary prose-li:text-secondary prose-strong:text-primary"
                            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                        />
                    </div>
                )}
            </div>
        </main>
    );
}
