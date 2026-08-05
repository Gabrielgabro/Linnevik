import { getSiteUrl } from '@/lib/site';

type BreadcrumbItem = {
    href: string;
    label: string;
};

type Props = {
    locale: string;
    items: BreadcrumbItem[];
    homeLabel: string;
};

function localizedUrl(locale: string, href: string) {
    if (/^https?:\/\//.test(href)) {
        return href;
    }

    const path = href === '/' ? locale : `${locale}/${href.replace(/^\/+/, '')}`;
    return getSiteUrl(path);
}

export default function BreadcrumbJsonLd({ locale, items, homeLabel }: Props) {
    const itemListElement = [
        {
            '@type': 'ListItem',
            position: 1,
            name: homeLabel,
            item: getSiteUrl(locale),
        },
        ...items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 2,
            name: item.label,
            item: localizedUrl(locale, item.href),
        })),
    ];

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'BreadcrumbList',
                    itemListElement,
                }),
            }}
        />
    );
}
