import Image from "next/image";
import { LocaleLink } from "@/components/LocaleLink";

export default function ProductCard({
    product,
}: {
    product: {
        id: string;
        handle: string;
        title: string;
        images?: { edges: { node: { url: string; altText: string | null } }[] };
        priceRange?: { minVariantPrice: { amount: string; currencyCode: string } };
    };
}) {
    const img = product.images?.edges?.[0]?.node;
    const price = product.priceRange?.minVariantPrice;

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
                    <div className="w-full h-full grid place-items-center text-gray-400">No image</div>
                )}
            </div>
            <h3 className="mt-3 font-medium">{product.title}</h3>
            {price?.amount && (
                <p className="text-sm text-gray-600">
                    från {Number(price.amount).toLocaleString("sv-SE")} {price.currencyCode}
                </p>
            )}
        </LocaleLink>
    );
}