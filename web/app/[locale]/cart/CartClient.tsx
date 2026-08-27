'use client';

import { useCart } from '@/contexts/CartContext';
import Image from 'next/image';
import { LocaleLink } from '@/components/LocaleLink';
import CheckoutButton from '@/components/CheckoutButton';
import InvoiceCheckoutButton from '@/components/InvoiceCheckoutButton';
import { useTranslation } from '@/contexts/LocaleContext';
import { useState } from 'react';
import { quantityControls } from '@/lib/cartQuantity';

export type InvoicePrefill = {
    companyName: string;
    line1: string;
    line2: string;
    city: string;
    postalCode: string;
};

export default function CartClient({
    invoiceEligible = false,
    invoicePrefill,
}: {
    invoiceEligible?: boolean;
    invoicePrefill?: InvoicePrefill;
}) {
    const { t } = useTranslation();
    const { cart, isLoading, pendingLineIds, error, clearError, updateItem, removeItem } = useCart();
    const [discountCode, setDiscountCode] = useState('');

    // Only block the whole page on the very first load. Quantity/remove changes
    // update the cart in place without unmounting the list.
    if (isLoading && !cart) {
        return (
            <div className="min-h-screen pt-32 pb-16">
                <div className="max-w-4xl mx-auto px-6">
                    <p className="text-center text-secondary">{t.cart.loading}</p>
                </div>
            </div>
        );
    }

    const lines = cart?.lines?.edges || [];
    const isEmpty = lines.length === 0;

    if (isEmpty) {
        return (
            <div className="min-h-screen pt-32 pb-16">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h1 className="text-3xl font-semibold text-primary mb-4">{t.cart.empty.title}</h1>
                    <p className="text-secondary mb-8">{t.cart.empty.body}</p>
                    <LocaleLink
                        href="/products"
                        className="inline-block px-6 py-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-colors"
                    >
                        {t.cart.empty.cta}
                    </LocaleLink>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-32 pb-16">
            <div className="max-w-4xl mx-auto px-6">
                <h1 className="text-3xl font-semibold text-primary mb-8">{t.cart.title}</h1>

                {error && (
                    <div
                        role="alert"
                        className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                    >
                        <span>{error}</span>
                        <button
                            type="button"
                            onClick={clearError}
                            aria-label={t.cart.item.dismissError}
                            className="shrink-0 font-medium hover:underline"
                        >
                            ✕
                        </button>
                    </div>
                )}

                <div className="space-y-6">
                    {lines.map(({ node: line }) => {
                        const product = line.merchandise.product;
                        const price = parseFloat(line.merchandise.price.amount);
                        const currency = line.merchandise.price.currencyCode;
                        const lineTotal = (price * line.quantity).toFixed(2);
                        const linePending = pendingLineIds.includes(line.id);
                        // Antalet måste följa samma trappa som servern validerar
                        // mot, annars nekas varje klick.
                        const { next, canDecrease, canIncrease, floor, step, ceiling } =
                            quantityControls(line);

                        return (
                            <div
                                key={line.id}
                                aria-busy={linePending}
                                className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                            >
                                {/* Product Image */}
                                <LocaleLink
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
                                            {t.cart.item.noImage}
                                        </div>
                                    )}
                                </LocaleLink>

                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                    <LocaleLink
                                        href={`/products/${product.handle}`}
                                        className="font-medium text-primary hover:underline"
                                    >
                                        {product.title}
                                    </LocaleLink>
                                    {line.merchandise.title !== 'Default Title' && (
                                        <p className="text-sm text-secondary mt-1">
                                            {line.merchandise.title}
                                        </p>
                                    )}
                                    <p className="text-sm text-secondary mt-2">
                                        {price.toFixed(2)} {currency} {t.cart.item.priceExVatSuffix}
                                    </p>
                                    {/* Förklarar varför +/− stannar där de gör. */}
                                    {(floor > 1 || step > 1) && (
                                        <p className="text-xs text-secondary mt-1">
                                            {floor > 1 && t.cart.item.minQuantity.replace('{quantity}', String(floor))}
                                            {floor > 1 && step > 1 && ' · '}
                                            {step > 1 && t.cart.item.stepQuantity.replace('{step}', String(step))}
                                        </p>
                                    )}
                                    {ceiling !== null && !canIncrease && (
                                        <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                                            {t.cart.item.maxStock.replace('{quantity}', String(ceiling))}
                                        </p>
                                    )}
                                </div>

                                {/* Quantity Controls */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => updateItem(line.id, next.down)}
                                        disabled={linePending || !canDecrease}
                                        className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40"
                                        aria-label={t.cart.item.decreaseQuantityAria}
                                    >
                                        −
                                    </button>
                                    <span className="w-8 text-center text-primary font-medium">
                                        {line.quantity}
                                    </span>
                                    <button
                                        onClick={() => updateItem(line.id, next.up)}
                                        disabled={linePending || !canIncrease}
                                        className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40"
                                        aria-label={t.cart.item.increaseQuantityAria}
                                    >
                                        +
                                    </button>
                                </div>

                                {/* Line Total */}
                                <div className="flex flex-col items-end justify-between">
                                    <p className="font-semibold text-primary">
                                        {lineTotal} {currency}
                                    </p>
                                    <button
                                        onClick={() => removeItem(line.id)}
                                        disabled={linePending}
                                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
                                    >
                                        {t.cart.item.remove}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Cart Summary */}
                <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    {(() => {
                        const subtotalAmount = parseFloat(cart?.cost?.subtotalAmount?.amount || '0');
                        const totalAmount = parseFloat(cart?.cost?.totalAmount?.amount || '0');
                        const currencyCode = cart?.cost?.totalAmount?.currencyCode || cart?.cost?.subtotalAmount?.currencyCode || 'SEK';
                        const vatAmount = Math.max(totalAmount - subtotalAmount, 0);
                        return (
                            <div className="space-y-2">
                                <div className="flex justify-between text-secondary">
                                    <span>{t.cart.summary.subtotalExVat}</span>
                                    <span>
                                        {subtotalAmount.toFixed(2)} {currencyCode}
                                    </span>
                                </div>
                                <div className="flex justify-between text-secondary">
                                    <span>{t.cart.summary.vatLabel}</span>
                                    <span>
                                        {vatAmount.toFixed(2)} {currencyCode}
                                    </span>
                                </div>
                                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between text-lg font-semibold text-primary">
                                        <span>{t.cart.summary.totalInclVat}</span>
                                        <span>
                                            {totalAmount.toFixed(2)} {currencyCode}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <label className="mt-5 block text-sm text-secondary">
                        Rabattkod
                        <input
                            value={discountCode}
                            onChange={event => setDiscountCode(event.target.value)}
                            autoComplete="off"
                            maxLength={80}
                            className="mt-2 w-full rounded border border-gray-300 bg-transparent px-3 py-2 uppercase dark:border-gray-600"
                        />
                    </label>

                    <CheckoutButton
                        cartId={cart?.id}
                        label={t.cart.summary.checkout}
                        pendingLabel={t.cart.summary.checkoutPending}
                        errorLabel={t.cart.summary.checkoutError}
                        discountCode={discountCode}
                        disabled={isLoading || pendingLineIds.length > 0}
                        errorMessages={t.cart.summary.checkoutErrors}
                    />

                    <InvoiceCheckoutButton
                        cartId={cart?.id}
                        discountCode={discountCode}
                        eligible={invoiceEligible}
                        disabled={isLoading || pendingLineIds.length > 0}
                        errorMessages={t.cart.summary.checkoutErrors}
                        initialProfile={invoicePrefill}
                        label={t.cart.summary.invoiceSubmit}
                        description={t.cart.summary.invoiceDescription}
                        openLabel={t.cart.summary.invoiceOpen}
                        pendingLabel={t.cart.summary.invoicePending}
                        errorLabel={t.cart.summary.invoiceError}
                        signInLabel={t.cart.summary.invoiceSignIn}
                        companyLabel={t.cart.summary.invoiceCompany}
                        addressLabel={t.cart.summary.invoiceAddress}
                        addressLine2Label={t.cart.summary.invoiceAddressLine2}
                        postalCodeLabel={t.cart.summary.invoicePostalCode}
                        cityLabel={t.cart.summary.invoiceCity}
                    />

                    <LocaleLink
                        href="/collections"
                        className="mt-3 block text-center text-sm text-accent hover:underline"
                    >
                        {t.cart.summary.continueShopping}
                    </LocaleLink>
                </div>
            </div>
        </div>
    );
}
