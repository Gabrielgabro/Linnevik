import Image from "next/image";
import { LocaleLink } from "@/components/LocaleLink";

type ProductCardProps = {
    product: {
        id: string;
        handle: string;
        title: string;
        images?: { edges: { node: { url: string; altText: string | null } }[] };
        priceRange?: { minVariantPrice: { amount: string; currencyCode: string } };
    };
    fromLabel?: string;
    noImageLabel?: string;
    locale?: string;
};

export default function ProductCard({
    product,
    fromLabel = "from",
    noImageLabel = "No image",
    locale = "en",
}: ProductCardProps) {
    const img = product.images?.edges?.[0]?.node;
    const price = product.priceRange?.minVariantPrice;
    const numberLocale = locale === 'sv' ? 'sv-SE' : 'en-US';

    return (
        <LocaleLink href={`/products/${product.handle}`} className="group block">
            <div className="relative aspect-square bg-gray-100 rounded overflow-hidden">
                {img?.url ? (
                    <Image
                        src={img.url}
                        alt={img.altText ?? product.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full grid place-items-center text-gray-400">{noImageLabel}</div>
                )}
            </div>
            <h3 className="mt-3 font-medium">{product.title}</h3>
            {price?.amount && (
                <p className="text-sm text-gray-600">
                    {fromLabel} {Number(price.amount).toLocaleString(numberLocale)} {price.currencyCode}
                </p>
            )}
        </LocaleLink>
    );
}