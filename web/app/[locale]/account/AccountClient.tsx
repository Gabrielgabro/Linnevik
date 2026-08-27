'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { logout } from '../login/actions';
import { saveCompanyDetails, type CompanyFields, type CompanyProfileState } from './actions';
import type { CustomerOrder } from '@/lib/customerAccount';
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

const inputClass =
    'mt-1 w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30';

/** Serialiserad form: datum går som ISO-sträng över server/klient-gränsen. */
export type AccountSampleRequest = {
    id: number;
    status: string;
    createdAt: string;
    items: { title: string; variantLabel: string | null }[];
};

type Props = {
    initialEmail?: string;
    initialFirstName?: string | null;
    initialLastName?: string | null;
    /** Företagsuppgifterna som de ligger sparade, för att förifylla formuläret. */
    initialCompany?: CompanyFields;
    /** Sant när de sparade uppgifterna räcker för att skapa en faktura. */
    invoiceReady?: boolean;
    orders?: CustomerOrder[];
    sampleRequests?: AccountSampleRequest[];
};

const emptyCompany: CompanyFields = {
    companyName: '',
    organizationNumber: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
};

export default function AccountClient({
    initialEmail,
    initialFirstName,
    initialLastName,
    initialCompany,
    invoiceReady = false,
    orders = [],
    sampleRequests = []
}: Props) {
    const router = useRouter();
    const { t, locale } = useTranslation();
    const [companyState, saveCompany, isSavingCompany] = useActionState<CompanyProfileState, FormData>(
        saveCompanyDetails,
        { status: 'idle', fields: initialCompany ?? emptyCompany, invoiceReady }
    );
    // Efter en sparning gäller serverns svar; dessförinnan det som lästes in
    // på sidan. Fälten ekas normaliserade tillbaka, så postnumret hoppar till
    // "123 45" när det sparats — samma form som fakturan visar.
    const company = companyState.fields ?? initialCompany ?? emptyCompany;
    const companyReady = companyState.invoiceReady ?? invoiceReady;
    // Vid fel behåller formuläret det kunden skrev; efter en lyckad sparning
    // monteras det om så att de normaliserade värdena syns.
    const companyFormKey = companyState.status === 'success' ? JSON.stringify(company) : 'editing';

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
                    </div>
                </div>

                {/* Företagsuppgifter — det fakturan ställs ut på. Redigerbara här
                    därför att det här är enda stället kunden kan komplettera ett
                    konto som kassan avvisar för ofullständiga uppgifter. */}
                {isLoggedIn && (
                    <form
                        key={companyFormKey}
                        action={saveCompany}
                        className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm space-y-6"
                    >
                        <div>
                            <h2 className="text-2xl font-semibold text-primary">{t.account.company.heading}</h2>
                            <p className="text-secondary mt-1">{t.account.company.description}</p>
                            <p className={`mt-2 text-sm ${companyReady ? 'text-secondary' : 'text-amber-700 dark:text-amber-400'}`}>
                                {companyReady ? t.account.company.ready : t.account.company.incomplete}
                            </p>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <label className="block text-sm font-medium text-secondary md:col-span-2">
                                {t.account.company.labels.companyName}
                                <input
                                    name="companyName"
                                    autoComplete="organization"
                                    maxLength={120}
                                    required
                                    defaultValue={company.companyName}
                                    className={inputClass}
                                />
                            </label>

                            <label className="block text-sm font-medium text-secondary md:col-span-2">
                                {t.account.company.labels.organizationNumber}
                                <input
                                    name="organizationNumber"
                                    autoComplete="off"
                                    maxLength={24}
                                    required
                                    defaultValue={company.organizationNumber}
                                    className={inputClass}
                                />
                            </label>

                            <label className="block text-sm font-medium text-secondary md:col-span-2">
                                {t.account.company.labels.addressLine1}
                                <input
                                    name="addressLine1"
                                    autoComplete="street-address"
                                    maxLength={120}
                                    required
                                    defaultValue={company.addressLine1}
                                    className={inputClass}
                                />
                            </label>

                            <label className="block text-sm font-medium text-secondary md:col-span-2">
                                {t.account.company.labels.addressLine2}
                                <input
                                    name="addressLine2"
                                    autoComplete="address-line2"
                                    maxLength={120}
                                    defaultValue={company.addressLine2}
                                    className={inputClass}
                                />
                            </label>

                            <label className="block text-sm font-medium text-secondary">
                                {t.account.company.labels.postalCode}
                                <input
                                    name="postalCode"
                                    inputMode="numeric"
                                    autoComplete="postal-code"
                                    maxLength={16}
                                    required
                                    defaultValue={company.postalCode}
                                    className={inputClass}
                                />
                            </label>

                            <label className="block text-sm font-medium text-secondary">
                                {t.account.company.labels.city}
                                <input
                                    name="city"
                                    autoComplete="address-level2"
                                    maxLength={120}
                                    required
                                    defaultValue={company.city}
                                    className={inputClass}
                                />
                            </label>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            <Button type="submit" variant="primary" disabled={isSavingCompany}>
                                {isSavingCompany ? t.account.company.saving : t.account.company.save}
                            </Button>
                            {companyState.message && (
                                <p
                                    role={companyState.status === 'error' ? 'alert' : undefined}
                                    className={`text-sm ${companyState.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
                                >
                                    {companyState.message}
                                </p>
                            )}
                        </div>
                    </form>
                )}

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
                                const orderDate = new Date(order.processedAt).toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'en-US', {
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
                                <LocaleLink
                                    href="/collections"
                                    className="inline-block mt-4"
                                >
                                    <Button variant="primary">
                                        {t.account.ordersCta}
                                    </Button>
                                </LocaleLink>
                            </div>
                        </div>
                    )}
                </div>

                {/* Samples Section — visas bara när kunden faktiskt bett om prover. */}
                {isLoggedIn && sampleRequests.length > 0 && (
                    <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                        <div className="mb-6">
                            <h2 className="text-2xl font-semibold text-primary">{t.account.samplesHeading}</h2>
                            <p className="text-secondary mt-1">{t.account.samplesSubheading}</p>
                        </div>

                        <div className="space-y-4">
                            {sampleRequests.map((request) => {
                                const requestDate = new Date(request.createdAt).toLocaleDateString(
                                    locale === 'sv' ? 'sv-SE' : 'en-US',
                                    { year: 'numeric', month: 'long', day: 'numeric' }
                                );
                                const status = t.account.sampleStatuses[
                                    request.status as keyof typeof t.account.sampleStatuses
                                ] || request.status;
                                const statusColor: Record<string, string> = {
                                    new: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
                                    in_progress: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
                                    sent: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
                                    declined: 'text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20',
                                };

                                return (
                                    <div key={request.id} className="border border-light rounded-xl p-6">
                                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4 pb-4 border-b border-light">
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-semibold text-primary">
                                                    {t.account.sampleNumber.replace('{number}', request.id.toString())}
                                                </h3>
                                                <p className="text-sm text-secondary">{requestDate}</p>
                                            </div>
                                            <span
                                                className={`text-xs px-2.5 py-1 rounded-full font-medium self-start ${
                                                    statusColor[request.status] ??
                                                    'text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20'
                                                }`}
                                            >
                                                {status}
                                            </span>
                                        </div>
                                        <ul className="space-y-2">
                                            {request.items.map((item, idx) => (
                                                <li
                                                    key={idx}
                                                    className="flex items-center gap-3 p-3 rounded-lg bg-[#f9fafb] dark:bg-[#111827]"
                                                >
                                                    <span className="font-medium text-primary">{item.title}</span>
                                                    {item.variantLabel && (
                                                        <span className="text-sm text-secondary">{item.variantLabel}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
