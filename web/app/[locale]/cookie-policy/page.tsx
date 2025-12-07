
import sv from '@/translations/sv.json' assert { type: 'json' };
import en from '@/translations/en.json' assert { type: 'json' };
import { type Language } from '@/lib/languageConfig';
import { CookieSettingsButton } from '@/components/CookieSettingsButton';
import { normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
import { Metadata } from 'next';
import { getStaticLocaleParams } from '@/lib/staticParams';


const translations: Record<Language, typeof sv> = { sv, en };

export async function generateStaticParams() {
    return getStaticLocaleParams();
}

export const metadata: Metadata = {
    title: "Cookie Policy | Linnevik",
    description: "Read about how we use cookies.",
    alternates: getHreflang('/cookie-policy'),
};

export default async function CookiePolicyPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: localeParam } = await params;
    const language = normalizeLocale(localeParam);
    const t = translations[language] ?? translations.sv;
    const copy = t.cookiePolicy;
    const locale = language === 'en' ? 'en-US' : 'sv-SE';
    const lastUpdated = new Date().toLocaleDateString(locale);

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-4xl mx-auto px-6 pt-32 pb-16">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                        {copy.title}
                    </h1>
                    <p className="text-lg text-secondary">
                        {copy.lastUpdatedLabel}: {lastUpdated}
                    </p>
                </div>

                {/* Content */}
                <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                    <div className="space-y-8">
                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.whatIs.title}</h2>
                            <p className="text-secondary leading-relaxed">
                                {copy.sections.whatIs.body}
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.howUse.title}</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                {copy.sections.howUse.intro}
                            </p>
                            <ul className="space-y-2 text-secondary">
                                <li><strong className="text-primary">{copy.sections.howUse.items.necessary.label}</strong> {copy.sections.howUse.items.necessary.body}</li>
                                <li><strong className="text-primary">{copy.sections.howUse.items.functional.label}</strong> {copy.sections.howUse.items.functional.body}</li>
                                <li><strong className="text-primary">{copy.sections.howUse.items.analytics.label}</strong> {copy.sections.howUse.items.analytics.body}</li>
                                <li><strong className="text-primary">{copy.sections.howUse.items.marketing.label}</strong> {copy.sections.howUse.items.marketing.body}</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.thirdParty.title}</h2>
                            <p className="text-secondary leading-relaxed">
                                {copy.sections.thirdParty.body}
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.manage.title}</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                {copy.sections.manage.bodyBeforeLink}{' '}
                                <CookieSettingsButton className="text-[#0B3D2E] dark:text-[#379E7D] hover:underline font-semibold">
                                    {copy.sections.manage.linkLabel}
                                </CookieSettingsButton>
                                {' '}{copy.sections.manage.bodyAfterLink}
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.consentStorage.title}</h2>
                            <p className="text-secondary leading-relaxed">
                                {copy.sections.consentStorage.body}
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.cookiesList.title}</h2>
                            <div className="space-y-4">
                                <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                    <h3 className="font-bold text-primary mb-2">{copy.sections.cookiesList.items.shopify.title}</h3>
                                    <p className="text-sm text-secondary mb-2">
                                        {copy.sections.cookiesList.items.shopify.body}
                                    </p>
                                    <p className="text-xs text-secondary">{copy.sections.cookiesList.items.shopify.meta}</p>
                                </div>
                                <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                    <h3 className="font-bold text-primary mb-2">{copy.sections.cookiesList.items.language.title}</h3>
                                    <p className="text-sm text-secondary mb-2">
                                        {copy.sections.cookiesList.items.language.body}
                                    </p>
                                    <p className="text-xs text-secondary">{copy.sections.cookiesList.items.language.meta}</p>
                                </div>
                                <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                    <h3 className="font-bold text-primary mb-2">{copy.sections.cookiesList.items.analytics.title}</h3>
                                    <p className="text-sm text-secondary mb-2">
                                        {copy.sections.cookiesList.items.analytics.body}
                                    </p>
                                    <p className="text-xs text-secondary">{copy.sections.cookiesList.items.analytics.meta}</p>
                                </div>
                                <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                    <h3 className="font-bold text-primary mb-2">{copy.sections.cookiesList.items.marketing.title}</h3>
                                    <p className="text-sm text-secondary mb-2">
                                        {copy.sections.cookiesList.items.marketing.body}
                                    </p>
                                    <p className="text-xs text-secondary">{copy.sections.cookiesList.items.marketing.meta}</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.sections.contact.title}</h2>
                            <p className="text-secondary leading-relaxed">
                                {copy.sections.contact.body}{' '}
                                <a href="mailto:info@linnevik.se" className="text-[#0B3D2E] dark:text-[#379E7D] hover:underline font-semibold">
                                    info@linnevik.se
                                </a>
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
