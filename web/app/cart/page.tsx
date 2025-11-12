'use client';

import { useCart } from '@/contexts/CartContext';
import Image from 'next/image';
import Link from 'next/link';

export default function CartPage() {
    const { cart, isLoading, updateItem, removeItem } = useCart();

    if (isLoading) {
        return (
            <div className="min-h-screen pt-32 pb-16">
                <div className="max-w-4xl mx-auto px-6">
                    <p className="text-center text-secondary">Laddar varukorg...</p>
                </div>
            </div>
        );
    }

    const lines = cart?.lines?.edges || [];
    const isEmpty = lines.length === 0;

    // Beräkna pris ex moms (för B2B)
    const calculateExVAT = (amount: string) => {
        const num = parseFloat(amount);
        return (num / 1.25).toFixed(2); // Antag 25% moms
    };

    if (isEmpty) {
        return (
            <div className="min-h-screen pt-32 pb-16">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h1 className="text-3xl font-semibold text-primary mb-4">Din varukorg är tom</h1>
                    <p className="text-secondary mb-8">Börja handla för att lägga till produkter</p>
                    <Link
                        href="/products"
                        className="inline-block px-6 py-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-colors"
                    >
                        Till produkter
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-32 pb-16">
            <div className="max-w-4xl mx-auto px-6">
                <h1 className="text-3xl font-semibold text-primary mb-8">Varukorg</h1>

                <div className="space-y-6">
                    {lines.map(({ node: line }) => {
                        const product = line.merchandise.product;
                        const price = parseFloat(line.merchandise.price.amount);
                        const priceExVAT = calculateExVAT(line.merchandise.price.amount);
                        const totalExVAT = (parseFloat(priceExVAT) * line.quantity).toFixed(2);

                        return (
                            <div
                                key={line.id}
                                className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                            >
                                {/* Product Image */}
                                <Link
                                    href={`/products/${product.handle}`}
                                    className="relative w-24 h-24 flex-shrink-0 bg-overlay rounded overflow-hidden"
                                >
                                    {product.featuredImage?.url ? (
                                        <Image
                                            src={product.featuredImage.url}
                                            alt={product.featuredImage.altText ?? product.title}
                                            fill
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full grid place-items-center text-secondary text-xs">
                                            Ingen bild
                                        </div>
                                    )}
                                </Link>

                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                    <Link
                                        href={`/products/${product.handle}`}
                                        className="font-medium text-primary hover:underline"
                                    >
                                        {product.title}
                                    </Link>
                                    {line.merchandise.title !== 'Default Title' && (
                                        <p className="text-sm text-secondary mt-1">
                                            {line.merchandise.title}
                                        </p>
                                    )}
                                    <p className="text-sm text-secondary mt-2">
                                        {priceExVAT} {line.merchandise.price.currencyCode} ex. moms
                                    </p>
                                </div>

                                {/* Quantity Controls */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => updateItem(line.id, Math.max(1, line.quantity - 1))}
                                        className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                                        aria-label="Minska antal"
                                    >
                                        −
                                    </button>
                                    <span className="w-8 text-center text-primary font-medium">
                                        {line.quantity}
                                    </span>
                                    <button
                                        onClick={() => updateItem(line.id, line.quantity + 1)}
                                        className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                                        aria-label="Öka antal"
                                    >
                                        +
                                    </button>
                                </div>

                                {/* Line Total */}
                                <div className="flex flex-col items-end justify-between">
                                    <p className="font-semibold text-primary">
                                        {totalExVAT} {line.merchandise.price.currencyCode}
                                    </p>
                                    <button
                                        onClick={() => removeItem(line.id)}
                                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                        Ta bort
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Cart Summary */}
                <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="space-y-2">
                        <div className="flex justify-between text-secondary">
                            <span>Totalt ex. moms</span>
                            <span>
                                {calculateExVAT(cart?.cost?.subtotalAmount?.amount || '0')}{' '}
                                {cart?.cost?.subtotalAmount?.currencyCode || 'SEK'}
                            </span>
                        </div>
                        <div className="flex justify-between text-secondary">
                            <span>Moms (25%)</span>
                            <span>
                                {(
                                    parseFloat(cart?.cost?.subtotalAmount?.amount || '0') -
                                    parseFloat(calculateExVAT(cart?.cost?.subtotalAmount?.amount || '0'))
                                ).toFixed(2)}{' '}
                                {cart?.cost?.subtotalAmount?.currencyCode || 'SEK'}
                            </span>
                        </div>
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between text-lg font-semibold text-primary">
                                <span>Totalt inkl. moms</span>
                                <span>
                                    {parseFloat(cart?.cost?.subtotalAmount?.amount || '0').toFixed(2)}{' '}
                                    {cart?.cost?.subtotalAmount?.currencyCode || 'SEK'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <a
                        href={cart?.checkoutUrl || '#'}
                        className="mt-6 block w-full py-3 px-6 text-center rounded-full bg-accent text-white font-semibold hover:bg-accent/90 transition-colors"
                    >
                        Gå till kassan
                    </a>

                    <Link
                        href="/products"
                        className="mt-3 block text-center text-sm text-accent hover:underline"
                    >
                        Fortsätt handla
                    </Link>
                </div>
            </div>
        </div>
    );
}
