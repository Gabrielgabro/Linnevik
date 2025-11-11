
'use client';

import Link from 'next/link';
import Image from 'next/image';

const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const loginUrl = domain ? `https://${domain}/account/login` : '/account/login';

export default function Header() {
    return (
        <header className="fixed inset-x-0 top-0 z-50 backdrop-blur">
            <nav className="h-20 w-full flex items-center" aria-label="Global">
                {/* Left: logo flush to left edge */}
                <div className="pl-5 flex items-center gap-2">
                    <Link href="/" className="flex items-center gap-2" aria-label="Linnevik – start">
                        <Image
                            src="/brand/logo_in_black.svg"
                            alt="Linnevik"
                            width={200}
                            height={80}
                            priority
                            className="block dark:hidden"
                        />
                        <Image
                            src="/brand/logo_in_white.svg"
                            alt="Linnevik"
                            width={200}
                            height={80}
                            priority
                            className="hidden dark:block"
                        />
                    </Link>
                </div>

                {/* Right: constrained container with nav/actions */}
                <div className="flex-1">
                    <div className="mx-auto max-w-7xl px-6 flex items-center justify-end gap-6">
                        {/* Primary nav (desktop) */}
                        <div className="hidden md:flex items-center gap-6">
                            <Link
                                href="/collections"
                                className="text-sm font-medium text-primary hover:underline"
                            >
                                Kategorier
                            </Link>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 md:gap-4">
                            <Link
                                href="/search"
                                aria-label="Sök"
                                className="p-2.5 rounded-full text-secondary hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <circle cx="11" cy="11" r="7" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </Link>

                            <a
                                href={loginUrl}
                                aria-label="Logga in"
                                className="p-2.5 rounded-full text-secondary hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M20 21a8 8 0 0 0-16 0" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            </a>

                            <Link
                                href="/cart"
                                aria-label="Varukorg"
                                className="p-2.5 rounded-full text-secondary hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <circle cx="9" cy="20" r="1.5" />
                                    <circle cx="17" cy="20" r="1.5" />
                                    <path d="M5 4h2l1 7a2 2 0 0 0 2 1.8h6.5a2 2 0 0 0 2-1.6L20 8H8" />
                                </svg>
                            </Link>

                            <Link
                                href="/contact"
                                className="text-sm font-semibold px-3.5 py-2 rounded-2xl ring-1 ring-inset ring-surface text-primary hover-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white"
                            >
                                Kontakta oss
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    );
}