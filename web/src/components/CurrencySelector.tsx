'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/contexts/CartContext';

type CountryOption = {
  isoCode: string; // e.g. "SE"
  name: string;
  currency: string; // e.g. "SEK"
};

interface CurrencySelectorProps {
  variant?: 'header' | 'footer';
}

export default function CurrencySelector({ variant = 'header' }: CurrencySelectorProps) {
  const router = useRouter();
  const { refreshCart } = useCart();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/currencies', { cache: 'no-store' });
        const data = await res.json();
        if (!mounted) return;
        setCountries(data.countries || []);
        setSelected(data.selectedCountry || null);
      } catch {
        // ignore
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const onChange = async (country: string) => {
    if (!country || country === selected) return;
    setLoading(true);
    try {
      await fetch('/api/currencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country }),
      });
      setSelected(country);
      // Refresh server components and re-fetch cart in selected currency
      router.refresh();
      await refreshCart();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const uniqueCurrencies = useMemo(() => {
    const seen = new Set<string>();
    const deduped: CountryOption[] = [];
    for (const c of countries) {
      if (!c.currency || seen.has(c.currency)) continue;
      seen.add(c.currency);
      deduped.push(c);
    }
    return deduped;
  }, [countries]);

  const selectedCurrency =
    countries.find(c => c.isoCode === selected)?.currency || uniqueCurrencies[0]?.currency || '—';

  if (!countries.length || !uniqueCurrencies.length) {
    return null;
  }

  if (variant === 'footer') {
    return (
      <div className="flex items-center justify-center gap-3">
        {uniqueCurrencies.map((c) => (
          <button
            key={c.currency}
            onClick={() => onChange(c.isoCode)}
            className={`text-sm transition-all ${
              selectedCurrency === c.currency ? 'text-primary font-medium' : 'text-secondary hover:text-primary'
            }`}
            disabled={loading}
            aria-label={`Change currency to ${c.currency}`}
            title={c.currency}
          >
            {c.currency}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 px-3 py-2 rounded-full text-secondary hover-surface focus:outline-none transition-colors text-sm font-medium"
        aria-label="Change currency"
      >
        <span>{selectedCurrency}</span>
      </button>

      <div className="absolute right-0 mt-1 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-black/5 dark:ring-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[160px] z-50">
        {uniqueCurrencies.map((c) => (
          <button
            key={c.currency}
            onClick={() => onChange(c.isoCode)}
            disabled={loading}
            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-3 transition-colors ${
              selectedCurrency === c.currency
                ? 'bg-gray-50 dark:bg-gray-700 text-primary font-medium'
                : 'text-secondary hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <span className="tabular-nums">{c.currency}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
