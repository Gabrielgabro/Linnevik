import { MetadataRoute } from 'next';
import { getStaticLocaleParams, getProductStaticParams, getCollectionStaticParams } from '@/lib/staticParams';
import { listCatalogSitemapEntries } from '@/lib/catalogDb';
import { SITE_URL } from '@/lib/site';

/**
 * Maps handle -> local updatedAt. Handles are shared across locales.
 */
async function getLastModifiedByHandle(resource: 'products' | 'collections') {
    const entries = await listCatalogSitemapEntries(resource);
    const map = new Map<string, Date>();
    for (const { handle, handle_en, updatedAt } of entries) {
        map.set(handle, new Date(updatedAt));
        if (handle_en) map.set(handle_en, new Date(updatedAt));
    }
    return map;
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
    const productUrls = productParams
        .filter(({ handle }) => handle !== 'testprodukt')
        .map(({ locale, handle }) => ({
        url: `${SITE_URL}/${locale}/products/${handle}`,
        lastModified: productDates.get(handle),
        priority: 0.9,
    }));

    // 3. Collections
    const [collectionParams, collectionDates] = await Promise.all([
        getCollectionStaticParams(),
        getLastModifiedByHandle('collections'),
    ]);
    const collectionUrls = collectionParams
        .filter(({ handle }) => handle !== 'featured')
        .map(({ locale, handle }) => ({
        url: `${SITE_URL}/${locale}/collections/${handle}`,
        lastModified: collectionDates.get(handle),
        priority: 0.9,
    }));

    return [...staticUrls, ...productUrls, ...collectionUrls];
}
