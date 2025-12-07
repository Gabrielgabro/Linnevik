import { MetadataRoute } from 'next';
import { getStaticLocaleParams, getProductStaticParams, getCollectionStaticParams } from '@/lib/staticParams';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://linnevik.se';

    // 1. Static Pages
    // Defined manually as they don't have a "fetch all" helper other than locales
    const staticPages = [
        '', // Home
        '/about',
        '/contact',
        '/terms',
        '/cookie-policy',
        '/samples',
        '/collections', // Collections index page
        '/login',
        '/login/create-account', // Publicly accessible
        '/search',
    ];

    const localeParams = await getStaticLocaleParams();

    const staticUrls = staticPages.flatMap((page) =>
        localeParams.map(({ locale }) => ({
            url: `${baseUrl}/${locale}${page}`,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: page === '' ? 1.0 : 0.8,
        }))
    );

    // 2. Products
    const productParams = await getProductStaticParams();
    const productUrls = productParams.map(({ locale, handle }) => ({
        url: `${baseUrl}/${locale}/products/${handle}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.9,
    }));

    // 3. Collections
    const collectionParams = await getCollectionStaticParams();
    const collectionUrls = collectionParams.map(({ locale, handle }) => ({
        url: `${baseUrl}/${locale}/collections/${handle}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.9,
    }));

    return [...staticUrls, ...productUrls, ...collectionUrls];
}
