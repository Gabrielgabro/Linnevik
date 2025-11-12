'use client';

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
    return (
        <footer className="relative">
            <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-8">
                {/* Logo centered */}
                <div className="flex justify-center mb-6">
                    <Link href="/" className="flex items-center gap-2" aria-label="Linnevik – start">
                        <Image
                            src="/brand/logo_in_black.svg"
                            alt="Linnevik"
                            width={160}
                            height={64}
                            className="block dark:hidden"
                        />
                        <Image
                            src="/brand/logo_in_white.svg"
                            alt="Linnevik"
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

                {/* Copyright and links in one line */}
                <div className="text-center text-xs text-secondary">
                    <span>Copyright © 2025 Södra Vanadistvätten AB</span>
                    <span className="mx-2">•</span>
                    <Link href="/cookies" className="hover:underline">Cookieinställningar</Link>
                    <span className="mx-2">•</span>
                    <Link href="/cookie-policy" className="hover:underline">Cookiepolicy</Link>
                    <span className="mx-2">•</span>
                    <Link href="/terms" className="hover:underline">Köpvillkor</Link>
                </div>
            </div>
        </footer>
    );
}
