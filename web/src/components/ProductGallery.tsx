import Image from 'next/image';

export default function ProductGallery({ images }: { images: { url: string; altText?: string | null }[] }) {
    const main = images[0];
    return (
        <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <div className="relative aspect-square bg-gray-100 rounded overflow-hidden">
                {main?.url ? (
                    <Image src={main.url} alt={main.altText ?? ''} fill className="object-cover" />
                ) : <div className="w-full h-full" />}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-1 gap-4">
                {images.slice(1, 4).map((img, i) => (
                    <div key={i} className="relative aspect-square bg-gray-100 rounded overflow-hidden">
                        <Image src={img.url} alt={img.altText ?? ''} fill className="object-cover" />
                    </div>
                ))}
            </div>
        </div>
    );
}