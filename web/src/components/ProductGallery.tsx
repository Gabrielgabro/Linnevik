'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function ProductGallery({ images }: { images: { url: string; altText?: string | null }[] }) {
    const [selectedImage, setSelectedImage] = useState(0);

    if (!images || images.length === 0) return null;

    return (
        <div className="space-y-4">
            {/* Main image */}
            <div className="relative aspect-square bg-[#F9FAFB] dark:bg-[#1f2937] rounded-2xl overflow-hidden border border-[#E7EDF1] dark:border-[#374151]">
                <Image
                    src={images[selectedImage].url}
                    alt={images[selectedImage].altText ?? ''}
                    fill
                    className="object-cover transition-opacity duration-300"
                    priority
                />
            </div>

            {/* Thumbnail grid */}
            {images.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                    {images.map((img, i) => (
                        <button
                            key={i}
                            onClick={() => setSelectedImage(i)}
                            className={`relative aspect-square bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                                selectedImage === i
                                    ? 'border-[#0B3D2E] dark:border-[#379E7D] ring-2 ring-[#0B3D2E]/20 dark:ring-[#379E7D]/30'
                                    : 'border-[#E7EDF1] dark:border-[#374151] hover:border-[#4A6B82] dark:hover:border-[#4F6F8E]'
                            }`}
                        >
                            <Image
                                src={img.url}
                                alt={img.altText ?? ''}
                                fill
                                className="object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}