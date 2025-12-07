'use client';

import { useState, useEffect, useRef } from 'react';
import { LocaleLink } from '@/components/LocaleLink';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/contexts/LocaleContext';

type Product = {
    id: string;
    title: string;
    handle: string;
    productType?: string | null;
    featuredImage?: { url: string; altText?: string | null } | null;
};

export default function LiveSearch() {
    const { t, language } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Stäng suggestions när man klickar utanför
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sök när query ändras (debounced)
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        if (query.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsLoading(true);
        debounceTimerRef.current = setTimeout(async () => {
            try {
                const params = new URLSearchParams({
                    q: query.trim(),
                    lang: language,
                });
                const response = await fetch(`/api/search?${params.toString()}`);
                const data = await response.json();
                setSuggestions(data.products || []);
                setShowSuggestions(true);
            } catch (error) {
                console.error('Search error:', error);
                setSuggestions([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [language, query]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            setShowSuggestions(false);
            const params = new URLSearchParams({
                q: query.trim(),
                lang: language,
            });
            router.push(`/${language}/search?${params.toString()}`);
        }
    };

    return (
        <div ref={containerRef} className="relative max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    placeholder={t.search.input.placeholder}
                    className="w-full px-6 py-4 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    autoFocus
                />
                <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-colors"
                    aria-label="Sök"
                >
                    {isLoading ? (
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    )}
                </button>
            </form>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-xl max-h-96 overflow-y-auto">
                    {suggestions.map((product) => (
                        <LocaleLink
                            key={product.id}
                            href={`/products/${product.handle}`}
                            onClick={() => setShowSuggestions(false)}
                            className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                        >
                            <div className="relative w-16 h-16 flex-shrink-0 bg-overlay rounded overflow-hidden">
                                {product.featuredImage?.url ? (
                                    <Image
                                        src={product.featuredImage.url}
                                        alt={product.featuredImage.altText ?? product.title}
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full grid place-items-center text-secondary text-xs">
                                        {t.search.grid.noImage}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-primary truncate">
                                    {product.title}
                                </h3>
                                {product.productType && (
                                    <p className="text-xs text-secondary mt-1">
                                        {product.productType}
                                    </p>
                                )}
                            </div>
                        </LocaleLink>
                    ))}
                </div>
            )}

            {/* No results message */}
            {showSuggestions && query.trim().length >= 2 && suggestions.length === 0 && !isLoading && (
                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-xl p-6 text-center">
                    <p className="text-secondary">{t.search.results.noResults.replace('{query}', query)}</p>
                </div>
            )}
        </div>
    );
}
