import Link from "next/link";

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="mt-16 bg-neutral-50 border-t">
            <div className="mx-auto max-w-6xl px-6 py-12 grid gap-8 md:grid-cols-4">
                {/* Brand + social */}
                <div>
                    <div className="text-lg font-semibold">Linnevik</div>
                    <p className="mt-2 text-sm text-black/60">
                        Enkel hotelltextil för B2B – kuddar, täcken, madrassskydd.
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-black/60">
                        {/* Social ikoner (inline SVG) */}
                        <a href="https://www.instagram.com" aria-label="Instagram" className="p-2 rounded hover:bg-black/5">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5a5 5 0 1 0 .001 10.001A5 5 0 0 0 12 7zm6.5-.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM12 9a3 3 0 1 1-.001 6.001A3 3 0 0 1 12 9z" />
                            </svg>
                        </a>
                        <a href="https://www.linkedin.com" aria-label="LinkedIn" className="p-2 rounded hover:bg-black/5">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <path d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM0 8h5v16H0zM8 8h4.8v2.2h.07c.67-1.26 2.3-2.6 4.73-2.6 5.06 0 6 3.33 6 7.66V24h-5V16c0-1.9-.03-4.35-2.65-4.35-2.66 0-3.07 2.08-3.07 4.22V24H8z"/>
                            </svg>
                        </a>
                    </div>
                </div>

                {/* Produkter */}
                <nav>
                    <div className="font-medium mb-3">Produkter</div>
                    <ul className="space-y-2 text-sm text-black/70">
                        <li><Link className="hover:underline" href="/collections/hotellrum">Hotellrum</Link></li>
                        <li><Link className="hover:underline" href="/collections/sang">Sängar</Link></li>
                        <li><Link className="hover:underline" href="/collections/kuddar">Kuddar</Link></li>
                        <li><Link className="hover:underline" href="/collections/madrasskydd">Madrasskydd</Link></li>
                    </ul>
                </nav>

                {/* Bolag */}
                <nav>
                    <div className="font-medium mb-3">Bolag</div>
                    <ul className="space-y-2 text-sm text-black/70">
                        <li><Link className="hover:underline" href="/about">Om oss</Link></li>
                        <li><Link className="hover:underline" href="/contact">Kontakta oss</Link></li>
                        <li><Link className="hover:underline" href="/privacy">Integritet</Link></li>
                        <li><Link className="hover:underline" href="/terms">Villkor</Link></li>
                    </ul>
                </nav>

                {/* Nyhetsbrev (dummy – kopplas senare) */}
                <form className="max-w-sm">
                    <div className="font-medium mb-3">Nyhetsbrev</div>
                    <p className="text-sm text-black/60 mb-3">Få nyheter och kampanjer.</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="email"
                            required
                            placeholder="din@epost.se"
                            className="w-full rounded-full border border-black/20 px-4 py-2 bg-white placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/20"
                        />
                        <button
                            type="submit"
                            className="rounded-full bg-black text-white px-4 py-2"
                        >
                            Skicka
                        </button>
                    </div>
                </form>
            </div>

            <div className="px-6 py-4 border-t text-xs text-black/50 flex items-center justify-between">
                <span>© {year} Linnevik</span>
                <span className="hidden sm:block">info@linnevik.se</span>
            </div>
        </footer>
    );
}