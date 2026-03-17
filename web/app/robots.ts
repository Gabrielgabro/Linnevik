import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://linnevik.se';

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/account/',
                '/sv/account/',
                '/en/account/',
                '/api/',
                '/_next/',
                '/Econa/',
                '/sv/Econa/',
                '/en/Econa/',
            ],
        },
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
