'use client';

import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { logout } from '../login/actions';
import type { CustomerOrder } from '@/lib/customerAccount';
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

type Props = {
    initialEmail?: string;
    initialFirstName?: string | null;
    initialLastName?: string | null;
    initialVatNumber?: string;
    orders?: CustomerOrder[];
};

export default function AccountClient({
    initialEmail,
    initialFirstName,
    initialLastName,
    initialVatNumber,
    orders = []
}: Props) {
    const router = useRouter();
    const { t, locale } = useTranslation();

    const displayName = [initialFirstName, initialLastName].filter(Boolean).join(' ') || t.account.fallbackName;
    const greeting = t.account.greeting.replace('{name}', displayName);
    const isLoggedIn = Boolean(initialEmail);

    const handleLogout = async () => {
        await logout();
        router.push(`/${locale}/login`);
        router.refresh();
    };

    const formatOrderCount = (count: number) =>
        t.account.ordersCount.replace('{count}', count.toString());

    const statusLabel = (status: string) => t.account.statuses[status as keyof typeof t.account.statuses] || status;

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16">
            <div className="mx-auto max-w-5xl px-6 space-y-8">
                {/* Header with Welcome */}
                <div className="space-y-2">
                    <h1 className="text-4xl font-bold text-primary md:text-5xl">
                        {greeting}
                    </h1>
                    <p className="text-lg text-secondary">
                        {t.account.welcome}
                    </p>
                </div>

                {/* Account Information Card */}
                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    <div className="flex items-start justify-between mb-6">
                        <h2 className="text-2xl font-semibold text-primary">{t.account.infoHeading}</h2>
                        <Button
                            onClick={handleLogout}
                            variant="secondary"
                            className="text-sm"
                        >
                            {t.account.logout}
                        </Button>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Name */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-secondary">{t.account.labels.name}</label>
                            <div className="rounded-lg border border-light bg-[#f9fafb] dark:bg-[#111827] px-4 py-3">
                                <p className="text-primary font-medium">{displayName}</p>
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-secondary">{t.account.labels.email}</label>
                            <div className="rounded-lg border border-light bg-[#f9fafb] dark:bg-[#111827] px-4 py-3">
                                <p className="text-primary font-medium">{initialEmail || t.account.noEmail}</p>
                            </div>
                        </div>

                        {/* VAT Number */}
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-secondary">{t.account.labels.vat}</label>
                            <div className="rounded-lg border border-light bg-[#f9fafb] dark:bg-[#111827] px-4 py-3">
                                <p className="text-primary font-medium">{initialVatNumber || t.account.noVat}</p>
                            </div>
                            {initialVatNumber && (
                                <p className="text-xs text-secondary mt-1">
                                    {t.account.vatNote}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Orders Section */}
                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    <div className="mb-6">
                        <h2 className="text-2xl font-semibold text-primary">{t.account.ordersHeading}</h2>
                        <p className="text-secondary mt-1">
                            {orders.length > 0 ? formatOrderCount(orders.length) : t.account.ordersEmptyHeading}
                        </p>
                    </div>

                    {isLoggedIn && orders.length > 0 ? (
                        <div className="space-y-4">
                            {orders.map((order) => {
                                const orderDate = new Date(order.processedAt).toLocaleDateString('sv-SE', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                });

                                const statusMap: Record<string, { label: string; color: string }> = {
                                    PAID: { label: statusLabel('PAID'), color: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20' },
                                    PENDING: { label: statusLabel('PENDING'), color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' },
                                    FULFILLED: { label: statusLabel('FULFILLED'), color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' },
                                    UNFULFILLED: { label: statusLabel('UNFULFILLED'), color: 'text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20' },
                                };

                                const financialStatus = statusMap[order.financialStatus] || { label: order.financialStatus, color: 'text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20' };
                                const fulfillmentStatus = statusMap[order.fulfillmentStatus] || { label: order.fulfillmentStatus, color: 'text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20' };

                                return (
                                    <div
                                        key={order.id}
                                        className="border border-light rounded-xl p-6 hover:shadow-md transition-shadow"
                                    >
                                        {/* Order Header */}
                                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4 pb-4 border-b border-light">
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-semibold text-primary">
                                                    {t.account.orderNumber.replace('{number}', order.number.toString())}
                                                </h3>
                                                <p className="text-sm text-secondary">{orderDate}</p>
                                                <div className="flex gap-2 mt-2">
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${financialStatus.color}`}>
                                                        {financialStatus.label}
                                                    </span>
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${fulfillmentStatus.color}`}>
                                                        {fulfillmentStatus.label}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-left sm:text-right">
                                                <p className="text-sm text-secondary">{t.account.totalLabel}</p>
                                                <p className="text-2xl font-bold text-primary">
                                                    {parseFloat(order.totalPrice.amount).toFixed(2)} {order.totalPrice.currencyCode}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Order Items */}
                                        {order.lineItems.edges.length > 0 && (
                                            <div className="space-y-3">
                                                {order.lineItems.edges.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-4 p-3 rounded-lg bg-[#f9fafb] dark:bg-[#111827]">
                                                        {item.node.image && (
                                                            <img
                                                                src={item.node.image.url}
                                                                alt={item.node.image.altText || item.node.title}
                                                                className="w-16 h-16 object-cover rounded-lg border border-light"
                                                            />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-primary">{item.node.title}</p>
                                                            <p className="text-sm text-secondary">
                                                                {t.account.quantityLabel.replace('{count}', item.node.quantity.toString())}
                                                            </p>
                                                        </div>
                                                        {item.node.variant?.price && (
                                                            <div className="text-right">
                                                                <p className="font-semibold text-primary whitespace-nowrap">
                                                                    {parseFloat(item.node.variant.price.amount).toFixed(2)} {item.node.variant.price.currencyCode}
                                                                </p>
                                                                <p className="text-xs text-secondary">{t.account.perUnit}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="max-w-sm mx-auto space-y-4">
                                <div className="w-20 h-20 mx-auto rounded-full bg-[#f4f4f5] dark:bg-[#27272a] flex items-center justify-center">
                                    <svg
                                        className="w-10 h-10 text-secondary"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                                        />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-primary">{t.account.ordersEmptyHeading}</h3>
                                <p className="text-sm text-secondary">
                                    {t.account.ordersEmptyBody}
                                </p>
                                <a
                                    href="/collections"
                                    className="inline-block mt-4"
                                >
                                    <Button variant="primary">
                                        {t.account.ordersCta}
                                    </Button>
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
