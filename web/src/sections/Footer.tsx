'use client';

import Link from "next/link";
import Image from "next/image";
import LanguageSelector from "@/components/LanguageSelector";
import { useTranslation } from '@/hooks/useTranslation';

export default function Footer() {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear().toString();
    const copyright = t.common.footer.legal.copyright.replace('*year goes here*', currentYear);

    return (
        <footer className="relative">
            <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-8">
                {/* Logo centered */}
                <div className="flex justify-center mb-6">
                    <Link href="/" className="flex items-center gap-2" aria-label={t.common.footer.brand.homeAria}>
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
                    </Link>
                </div>

                {/* Contact info */}
                <div className="text-center text-sm text-secondary mb-8 space-x-4">
                    <a href="mailto:info@linnevik.se" className="hover:underline">info@linnevik.se</a>
                    <span>•</span>
                    <a href="tel:+46738970239" className="hover:underline">+46 73 897 02 39</a>
                </div>

                {/* Language selector */}
                <div className="mb-6">
                    <LanguageSelector variant="footer" />
                </div>

                {/* Copyright and links in one line */}
                <div className="text-center text-xs text-secondary">
                    <span>{copyright}</span>
                    <span className="mx-2">•</span>
                    <Link href="/cookies" className="hover:underline">{t.common.footer.legal.cookieSettings}</Link>
                    <span className="mx-2">•</span>
                    <Link href="/cookie-policy" className="hover:underline">{t.common.footer.legal.cookiePolicy}</Link>
                    <span className="mx-2">•</span>
                    <Link href="/terms" className="hover:underline">{t.common.footer.legal.terms}</Link>
                </div>
            </div>
        </footer>
    );
}
