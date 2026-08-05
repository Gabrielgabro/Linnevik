
import { Product } from 'schema-dts';
import { SITE_NAME, SITE_URL } from '@/lib/site';

type ValidUrl = string;

type Props = {
    product: {
        title: string;
        description?: string;
        images: { edges: { node: { url: string } }[] };
        variants: {
            edges: {
                node: {
                    price: { amount: string; currencyCode: string };
                    sku?: string | null;
                    availableForSale: boolean;
                }
            }[]
        };
    };
    url: ValidUrl;
};

export default function JsonLd({ product, url }: Props) {
    const variant = product.variants.edges[0]?.node;
    const price = variant?.price.amount;
    const currency = variant?.price.currencyCode;
    const image = product.images.edges[0]?.node.url;

    if (!variant) return null;

    const schema: Product = {
        '@type': 'Product',
        name: product.title,
        description: product.description,
        image: image,
        sku: variant.sku || undefined,
        brand: {
            '@type': 'Brand',
            name: SITE_NAME,
        },
        offers: {
            '@type': 'Offer',
            price: price,
            priceCurrency: currency,
            availability: variant.availableForSale
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: url,
            seller: {
                '@id': `${SITE_URL}/#organization`,
            },
        },
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', ...schema }) }}
        />
    );
}
