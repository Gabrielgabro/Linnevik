'use client';

import { useTranslation } from '@/hooks/useTranslation';

export default function AboutPage() {
    const { t } = useTranslation();

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            {/* Hero Section */}
            <section className="relative h-[60vh] min-h-[500px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0B3D2E] via-[#145C45] to-[#1E755C] dark:from-[#145C45] dark:via-[#1E755C] dark:to-[#379E7D]" />
                <div className="absolute inset-0 bg-[url('/Supporting_visuals/Sample.png')] bg-cover bg-center opacity-10" />

                <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight">
                        {t.about.hero.heading}
                    </h1>
                    <p className="text-xl md:text-2xl text-[#EBDCCB] max-w-3xl mx-auto leading-relaxed">
                        {t.about.hero.subheading}
                    </p>
                </div>
            </section>

            {/* Our Story */}
            <section className="py-24 lg:py-32">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-6">
                            <div className="inline-block">
                                <span className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                                    {t.about.story.badge}
                                </span>
                            </div>
                            <h2 className="text-4xl lg:text-5xl font-bold text-primary leading-tight">
                                {t.about.story.title}
                            </h2>
                            <div className="space-y-4 text-lg text-secondary leading-relaxed">
                                <p>
                                    {t.about.story.paragraph1}
                                </p>
                                <p>
                                    {t.about.story.paragraph2}
                                </p>
                                <p className="font-semibold text-primary">
                                    {t.about.story.highlight}
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-[#F9FAFB] dark:bg-[#1f2937] border border-[#E7EDF1] dark:border-[#374151]">
                                <div className="absolute inset-0 bg-gradient-to-br from-[#0B3D2E]/20 to-transparent" />
                                {/* Placeholder for actual image */}
                                <div className="absolute inset-0 flex items-center justify-center text-secondary">
                                    {t.about.story.imagePlaceholder}
                                </div>
                            </div>
                            {/* Decorative element */}
                            <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-[#EBDCCB] dark:bg-[#0B3D2E] rounded-3xl -z-10" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-24 bg-[#F9FAFB] dark:bg-[#1f2937]">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid md:grid-cols-3 gap-12">
                        <div className="text-center space-y-3">
                            <div className="text-5xl lg:text-6xl font-bold text-[#0B3D2E] dark:text-[#379E7D]">
                                38+
                            </div>
                            <div className="text-sm font-semibold uppercase tracking-wider text-secondary">
                                {t.about.stats.yearsLabel}
                            </div>
                        </div>
                        <div className="text-center space-y-3">
                            <div className="text-5xl lg:text-6xl font-bold text-[#0B3D2E] dark:text-[#379E7D]">
                                40+
                            </div>
                            <div className="text-sm font-semibold uppercase tracking-wider text-secondary">
                                {t.about.stats.partnersLabel}
                            </div>
                        </div>
                        <div className="text-center space-y-3">
                            <div className="text-5xl lg:text-6xl font-bold text-[#0B3D2E] dark:text-[#379E7D]">
                                120+
                            </div>
                            <div className="text-sm font-semibold uppercase tracking-wider text-secondary">
                                {t.about.stats.projectsLabel}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Values Section */}
            <section className="py-24 lg:py-32">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <span className="text-sm font-semibold text-[#0B3D2E] dark:text-[#379E7D] uppercase tracking-wider">
                            {t.about.values.badge}
                        </span>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Value 1 */}
                        <div className="group relative p-8 rounded-2xl bg-white dark:bg-[#1f2937] border-2 border-[#E7EDF1] dark:border-[#374151] hover:border-[#0B3D2E] dark:hover:border-[#379E7D] transition-all duration-300">
                            <div className="w-14 h-14 rounded-2xl bg-[#D9F0E8] dark:bg-[#0B3D2E] flex items-center justify-center mb-6">
                                <svg className="w-7 h-7 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-primary mb-3">{t.about.values.items.quality.title}</h3>
                            <p className="text-secondary leading-relaxed">
                                {t.about.values.items.quality.body}
                            </p>
                        </div>

                        {/* Value 2 */}
                        <div className="group relative p-8 rounded-2xl bg-white dark:bg-[#1f2937] border-2 border-[#E7EDF1] dark:border-[#374151] hover:border-[#0B3D2E] dark:hover:border-[#379E7D] transition-all duration-300">
                            <div className="w-14 h-14 rounded-2xl bg-[#D9F0E8] dark:bg-[#0B3D2E] flex items-center justify-center mb-6">
                                <svg className="w-7 h-7 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-primary mb-3">{t.about.values.items.partnership.title}</h3>
                            <p className="text-secondary leading-relaxed">
                                {t.about.values.items.partnership.body}
                            </p>
                        </div>

                        {/* Value 3 */}
                        <div className="group relative p-8 rounded-2xl bg-white dark:bg-[#1f2937] border-2 border-[#E7EDF1] dark:border-[#374151] hover:border-[#0B3D2E] dark:hover:border-[#379E7D] transition-all duration-300">
                            <div className="w-14 h-14 rounded-2xl bg-[#D9F0E8] dark:bg-[#0B3D2E] flex items-center justify-center mb-6">
                                <svg className="w-7 h-7 text-[#0B3D2E] dark:text-[#379E7D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-primary mb-3">{t.about.values.items.innovation.title}</h3>
                            <p className="text-secondary leading-relaxed">
                                {t.about.values.items.innovation.body}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-gradient-to-br from-[#0B3D2E] via-[#145C45] to-[#1E755C] dark:from-[#145C45] dark:via-[#1E755C] dark:to-[#379E7D]">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                        {t.about.cta.title}
                    </h2>
                    <p className="text-xl text-[#EBDCCB] mb-10 leading-relaxed">
                        {t.about.cta.body}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <a
                            href="/contact"
                            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white text-[#0B3D2E] font-semibold hover:bg-[#EBDCCB] transition-colors shadow-xl"
                        >
                            {t.about.cta.primaryButton}
                        </a>
                        <a
                            href="/collections"
                            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-transparent text-white font-semibold border-2 border-white hover:bg-white/10 transition-colors"
                        >
                            {t.about.cta.secondaryButton}
                        </a>
                    </div>
                </div>
            </section>
        </main>
    );
}
