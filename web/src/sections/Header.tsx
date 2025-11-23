
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useTranslation } from '@/hooks/useTranslation';
import LanguageSelector from '@/components/LanguageSelector';

const loginUrl = '/login';

export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { cart } = useCart();
    const { t } = useTranslation();
    const cartItemCount = cart?.totalQuantity || 0;
    const displayCount = cartItemCount > 99 ? '99+' : cartItemCount.toString();

    return (
        <>
        <header className="fixed inset-x-0 top-0 z-50 backdrop-blur">
            <nav className="h-20 w-full flex items-center justify-between px-5" aria-label="Global">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 z-50" aria-label={t.common.header.brand.homeAria}>
                    <Image
                        src="/brand/logo_in_black.svg"
                        alt={t.common.header.brand.alt}
                        width={150}
                        height={60}
                        priority
                        className="block dark:hidden w-32 md:w-[150px]"
                    />
                    <Image
                        src="/brand/logo_in_white.svg"
                        alt={t.common.header.brand.alt}
                        width={150}
                        height={60}
                        priority
                        className="hidden dark:block w-32 md:w-[150px]"
                    />
                </Link>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-6">
                    <Link
                        href="/collections"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        {t.common.header.nav.categories}
                    </Link>

                    <Link
                        href="/search"
                        aria-label={t.common.header.nav.search}
                        className="p-2.5 rounded-full text-secondary hover-surface focus:outline-none"
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </Link>

                    <Link
                        href={loginUrl}
                        aria-label={t.common.header.nav.login}
                        className="p-2.5 rounded-full text-secondary hover-surface focus:outline-none"
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21a8 8 0 0 0-16 0" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </Link>

                    <Link
                        href="/cart"
                        aria-label={t.common.header.nav.cart}
                        className="relative p-2.5 rounded-full text-secondary hover-surface focus:outline-none"
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="20" r="1.5" />
                            <circle cx="17" cy="20" r="1.5" />
                            <path d="M5 4h2l1 7a2 2 0 0 0 2 1.8h6.5a2 2 0 0 0 2-1.6L20 8H8" />
                        </svg>
                        {cartItemCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-[#0B3D2E] dark:bg-[#145C45] text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-md">
                                {displayCount}
                            </span>
                        )}
                    </Link>

                    <LanguageSelector />

                    <Link
                        href="/contact"
                        className="text-sm font-semibold px-3.5 py-2 rounded-2xl ring-1 ring-inset ring-surface text-primary hover-surface focus:outline-none"
                    >
                        {t.common.header.nav.contact}
                    </Link>
                </div>

                {/* Mobile Hamburger Button */}
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2 rounded-lg text-primary hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none z-50"
                    aria-label={t.common.header.nav.toggleMenu}
                >
                    <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        {mobileMenuOpen ? (
                            <>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </>
                        ) : (
                            <>
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </>
                        )}
                    </svg>
                </button>
            </nav>

            {/* Mobile Menu */}
            <div
                className={`md:hidden fixed inset-0 top-20 z-40 bg-white dark:bg-gray-900 transition-transform duration-300 ease-in-out ${
                    mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className="flex flex-col p-6 space-y-6">
                    <Link
                        href="/collections"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-primary hover:underline py-2"
                    >
                        {t.common.header.nav.categories}
                    </Link>

                    <Link
                        href="/search"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 text-lg font-medium text-primary hover:underline py-2"
                    >
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        {t.common.header.nav.search}
                    </Link>

                    <Link
                        href={loginUrl}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 text-lg font-medium text-primary hover:underline py-2"
                    >
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21a8 8 0 0 0-16 0" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        {t.common.header.nav.login}
                    </Link>

                    <Link
                        href="/cart"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 text-lg font-medium text-primary hover:underline py-2 relative"
                    >
                        <div className="relative">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="9" cy="20" r="1.5" />
                                <circle cx="17" cy="20" r="1.5" />
                                <path d="M5 4h2l1 7a2 2 0 0 0 2 1.8h6.5a2 2 0 0 0 2-1.6L20 8H8" />
                            </svg>
                            {cartItemCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-[#0B3D2E] dark:bg-[#145C45] text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-md">
                                    {displayCount}
                                </span>
                            )}
                        </div>
                        {t.common.header.nav.cart}
                    </Link>

                    <div className="py-2">
                        <LanguageSelector />
                    </div>

                    <Link
                        href="/contact"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-semibold px-4 py-3 rounded-2xl ring-1 ring-inset ring-surface text-primary hover-surface text-center"
                    >
                        {t.common.header.nav.contact}
                    </Link>
                </div>
            </div>
        </header>

        {/* Overlay to block content behind menu */}
        {mobileMenuOpen && (
            <div
                className="md:hidden fixed inset-0 top-20 bg-white dark:bg-gray-900 z-30"
                onClick={() => setMobileMenuOpen(false)}
            />
        )}
        </>
    );
}
