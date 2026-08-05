import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/admin',
                    '/account/',
                    '/sv/account/',
                    '/en/account/',
                    '/api/',
                    '/Econa/',
                    '/sv/Econa/',
                    '/en/Econa/',
                ],
            },
            { userAgent: 'OAI-SearchBot', allow: '/' },
            { userAgent: 'ChatGPT-User', allow: '/' },
            { userAgent: 'Claude-SearchBot', allow: '/' },
            { userAgent: 'PerplexityBot', allow: '/' },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
