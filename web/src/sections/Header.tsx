'use client';

import Link from 'next/link';
import Image from 'next/image';

const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
const loginUrl = `https://${domain}/account/login`;

export default function Header() {
    return (
        <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur">
            <nav className="h-20 w-full flex items-center justify-between">
                {/* Logo helt till vänster med padding */}
                <div className="pl-4 md:pl-6">
                    <Link href="/web/public" className="flex items-center gap-2" aria-label="Linnevik – start">
                        <Image
                            src="/brand/logo_nobg.svg"
                            alt="Linnevik"
                            width={200}
                            height={80}
                            priority
                        />
                    </Link>
                </div>

                {/* Högerkluster i centrerad container */}
                <div className="flex-1">
                    <div className="mx-auto max-w-6xl px-6 flex items-center justify-end gap-6">
                        <div className="hidden md:flex items-center gap-6">
                            <Link href="/collections" className="text-sm text-black hover:underline">Kategorier</Link>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Sök */}
                            <Link
                              href="/search"
                              aria-label="Sök"
                              className="p-2.5 rounded-full text-black/70 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
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

                            {/* Konto */}
                            <a
                              href={loginUrl}
                              aria-label="Logga in"
                              className="p-2.5 rounded-full text-black/70 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
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

                            {/* Varukorg (stub – kan kopplas senare) */}
                            <Link
                              href="/cart"
                              aria-label="Varukorg"
                              className="p-2.5 rounded-full text-black/70 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
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

                            {/* Kontakta oss-knapp */}
                            <Link
                              href="/contact"
                              className="text-sm px-3.5 py-2 rounded-full border border-black/20 hover:border-black/40"
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