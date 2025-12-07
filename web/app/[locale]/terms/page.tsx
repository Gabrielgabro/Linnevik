import type { Metadata } from 'next';
import sv from '@/translations/sv.json' assert { type: 'json' };
import en from '@/translations/en.json' assert { type: 'json' };
import { type Language } from '@/lib/languageConfig';

import { normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';

const translations: Record<Language, typeof sv> = { sv, en };

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const language = normalizeLocale(localeParam);
    const copy = (translations[language] ?? translations.sv).terms;

    return {
        title: "Terms and Conditions | Linnevik",
        description: "Read our terms and conditions.",
        alternates: getHreflang('/terms'),
    };
}

export default async function TermsPage({ params }: Props) {
    const { locale: localeParam } = await params;
    const language = normalizeLocale(localeParam);
    const copy = (translations[language] ?? translations.sv).terms;

    const sections = [
        { title: copy.section1Title, paragraphs: [copy.section1Text1, copy.section1Text2, copy.section1Text3] },
        { title: copy.section2Title, paragraphs: [copy.section2Text1, copy.section2Text2, copy.section2Text3] },
        { title: copy.section3Title, paragraphs: [copy.section3Text1, copy.section3Text2, copy.section3Text3] },
        { title: copy.section4Title, paragraphs: [copy.section4Text1, copy.section4Text2, copy.section4Text3, copy.section4Text4] },
        { title: copy.section5Title, paragraphs: [copy.section5Text1, copy.section5Text2, copy.section5Text3] },
        { title: copy.section6Title, paragraphs: [copy.section6Text1, copy.section6Text2] },
        { title: copy.section7Title, paragraphs: [copy.section7Text1, copy.section7Text2, copy.section7Text3, copy.section7Text4] },
        { title: copy.section8Title, paragraphs: [copy.section8Text1, copy.section8Text2, copy.section8Text3, copy.section8Text4] },
        { title: copy.section9Title, paragraphs: [copy.section9Text1, copy.section9Text2, copy.section9Text3, copy.section9Text4] },
        { title: copy.section10Title, paragraphs: [copy.section10Text1, copy.section10Text2, copy.section10Text3] },
        { title: copy.section11Title, paragraphs: [copy.section11Text1, copy.section11Text2, copy.section11Text3] },
        { title: copy.section12Title, paragraphs: [copy.section12Text1, copy.section12Text2, copy.section12Text3] },
        { title: copy.section13Title, paragraphs: [copy.section13Text1, copy.section13Text2, copy.section13Text3] },
        { title: copy.section14Title, paragraphs: [copy.section14Text1, copy.section14Text2] },
    ];

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-4xl mx-auto px-6 pt-32 pb-16">
                <div className="mb-12 space-y-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#0B3D2E] dark:text-[#6EE7B7]">
                        {copy.pageTitle}
                    </p>
                    <h1 className="text-4xl md:text-5xl font-bold text-primary">
                        {copy.introTitle}
                    </h1>
                    <p className="text-lg text-secondary">
                        {copy.introSubtitle}
                    </p>
                    <p className="text-sm text-secondary">
                        {copy.lastUpdated}
                    </p>
                </div>

                <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                    <div className="space-y-10">
                        {sections.map((section) => (
                            <section key={section.title}>
                                <h2 className="text-2xl font-bold text-primary mb-4">{section.title}</h2>
                                <div className="space-y-3 text-secondary leading-relaxed">
                                    {section.paragraphs.map((paragraph, index) => (
                                        <p key={`${section.title}-${index}`}>{paragraph}</p>
                                    ))}
                                </div>
                            </section>
                        ))}

                        <section className="border-t border-[#E7EDF1] dark:border-[#374151] pt-8">
                            <h2 className="text-2xl font-bold text-primary mb-4">{copy.section15Title}</h2>
                            <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                <p className="text-secondary mb-2 font-semibold">
                                    {copy.companyName}
                                </p>
                                <div className="text-secondary text-sm space-y-1">
                                    <span className="block">{copy.section15Text2}</span>
                                    <span className="block">{copy.section15Text3}</span>
                                    <span className="block">{copy.section15Text4}</span>
                                    <a
                                        href={`mailto:${copy.companyEmail}`}
                                        className="block text-[#0B3D2E] dark:text-[#6EE7B7] font-semibold hover:underline"
                                    >
                                        {copy.section15Text5}
                                    </a>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
