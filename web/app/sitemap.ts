import { MetadataRoute } from 'next';
import { getStaticLocaleParams, getProductStaticParams, getCollectionStaticParams } from '@/lib/staticParams';
import { getSitemapEntries } from '@/lib/shopify';
import { SITE_URL } from '@/lib/site';

/**
 * Maps handle -> Shopify updatedAt, so the URL set stays governed by the static
 * params (which already exclude, for example, collections with no products)
 * while the dates come from Shopify. Handles are shared across locales.
 */
async function getLastModifiedByHandle(resource: 'products' | 'collections') {
    const entries = await getSitemapEntries(resource);
    return new Map(entries.map(({ handle, updatedAt }) => [handle, new Date(updatedAt)]));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Pages that can attract and serve prospective customers. Transactional and
    // internal-search routes are intentionally excluded.
    const staticPages = [
        '',
        '/about',
        '/contact',
        '/samples',
        '/collections',
    ];

    const localeParams = await getStaticLocaleParams();

    // No lastmod on static pages: there is no accurate editorial date to report,
    // and an invented one is what made the previous sitemap untrustworthy.
    const staticUrls = staticPages.flatMap((page) =>
        localeParams.map(({ locale }) => ({
            url: `${SITE_URL}/${locale}${page}`,
            priority: page === '' ? 1.0 : 0.7,
        }))
    );

    // 2. Products
    const [productParams, productDates] = await Promise.all([
        getProductStaticParams(),
        getLastModifiedByHandle('products'),
    ]);
    const productUrls = productParams.map(({ locale, handle }) => ({
        url: `${SITE_URL}/${locale}/products/${handle}`,
        lastModified: productDates.get(handle),
        priority: 0.9,
    }));

    // 3. Collections
    const [collectionParams, collectionDates] = await Promise.all([
        getCollectionStaticParams(),
        getLastModifiedByHandle('collections'),
    ]);
    const collectionUrls = collectionParams.map(({ locale, handle }) => ({
        url: `${SITE_URL}/${locale}/collections/${handle}`,
        lastModified: collectionDates.get(handle),
        priority: 0.9,
    }));

    return [...staticUrls, ...productUrls, ...collectionUrls];
}
