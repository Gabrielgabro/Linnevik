'use client';

import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

export default function AboutClient() {
    const { t } = useTranslation();

    return (
        <main className="min-h-screen bg-white dark:bg-black">
            {/* Hero Section */}
            <section className="relative py-32 lg:py-40 flex items-center justify-center overflow-hidden bg-[#FAF7F2] dark:bg-black border-b border-gray-200 dark:border-zinc-800">
                <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
                    <h1 className="text-5xl md:text-7xl font-serif font-medium text-[#0B3D2E] dark:text-white mb-8 tracking-tight leading-[1.1] lg:tracking-[-0.02em]">
                        {t.about.hero.heading}
                    </h1>
                    <p className="text-xl md:text-2xl text-[#5C5C5C] dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
                        {t.about.hero.subheading}
                    </p>
                </div>
            </section>

            {/* Our Story */}
            <section className="py-32 bg-white dark:bg-black">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl lg:text-5xl font-serif font-medium text-[#0B3D2E] dark:text-white leading-[1.15] tracking-tight">
                                {t.about.story.title}
                            </h2>
                            <div className="space-y-6 text-lg text-[#5C5C5C] dark:text-gray-300 leading-relaxed">
                                <p>
                                    {t.about.story.paragraph1}
                                </p>
                                <p>
                                    {t.about.story.paragraph2}
                                </p>
                                <p className="font-medium text-[#0B3D2E] dark:text-white pt-4 border-t border-gray-200 dark:border-zinc-800">
                                    {t.about.story.highlight}
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="relative aspect-[4/5] overflow-hidden bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                                {/* Placeholder for actual image */}
                                <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm tracking-wider">
                                    {t.about.story.imagePlaceholder}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-24 bg-[#FAF7F2] dark:bg-zinc-950 border-y border-gray-200 dark:border-zinc-800">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid md:grid-cols-3 gap-16">
                        <div className="text-center space-y-3">
                            <div className="text-6xl lg:text-7xl font-serif font-light text-[#0B3D2E] dark:text-white tracking-tight">
                                38+
                            </div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5C5C5C] dark:text-gray-400">
                                {t.about.stats.yearsLabel}
                            </div>
                        </div>
                        <div className="text-center space-y-3 border-x border-gray-300 dark:border-zinc-800">
                            <div className="text-6xl lg:text-7xl font-serif font-light text-[#0B3D2E] dark:text-white tracking-tight">
                                40+
                            </div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5C5C5C] dark:text-gray-400">
                                {t.about.stats.partnersLabel}
                            </div>
                        </div>
                        <div className="text-center space-y-3">
                            <div className="text-6xl lg:text-7xl font-serif font-light text-[#0B3D2E] dark:text-white tracking-tight">
                                120+
                            </div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5C5C5C] dark:text-gray-400">
                                {t.about.stats.projectsLabel}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Values Section */}
            <section className="py-32 bg-white dark:bg-black">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid md:grid-cols-3 gap-x-16 gap-y-20">
                        {/* Value 1 */}
                        <div className="space-y-5 group">
                            <div className="w-12 h-12 flex items-center justify-start mb-6">
                                <svg className="w-9 h-9 text-[#0B3D2E] dark:text-white transition-transform group-hover:scale-110 duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-serif font-medium text-[#0B3D2E] dark:text-white tracking-tight">{t.about.values.items.quality.title}</h3>
                            <p className="text-[#5C5C5C] dark:text-gray-300 leading-relaxed">
                                {t.about.values.items.quality.body}
                            </p>
                        </div>

                        {/* Value 2 */}
                        <div className="space-y-5 group">
                            <div className="w-12 h-12 flex items-center justify-start mb-6">
                                <svg className="w-9 h-9 text-[#0B3D2E] dark:text-white transition-transform group-hover:scale-110 duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-serif font-medium text-[#0B3D2E] dark:text-white tracking-tight">{t.about.values.items.partnership.title}</h3>
                            <p className="text-[#5C5C5C] dark:text-gray-300 leading-relaxed">
                                {t.about.values.items.partnership.body}
                            </p>
                        </div>

                        {/* Value 3 */}
                        <div className="space-y-5 group">
                            <div className="w-12 h-12 flex items-center justify-start mb-6">
                                <svg className="w-9 h-9 text-[#0B3D2E] dark:text-white transition-transform group-hover:scale-110 duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-serif font-medium text-[#0B3D2E] dark:text-white tracking-tight">{t.about.values.items.innovation.title}</h3>
                            <p className="text-[#5C5C5C] dark:text-gray-300 leading-relaxed">
                                {t.about.values.items.innovation.body}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 bg-[#0B3D2E] dark:bg-zinc-950 border-t border-[#0B3D2E] dark:border-zinc-800">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-4xl lg:text-5xl font-serif font-medium text-[#FAF7F2] dark:text-white mb-6 tracking-tight">
                        {t.about.cta.title}
                    </h2>
                    <p className="text-xl text-[#D9F0E8] dark:text-gray-300 mb-14 leading-relaxed max-w-2xl mx-auto">
                        {t.about.cta.body}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <LocaleLink
                            href="/contact"
                            className="inline-flex items-center justify-center px-10 py-4 bg-[#FAF7F2] dark:bg-white text-[#0B3D2E] dark:text-black font-semibold hover:bg-white dark:hover:bg-gray-100 transition-all duration-200 min-w-[180px] tracking-wide text-sm uppercase"
                        >
                            {t.about.cta.primaryButton}
                        </LocaleLink>
                        <LocaleLink
                            href="/collections"
                            className="inline-flex items-center justify-center px-10 py-4 bg-transparent text-[#FAF7F2] dark:text-white font-semibold border-2 border-[#FAF7F2] dark:border-white hover:bg-[#FAF7F2]/10 dark:hover:bg-white/10 transition-all duration-200 min-w-[180px] tracking-wide text-sm uppercase"
                        >
                            {t.about.cta.secondaryButton}
                        </LocaleLink>
                    </div>
                </div>
            </section>
        </main>
    );
}
