import { SITE_NAME, SITE_URL } from '@/lib/site';

type ValidUrl = string;
type SchemaValue = string | number | boolean | null | SchemaObject | SchemaValue[];
type SchemaObject = {
    [key: string]: SchemaValue | undefined;
};

type Props = {
    product: {
        id?: string;
        title: string;
        description?: string;
        images: { edges: { node: { url: string } }[] };
        options?: { name: string; values: string[] }[];
        variants: {
            edges: {
                node: {
                    id?: string;
                    title?: string;
                    price: { amount: string; currencyCode: string };
                    sku?: string | null;
                    availableForSale: boolean;
                    selectedOptions?: { name: string; value: string }[];
                }
            }[]
        };
        moq?: number | null;
        packSize?: number | null;
    };
    url: ValidUrl;
    isMTO?: boolean;
};

export default function JsonLd({ product, url, isMTO }: Props) {
    const variants = product.variants.edges.map(edge => edge.node);
    const variant = variants[0];
    const image = product.images.edges[0]?.node.url;

    if (!variant) return null;

    const prices = variants
        .map(item => Number(item.price.amount))
        .filter(price => Number.isFinite(price));
    const lowPrice = prices.length ? Math.min(...prices).toFixed(2) : variant.price.amount;
    const highPrice = prices.length ? Math.max(...prices).toFixed(2) : variant.price.amount;
    const currency = variant.price.currencyCode;

    const seller = {
        '@id': `${SITE_URL}/#organization`,
    };

    const buildOffer = (item: typeof variant): SchemaObject => ({
        '@type': 'Offer',
        price: item.price.amount,
        priceCurrency: item.price.currencyCode,
        availability: item.availableForSale
            ? 'https://schema.org/InStock'
            : isMTO
                ? 'https://schema.org/PreOrder'
                : 'https://schema.org/OutOfStock',
        url,
        seller,
        businessFunction: 'https://schema.org/Sell',
        eligibleQuantity: product.moq
            ? {
                '@type': 'QuantitativeValue',
                minValue: product.moq,
                unitCode: 'C62',
            }
            : undefined,
        priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: item.price.amount,
            priceCurrency: item.price.currencyCode,
            valueAddedTaxIncluded: false,
            referenceQuantity: product.packSize
                ? {
                    '@type': 'QuantitativeValue',
                    value: product.packSize,
                    unitCode: 'C62',
                }
                : undefined,
        },
    });

    const hasVariant = variants.map((item): SchemaObject => ({
        '@type': 'Product',
        name: item.title && item.title !== 'Default Title'
            ? `${product.title} - ${item.title}`
            : product.title,
        sku: item.sku || undefined,
        image,
        brand: {
            '@type': 'Brand',
            name: SITE_NAME,
        },
        offers: buildOffer(item),
        additionalProperty: item.selectedOptions?.map(option => ({
            '@type': 'PropertyValue',
            name: option.name,
            value: option.value,
        })),
    }));

    const schema: SchemaObject = {
        '@type': variants.length > 1 ? 'ProductGroup' : 'Product',
        '@id': `${url}#product`,
        name: product.title,
        description: product.description,
        image,
        sku: variant.sku || undefined,
        brand: {
            '@type': 'Brand',
            name: SITE_NAME,
        },
        isFamilyFriendly: true,
        offers: variants.length > 1
            ? {
                '@type': 'AggregateOffer',
                lowPrice,
                highPrice,
                priceCurrency: currency,
                offerCount: variants.length,
                availability: variants.some(item => item.availableForSale)
                    ? 'https://schema.org/InStock'
                    : isMTO
                        ? 'https://schema.org/PreOrder'
                        : 'https://schema.org/OutOfStock',
                url,
                seller,
            }
            : buildOffer(variant),
        hasVariant: variants.length > 1 ? hasVariant : undefined,
        variesBy: product.options?.map(option => option.name),
        additionalProperty: [
            product.moq
                ? {
                    '@type': 'PropertyValue',
                    name: 'Minimum order quantity',
                    value: product.moq,
                    unitCode: 'C62',
                }
                : undefined,
            product.packSize
                ? {
                    '@type': 'PropertyValue',
                    name: 'Pack size',
                    value: product.packSize,
                    unitCode: 'C62',
                }
                : undefined,
            {
                '@type': 'PropertyValue',
                name: 'VAT treatment',
                value: 'Prices exclude VAT',
            },
        ].filter(Boolean) as SchemaObject[],
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', ...schema }) }}
        />
    );
}
