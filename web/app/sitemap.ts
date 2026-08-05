import { MetadataRoute } from 'next';
import { getStaticLocaleParams, getProductStaticParams, getCollectionStaticParams } from '@/lib/staticParams';
import { SITE_URL } from '@/lib/site';

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

    const staticUrls = staticPages.flatMap((page) =>
        localeParams.map(({ locale }) => ({
            url: `${SITE_URL}/${locale}${page}`,
            priority: page === '' ? 1.0 : 0.7,
        }))
    );

    // 2. Products
    const productParams = await getProductStaticParams();
    const productUrls = productParams.map(({ locale, handle }) => ({
        url: `${SITE_URL}/${locale}/products/${handle}`,
        priority: 0.9,
    }));

    // 3. Collections
    const collectionParams = await getCollectionStaticParams();
    const collectionUrls = collectionParams.map(({ locale, handle }) => ({
        url: `${SITE_URL}/${locale}/collections/${handle}`,
        priority: 0.9,
    }));

    return [...staticUrls, ...productUrls, ...collectionUrls];
}
