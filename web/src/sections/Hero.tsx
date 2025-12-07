
'use client'

import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

export default function Example() {
    const { t } = useTranslation();

    return (
        <div className="px-6 pt-14 lg:px-8">
            <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
                <div className="mb-8 flex justify-center px-4">
                    <div className="relative rounded-2xl md:rounded-full px-4 py-2.5 text-sm leading-relaxed text-center text-muted ring-1 ring-custom hover:ring-custom-hover transition-all max-w-lg">
                        {t.home.hero.announcement.text}{' '}
                        <LocaleLink href="/products/handtval" className="font-semibold text-accent whitespace-nowrap inline-block">
                            <span aria-hidden="true" className="absolute inset-0 rounded-2xl md:rounded-full" />
                            {t.home.hero.announcement.ctaLabel} <span aria-hidden="true">&rarr;</span>
                        </LocaleLink>
                    </div>
                </div>
                <div className="text-center">
                    <h1 className="text-4xl font-semibold tracking-tight text-balance text-primary sm:text-5xl lg:text-7xl">
                        {t.home.hero.title}
                    </h1>
                    <p className="mt-6 text-base font-medium text-pretty text-secondary sm:mt-8 sm:text-lg lg:text-xl/8">
                        {t.home.hero.body}
                    </p>
                    <div className="mt-10 flex items-center justify-center gap-x-6">
                        <LocaleLink
                            href="/collections"
                            className="rounded-none bg-accent-primary px-3.5 py-2.5 text-sm font-semibold text-white hover:text-white shadow-sm hover:bg-accent-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
                        >
                            {t.home.hero.primaryCta}
                        </LocaleLink>
                        <LocaleLink href="/about" className="text-sm leading-6 font-semibold text-primary">
                            {t.home.hero.secondaryCta} <span aria-hidden="true">→</span>
                        </LocaleLink>
                    </div>
                </div>
            </div>
        </div>
    )
}
