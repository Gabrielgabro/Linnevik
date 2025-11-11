'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

type Product = {
    id: string;
    handle: string;
    title: string;
    images: { edges: { node: { url: string; altText: string | null } }[] };
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
};

export default function SamplesPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Fetch products from API route
        fetch('/api/products')
            .then(res => res.json())
            .then(data => {
                setProducts(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load products:', err);
                setLoading(false);
            });

        // Load selected products from localStorage
        const saved = localStorage.getItem('linnevik:sample-selection');
        if (saved) {
            setSelectedProducts(new Set(JSON.parse(saved)));
        }
    }, []);

    const toggleProduct = (productId: string) => {
        const newSelected = new Set(selectedProducts);
        if (newSelected.has(productId)) {
            newSelected.delete(productId);
        } else {
            newSelected.add(productId);
        }
        setSelectedProducts(newSelected);
        localStorage.setItem('linnevik:sample-selection', JSON.stringify(Array.from(newSelected)));
    };

    const handleContinue = () => {
        if (selectedProducts.size === 0) {
            alert('Välj minst en produkt att beställa prover för.');
            return;
        }
        router.push('/samples/checkout');
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-[#0B3D2E] border-r-transparent dark:border-[#379E7D]" />
                    <p className="mt-4 text-secondary">Laddar produkter...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            {/* Hero Section */}
            <section className="pt-32 pb-12 px-6 bg-gradient-to-br from-[#F9FAFB] to-white dark:from-[#1f2937] dark:to-[#111827]">
                <div className="max-w-6xl mx-auto text-center">
                    <div className="inline-block mb-4">
                        <span className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                            Kostnadsfritt
                        </span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold text-primary mb-6">
                        Beställ prover
                    </h1>
                    <p className="text-xl text-secondary max-w-2xl mx-auto leading-relaxed">
                        Upplev kvaliteten innan du bestämmer dig. Välj de produkter du vill ha prover på.
                    </p>
                </div>
            </section>

            {/* Selected Count Bar */}
            {selectedProducts.size > 0 && (
                <div className="sticky top-20 z-40 bg-[#0B3D2E] dark:bg-[#145C45] text-white shadow-lg">
                    <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                                {selectedProducts.size}
                            </div>
                            <span className="font-medium">
                                {selectedProducts.size === 1 ? 'produkt vald' : 'produkter valda'}
                            </span>
                        </div>
                        <button
                            onClick={handleContinue}
                            className="bg-white text-[#0B3D2E] px-6 py-2.5 rounded-xl font-semibold hover:bg-[#EBDCCB] transition-colors"
                        >
                            Fortsätt till formulär →
                        </button>
                    </div>
                </div>
            )}

            {/* Products Grid */}
            <section className="py-12 px-6">
                <div className="max-w-6xl mx-auto">
                    {products.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-secondary text-lg">Inga produkter hittades.</p>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {products.map((product) => {
                                const isSelected = selectedProducts.has(product.id);
                                const image = product.images.edges[0]?.node;

                                return (
                                    <button
                                        key={product.id}
                                        onClick={() => toggleProduct(product.id)}
                                        className={`group relative text-left p-6 rounded-2xl border-2 transition-all duration-200 ${
                                            isSelected
                                                ? 'border-[#0B3D2E] dark:border-[#379E7D] bg-[#D9F0E8] dark:bg-[#0B3D2E]/20 ring-4 ring-[#0B3D2E]/10 dark:ring-[#379E7D]/20'
                                                : 'border-[#E7EDF1] dark:border-[#374151] hover:border-[#4A6B82] dark:hover:border-[#4F6F8E] bg-white dark:bg-[#1f2937]'
                                        }`}
                                    >
                                        {/* Checkbox indicator */}
                                        <div className="absolute top-4 right-4 z-10">
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                isSelected
                                                    ? 'bg-[#0B3D2E] dark:bg-[#379E7D] border-[#0B3D2E] dark:border-[#379E7D]'
                                                    : 'bg-white dark:bg-[#111827] border-[#E7EDF1] dark:border-[#374151]'
                                            }`}>
                                                {isSelected && (
                                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>

                                        {/* Product Image */}
                                        <div className="relative aspect-square mb-4 rounded-xl overflow-hidden bg-[#F9FAFB] dark:bg-[#111827]">
                                            {image ? (
                                                <Image
                                                    src={image.url}
                                                    alt={image.altText ?? product.title}
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-secondary">
                                                    Ingen bild
                                                </div>
                                            )}
                                        </div>

                                        {/* Product Info */}
                                        <h3 className="text-lg font-semibold text-primary mb-1 pr-8">
                                            {product.title}
                                        </h3>
                                        <p className="text-sm text-secondary">
                                            Från {Number(product.priceRange.minVariantPrice.amount).toLocaleString('sv-SE')} {product.priceRange.minVariantPrice.currencyCode}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Bottom CTA */}
            {selectedProducts.size > 0 && (
                <section className="pb-12 px-6">
                    <div className="max-w-6xl mx-auto text-center">
                        <button
                            onClick={handleContinue}
                            className="bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
                        >
                            Fortsätt med {selectedProducts.size} {selectedProducts.size === 1 ? 'produkt' : 'produkter'} →
                        </button>
                    </div>
                </section>
            )}
        </main>
    );
}
