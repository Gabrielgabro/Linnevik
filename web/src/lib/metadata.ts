const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://linnevik.se';

/**
 * Get hreflang alternates including canonical for SEO
 * When locale is provided, includes the canonical URL (self-referential link)
 */
export function getHreflang(path: string, locale?: string) {
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    const alternates: {
        canonical?: string;
        languages: Record<string, string>;
    } = {
        languages: {
            sv: `${SITE_URL}/sv${cleanPath}`,
            en: `${SITE_URL}/en${cleanPath}`,
            'x-default': `${SITE_URL}/sv${cleanPath}`, // Default to Swedish
        },
    };

    // Add canonical if locale is provided
    if (locale) {
        alternates.canonical = `${SITE_URL}/${locale}${cleanPath}`;
    }

    return alternates;
}

export function getCanonicalUrl(locale: string, path: string) {
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${SITE_URL}/${locale}${cleanPath}`;
}

export function getPageMetadata(locale: string, path: string, title: string, description: string) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    return {
        title,
        description,
        metadataBase: new URL(SITE_URL),
        alternates: {
            canonical: getCanonicalUrl(locale, cleanPath),
            languages: {
                sv: `${SITE_URL}/sv${cleanPath}`,
                en: `${SITE_URL}/en${cleanPath}`,
                'x-default': `${SITE_URL}/sv${cleanPath}`,
            },
        },
    };
}
