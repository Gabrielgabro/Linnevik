/**
 * Kvittosidan efter en genomförd betalning.
 *
 * Ordern läses ur vår databas, inte ur Stripe. Statusen sätts av webhooken —
 * den här sidan bekräftar bara, den beslutar ingenting. En kund som stänger
 * fliken innan sidan laddats har ändå en betald order.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocaleLink } from '@/components/LocaleLink';
import { getOrderBySession } from '@/lib/ordersDb';
import { normalizeLocale, getTranslations } from '@/lib/i18n';

type Props = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ session_id?: string }>;
};

export const metadata: Metadata = {
    title: 'Tack för din beställning | Linnevik',
    // Kvitton ska aldrig hamna i ett sökindex.
    robots: { index: false, follow: false },
};

function formatAmount(minor: number, currency: string, locale: string) {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(minor / 100);
}

export default async function CheckoutCompletePage({ params, searchParams }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);
    const { session_id: sessionId } = await searchParams;
    if (!sessionId) notFound();

    const order = await getOrderBySession(sessionId);
    if (!order) notFound();

    const isPaid = order.status === 'paid';
    const isInvoice = order.paymentMethod === 'invoice';

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-2xl mx-auto px-6 pt-32 pb-16">
                <h1 className="text-3xl font-semibold text-primary">
                    {isPaid ? t.checkout.complete.title : isInvoice ? t.checkout.complete.invoiceTitle : t.checkout.complete.pendingTitle}
                </h1>
                <p className="mt-3 text-gray-600 dark:text-gray-300">
                    {isPaid ? t.checkout.complete.body : isInvoice ? t.checkout.complete.invoiceBody : t.checkout.complete.pendingBody}
                </p>

                <div className="mt-8 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t.checkout.complete.orderNumber}
                    </p>
                    <p className="text-lg font-semibold text-primary">#{order.id}</p>

                    <ul className="mt-6 space-y-3">
                        {order.items.map(item => (
                            <li key={item.id} className="flex justify-between gap-4 text-sm">
                                <span className="text-gray-700 dark:text-gray-200">
                                    {item.title} × {item.quantity}
                                </span>
                                <span className="text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                    {formatAmount(item.unitAmountMinor * item.quantity, order.currency, locale)}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {(isPaid || isInvoice) && (
                        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                <span>{t.checkout.complete.vat}</span>
                                <span>{formatAmount(order.taxMinor, order.currency, locale)}</span>
                            </div>
                            <div className="flex justify-between text-base font-semibold text-primary">
                                <span>{t.checkout.complete.total}</span>
                                <span>{formatAmount(order.totalMinor, order.currency, locale)}</span>
                            </div>
                        </div>
                    )}
                </div>

                <LocaleLink
                    href="/collections"
                    className="mt-8 inline-block text-sm text-accent hover:underline"
                >
                    {t.cart.summary.continueShopping}
                </LocaleLink>
            </div>
        </main>
    );
}
