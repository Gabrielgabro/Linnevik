import Link from 'next/link';

export const metadata = {
    title: "Cookiepolicy – Linnevik",
    description: "Läs om hur vi använder cookies på vår webbplats",
};

export default function CookiePolicyPage() {
    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-4xl mx-auto px-6 pt-32 pb-16">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                        Cookiepolicy
                    </h1>
                    <p className="text-lg text-secondary">
                        Senast uppdaterad: {new Date().toLocaleDateString('sv-SE')}
                    </p>
                </div>

                {/* Content */}
                <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                    <div className="space-y-8">
                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">Vad är cookies?</h2>
                            <p className="text-secondary leading-relaxed">
                                Cookies är små textfiler som lagras på din enhet när du besöker vår webbplats. De hjälper
                                oss att förbättra din upplevelse genom att komma ihåg dina preferenser och ge oss insikter
                                om hur webbplatsen används.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">Hur vi använder cookies</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                Vi använder cookies för följande ändamål:
                            </p>
                            <ul className="space-y-2 text-secondary">
                                <li><strong className="text-primary">Nödvändiga cookies:</strong> För att webbplatsen ska fungera korrekt</li>
                                <li><strong className="text-primary">Funktionella cookies:</strong> För att komma ihåg dina val och preferenser</li>
                                <li><strong className="text-primary">Analys-cookies:</strong> För att förstå hur besökare använder webbplatsen</li>
                                <li><strong className="text-primary">Marknadsförings-cookies:</strong> För att visa relevanta annonser</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">Tredjepartscookies</h2>
                            <p className="text-secondary leading-relaxed">
                                Vi använder cookies från tredjepartsleverantörer som Google Analytics för att analysera
                                trafiken på vår webbplats och förbättra användarupplevelsen. Dessa leverantörer kan också
                                använda informationen för sina egna ändamål enligt sina respektive integritetspolicyer.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">Hantera cookies</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                Du kan när som helst ändra dina cookieinställningar genom att besöka vår{' '}
                                <Link href="/cookie-settings" className="text-[#0B3D2E] dark:text-[#379E7D] hover:underline font-semibold">
                                    cookieinställningssida
                                </Link>
                                . Du kan också blockera cookies genom din webbläsares inställningar, men observera att
                                vissa funktioner på webbplatsen kanske inte fungerar korrekt.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">Cookies vi använder</h2>
                            <div className="space-y-4">
                                <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                    <h3 className="font-bold text-primary mb-2">Shopify</h3>
                                    <p className="text-sm text-secondary mb-2">
                                        Används för att hantera kundvagn, sessioner och autentisering.
                                    </p>
                                    <p className="text-xs text-secondary">Typ: Nödvändig | Varaktighet: Session/365 dagar</p>
                                </div>
                                <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                    <h3 className="font-bold text-primary mb-2">Google Analytics</h3>
                                    <p className="text-sm text-secondary mb-2">
                                        Används för att analysera hur besökare använder webbplatsen.
                                    </p>
                                    <p className="text-xs text-secondary">Typ: Analys | Varaktighet: 2 år</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">Kontakta oss</h2>
                            <p className="text-secondary leading-relaxed">
                                Om du har frågor om vår cookiepolicy, kontakta oss på{' '}
                                <a href="mailto:info@linnevik.se" className="text-[#0B3D2E] dark:text-[#379E7D] hover:underline font-semibold">
                                    info@linnevik.se
                                </a>
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
