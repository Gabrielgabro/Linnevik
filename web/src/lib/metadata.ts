const SITE_URL = 'https://linnevik.se';

export function getHreflang(path: string) {
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    return {
        languages: {
            sv: `${SITE_URL}/sv${cleanPath}`,
            en: `${SITE_URL}/en${cleanPath}`,
        },
    };
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
            },
        },
    };
}
