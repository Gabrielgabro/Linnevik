'use client';

import { useState } from 'react';

export const metadata = {
    title: "Cookieinställningar – Linnevik",
    description: "Hantera dina cookieinställningar",
};

export default function CookieSettingsPage() {
    const [settings, setSettings] = useState({
        necessary: true, // Always enabled
        functional: true,
        analytics: false,
        marketing: false,
    });

    const handleToggle = (key: keyof typeof settings) => {
        if (key === 'necessary') return; // Can't disable necessary cookies
        setSettings({
            ...settings,
            [key]: !settings[key],
        });
    };

    const handleSave = () => {
        localStorage.setItem('linnevik:cookie-settings', JSON.stringify(settings));
        alert('Dina cookieinställningar har sparats.');
    };

    const handleAcceptAll = () => {
        const allAccepted = {
            necessary: true,
            functional: true,
            analytics: true,
            marketing: true,
        };
        setSettings(allAccepted);
        localStorage.setItem('linnevik:cookie-settings', JSON.stringify(allAccepted));
        alert('Alla cookies har accepterats.');
    };

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827]">
            <div className="max-w-4xl mx-auto px-6 pt-32 pb-16">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                        Cookieinställningar
                    </h1>
                    <p className="text-lg text-secondary">
                        Hantera hur vi använder cookies på webbplatsen. Du kan när som helst ändra dina inställningar.
                    </p>
                </div>

                {/* Cookie Categories */}
                <div className="space-y-6 mb-8">
                    {/* Necessary Cookies */}
                    <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-2xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-primary mb-2">
                                    Nödvändiga cookies
                                </h3>
                                <p className="text-sm text-secondary">
                                    Dessa cookies är nödvändiga för att webbplatsen ska fungera och kan inte stängas av.
                                    De används för grundläggande funktioner som navigation och säkerhet.
                                </p>
                            </div>
                            <div className="ml-4">
                                <div className="w-12 h-6 bg-[#0B3D2E] dark:bg-[#379E7D] rounded-full relative cursor-not-allowed opacity-50">
                                    <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full" />
                                </div>
                                <p className="text-xs text-secondary mt-1">Alltid aktiv</p>
                            </div>
                        </div>
                    </div>

                    {/* Functional Cookies */}
                    <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-2xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-primary mb-2">
                                    Funktionella cookies
                                </h3>
                                <p className="text-sm text-secondary">
                                    Dessa cookies möjliggör förbättrad funktionalitet och personalisering, såsom videor
                                    och live-chatt. De kan sättas av oss eller av tredjepartsleverantörer.
                                </p>
                            </div>
                            <button
                                onClick={() => handleToggle('functional')}
                                className="ml-4"
                            >
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${
                                    settings.functional
                                        ? 'bg-[#0B3D2E] dark:bg-[#379E7D]'
                                        : 'bg-[#E7EDF1] dark:bg-[#374151]'
                                }`}>
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
                                        settings.functional ? 'right-0.5' : 'left-0.5'
                                    }`} />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Analytics Cookies */}
                    <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-2xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-primary mb-2">
                                    Analys-cookies
                                </h3>
                                <p className="text-sm text-secondary">
                                    Dessa cookies hjälper oss att förstå hur besökare interagerar med webbplatsen genom
                                    att samla in och rapportera information anonymt.
                                </p>
                            </div>
                            <button
                                onClick={() => handleToggle('analytics')}
                                className="ml-4"
                            >
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${
                                    settings.analytics
                                        ? 'bg-[#0B3D2E] dark:bg-[#379E7D]'
                                        : 'bg-[#E7EDF1] dark:bg-[#374151]'
                                }`}>
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
                                        settings.analytics ? 'right-0.5' : 'left-0.5'
                                    }`} />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Marketing Cookies */}
                    <div className="bg-[#F9FAFB] dark:bg-[#1f2937] rounded-2xl p-6 border border-[#E7EDF1] dark:border-[#374151]">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-primary mb-2">
                                    Marknadsförings-cookies
                                </h3>
                                <p className="text-sm text-secondary">
                                    Dessa cookies används för att spåra besökare över webbplatser för att visa relevanta
                                    och engagerande annonser.
                                </p>
                            </div>
                            <button
                                onClick={() => handleToggle('marketing')}
                                className="ml-4"
                            >
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${
                                    settings.marketing
                                        ? 'bg-[#0B3D2E] dark:bg-[#379E7D]'
                                        : 'bg-[#E7EDF1] dark:bg-[#374151]'
                                }`}>
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
                                        settings.marketing ? 'right-0.5' : 'left-0.5'
                                    }`} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-[#0B3D2E] hover:bg-[#145C45] text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl dark:bg-[#145C45] dark:hover:bg-[#1E755C]"
                    >
                        Spara inställningar
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        className="flex-1 bg-transparent border-2 border-[#0B3D2E] dark:border-[#379E7D] text-[#0B3D2E] dark:text-[#379E7D] hover:bg-[#0B3D2E] hover:text-white dark:hover:bg-[#379E7D] dark:hover:text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200"
                    >
                        Acceptera alla
                    </button>
                </div>
            </div>
        </main>
    );
}
