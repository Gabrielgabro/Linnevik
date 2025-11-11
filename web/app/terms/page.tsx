export const metadata = {
    title: "Köpvillkor – Linnevik",
    description: "Läs våra allmänna villkor och köpvillkor",
};

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-4xl mx-auto px-6 pt-32 pb-16">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                        Köpvillkor
                    </h1>
                    <p className="text-lg text-secondary">
                        Senast uppdaterad: {new Date().toLocaleDateString('sv-SE')}
                    </p>
                </div>

                {/* Content */}
                <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                    <div className="space-y-8">
                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">1. Allmänt</h2>
                            <p className="text-secondary leading-relaxed">
                                Dessa allmänna villkor gäller för köp av produkter från Linnevik AB, organisationsnummer
                                [XXXXXX-XXXX]. Genom att lägga en beställning hos oss accepterar du dessa villkor.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">2. Priser och betalning</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                Alla priser anges i svenska kronor (SEK) exklusive moms om inget annat anges. Vi
                                förbehåller oss rätten att ändra priser utan förvarning.
                            </p>
                            <ul className="space-y-2 text-secondary">
                                <li>Betalning sker enligt överenskommelse vid offertförfrågan</li>
                                <li>Vi accepterar faktura för företagskunder</li>
                                <li>Betalningsvillkor: 30 dagar netto</li>
                                <li>Vid försenad betalning tillkommer dröjsmålsränta enligt lag</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">3. Leverans</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                Leveranstider anges som en uppskattning och är inte bindande. Vi strävar alltid efter att
                                leverera enligt överenskommet datum.
                            </p>
                            <ul className="space-y-2 text-secondary">
                                <li>Leverans sker till angiven adress</li>
                                <li>Fraktkostnader tillkommer enligt överenskommelse</li>
                                <li>Kunden ansvarar för att kontrollera leveransen vid mottagandet</li>
                                <li>Eventuella skador eller brister ska rapporteras omedelbart</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">4. Reklamation och retur</h2>
                            <p className="text-secondary leading-relaxed mb-4">
                                Reklamation av vara ska göras inom skälig tid från det att felet upptäcktes eller borde
                                ha upptäckts. Kontakta vår kundtjänst för att anmäla reklamation.
                            </p>
                            <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                <p className="text-sm text-secondary">
                                    <strong className="text-primary">Observera:</strong> Skräddarsydda produkter och
                                    specialbeställningar kan inte returneras eller bytas.
                                </p>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">5. Ångerrätt</h2>
                            <p className="text-secondary leading-relaxed">
                                Då vi främst säljer till företag gäller inte konsumentköplagen och därmed inte heller
                                ångerrätt. För standardprodukter kan retur dock diskuteras i enskilda fall.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">6. Force majeure</h2>
                            <p className="text-secondary leading-relaxed">
                                Linnevik AB ansvarar inte för förseningar eller andra följder av omständigheter utanför
                                vår kontroll, såsom naturkatastrofer, krig, pandemi, strejk, eller andra liknande
                                händelser.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">7. Personuppgifter</h2>
                            <p className="text-secondary leading-relaxed">
                                Vi behandlar dina personuppgifter enligt GDPR. Läs mer i vår integritetspolicy om hur vi
                                hanterar dina uppgifter.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-bold text-primary mb-4">8. Tvister</h2>
                            <p className="text-secondary leading-relaxed">
                                Tvister rörande tolkning eller tillämpning av dessa villkor ska avgöras enligt svensk lag
                                och vid svensk domstol.
                            </p>
                        </section>

                        <section className="border-t border-[#E7EDF1] dark:border-[#374151] pt-8">
                            <h2 className="text-2xl font-bold text-primary mb-4">Kontaktuppgifter</h2>
                            <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                                <p className="text-secondary mb-2">
                                    <strong className="text-primary">Linnevik AB</strong>
                                </p>
                                <p className="text-secondary text-sm space-y-1">
                                    <span className="block">Kungsgatan 12</span>
                                    <span className="block">111 35 Stockholm</span>
                                    <span className="block">E-post: info@linnevik.se</span>
                                    <span className="block">Telefon: +46 8 123 456 78</span>
                                </p>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
