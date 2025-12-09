'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/contexts/CartContext';
import { useTranslation } from '@/contexts/LocaleContext';

// Country flag icons - 3:2 aspect ratio, optimized SVGs
import SE from 'country-flag-icons/react/3x2/SE';
import DE from 'country-flag-icons/react/3x2/DE';
import GB from 'country-flag-icons/react/3x2/GB';
import US from 'country-flag-icons/react/3x2/US';
import FR from 'country-flag-icons/react/3x2/FR';
import NO from 'country-flag-icons/react/3x2/NO';
import DK from 'country-flag-icons/react/3x2/DK';
import FI from 'country-flag-icons/react/3x2/FI';
import NL from 'country-flag-icons/react/3x2/NL';
import AT from 'country-flag-icons/react/3x2/AT';
import BE from 'country-flag-icons/react/3x2/BE';
import ES from 'country-flag-icons/react/3x2/ES';
import IT from 'country-flag-icons/react/3x2/IT';
import PL from 'country-flag-icons/react/3x2/PL';
import CH from 'country-flag-icons/react/3x2/CH';

type CountryOption = {
    isoCode: string;
    name: string;
    currency: string;
};

// Map of country codes to flag components
const flagComponents: Record<string, React.ComponentType<{ className?: string }>> = {
    SE, DE, GB, US, FR, NO, DK, FI, NL, AT, BE, ES, IT, PL, CH,
};

// Fallback names for countries (used if API doesn't provide)
const countryNames: Record<string, string> = {
    SE: 'Sweden',
    DE: 'Germany',
    GB: 'United Kingdom',
    US: 'United States',
    FR: 'France',
    NO: 'Norway',
    DK: 'Denmark',
    FI: 'Finland',
    NL: 'Netherlands',
    AT: 'Austria',
    BE: 'Belgium',
    ES: 'Spain',
    IT: 'Italy',
    PL: 'Poland',
    CH: 'Switzerland',
};

export default function RegionSelectorModal() {
    const router = useRouter();
    const { updateCartCountry } = useCart();
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [countries, setCountries] = useState<CountryOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

    // Check if user has already selected a region
    useEffect(() => {
        const checkRegion = async () => {
            // Check if SHOP_COUNTRY cookie exists by calling the API
            try {
                const res = await fetch('/api/currencies', { cache: 'no-store' });
                const data = await res.json();

                // Only show modal if no country is selected yet
                if (!data.selectedCountry) {
                    setCountries(data.countries || []);
                    setIsOpen(true);
                } else {
                    // User already has a country selected
                    setIsOpen(false);
                }
            } catch {
                // On error, don't show modal
                setIsOpen(false);
            }
        };

        // Small delay to prevent flash on page load
        const timer = setTimeout(checkRegion, 500);
        return () => clearTimeout(timer);
    }, []);

    const handleSelectCountry = async (country: CountryOption) => {
        setLoading(true);
        setSelectedCountry(country.isoCode);

        try {
            // Set the country cookie
            await fetch('/api/currencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: country.isoCode }),
            });

            // Update cart if exists
            await updateCartCountry(country.isoCode);

            // Refresh to apply new context
            router.refresh();

            // Close modal with animation delay
            setTimeout(() => setIsOpen(false), 300);
        } catch (error) {
            console.error('Failed to set region:', error);
            setLoading(false);
            setSelectedCountry(null);
        }
    };

    // Filter to only show countries we have flags for
    const displayCountries = countries.filter(c => flagComponents[c.isoCode]);

    if (!isOpen || displayCountries.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                aria-hidden="true"
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="px-8 pt-8 pb-4 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#0B3D2E] to-[#145C45] mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-primary mb-2">
                        {t?.regionSelector?.title || 'Choose Your Region'}
                    </h2>
                    <p className="text-secondary text-sm">
                        {t?.regionSelector?.subtitle || 'Select your country to see prices in your local currency'}
                    </p>
                </div>

                {/* Country Grid */}
                <div className="px-8 pb-8">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {displayCountries.map((country) => {
                            const FlagComponent = flagComponents[country.isoCode];
                            const isSelected = selectedCountry === country.isoCode;

                            return (
                                <button
                                    key={country.isoCode}
                                    onClick={() => handleSelectCountry(country)}
                                    disabled={loading}
                                    className={`
                                        group relative flex flex-col items-center p-4 rounded-xl
                                        border-2 transition-all duration-200 ease-out
                                        ${isSelected
                                            ? 'border-[#0B3D2E] bg-[#0B3D2E]/5 dark:border-[#379E7D] dark:bg-[#379E7D]/10'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-[#0B3D2E] dark:hover:border-[#379E7D]'
                                        }
                                        ${loading && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                        hover:shadow-lg hover:-translate-y-0.5
                                    `}
                                >
                                    {/* Flag */}
                                    <div className="w-12 h-8 rounded overflow-hidden shadow-sm mb-2 ring-1 ring-black/10">
                                        <FlagComponent className="w-full h-full object-cover" />
                                    </div>

                                    {/* Country Name */}
                                    <span className="text-xs font-medium text-primary text-center leading-tight">
                                        {countryNames[country.isoCode] || country.name}
                                    </span>

                                    {/* Currency */}
                                    <span className="text-xs text-secondary mt-0.5">
                                        {country.currency}
                                    </span>

                                    {/* Selected indicator */}
                                    {isSelected && (
                                        <div className="absolute top-2 right-2">
                                            <div className="w-5 h-5 rounded-full bg-[#0B3D2E] dark:bg-[#379E7D] flex items-center justify-center">
                                                {loading ? (
                                                    <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer note */}
                <div className="px-8 pb-6 text-center">
                    <p className="text-xs text-secondary">
                        {t?.regionSelector?.changeNote || 'You can change this anytime from the currency selector'}
                    </p>
                </div>
            </div>

            {/* Animations */}
            <style jsx>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scale-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fade-in 0.2s ease-out forwards;
                }
                .animate-scale-in {
                    animation: scale-in 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
