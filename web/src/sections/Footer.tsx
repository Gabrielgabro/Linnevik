'use client';

import { Suspense } from 'react';
import { LocaleLink } from "@/components/LocaleLink";
import Image from "next/image";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CurrencySelector from "@/components/CurrencySelector";
import { useTranslation } from '@/contexts/LocaleContext';
import { triggerCookieSettings } from "@/hooks/useCookieConsent";

export default function Footer() {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear().toString();
    const copyright = t.common.footer.legal.copyright.replace('*year goes here*', currentYear);

    return (
        <footer className="relative">
            <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-8">
                {/* Logo centered */}
                <div className="flex justify-center mb-6">
                    <LocaleLink href="/" className="flex items-center gap-2" aria-label={t.common.footer.brand.homeAria}>
                        <Image
                            src="/brand/logo_in_black.svg"
                            alt={t.common.footer.brand.alt}
                            width={160}
                            height={64}
                            className="block dark:hidden"
                        />
                        <Image
                            src="/brand/logo_in_white.svg"
                            alt={t.common.footer.brand.alt}
                            width={160}
                            height={64}
                            className="hidden dark:block"
                        />
                    </LocaleLink>
                </div>

                {/* Contact info */}
                <div className="text-center text-sm text-secondary mb-8 space-x-4">
                    <a href="mailto:info@linnevik.se" className="hover:underline">info@linnevik.se</a>
                    <span>•</span>
                    <a href="tel:+46738970239" className="hover:underline">+46 73 897 02 39</a>
                </div>

                {/* Language and currency selectors */}
                <div className="mb-6 flex items-center justify-center gap-4">
                    <Suspense fallback={<div className="w-24 h-6" />}>
                        <LanguageSwitcher variant="footer" />
                    </Suspense>
                    <span className="text-secondary">•</span>
                    <CurrencySelector variant="footer" />
                </div>

                {/* Copyright and links in one line */}
                <div className="text-center text-xs text-secondary">
                    <span>{copyright}</span>
                    <span className="mx-2">•</span>
                    <button
                        type="button"
                        onClick={triggerCookieSettings}
                        className="hover:underline"
                    >
                        {t.common.footer.legal.cookieSettings}
                    </button>
                    <span className="mx-2">•</span>
                    <LocaleLink href="/cookie-policy" className="hover:underline">{t.common.footer.legal.cookiePolicy}</LocaleLink>
                    <span className="mx-2">•</span>
                    <LocaleLink href="/terms" className="hover:underline">{t.common.footer.legal.terms}</LocaleLink>
                </div>
            </div>
        </footer>
    );
}
