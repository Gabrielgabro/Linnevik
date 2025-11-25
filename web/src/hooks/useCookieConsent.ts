'use client';

import { useCallback, useEffect, useState } from 'react';

export type ConsentPreferences = {
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
    functional?: boolean;
};

type StoredPreferences = ConsentPreferences & { timestamp?: string };

const STORAGE_KEY = 'linnevik:cookie-consent';
const SHOPIFY_PRIVACY_SRC = 'https://cdn.shopify.com/shopifycloud/privacy-banner/storefront-banner.js';

const defaultPreferences: StoredPreferences = {
    necessary: true,
    analytics: false,
    marketing: false,
    functional: false,
};

let shopifyPrivacyLoading = false;
let lastApplied: StoredPreferences = defaultPreferences;

const normalizePreferences = (value: unknown): StoredPreferences => {
    if (!value || typeof value !== 'object') {
        return defaultPreferences;
    }
    const record = value as Record<string, unknown>;
    return {
        necessary: true,
        analytics: Boolean(record.analytics),
        marketing: Boolean(record.marketing),
        functional: Boolean(record.functional),
    };
};

const ensureShopifyPrivacyScript = () => {
    if (typeof window === 'undefined') return;
    if ((window as any).Shopify?.customerPrivacy) return;
    if (shopifyPrivacyLoading) return;

    const existing = document.querySelector(`script[src="${SHOPIFY_PRIVACY_SRC}"]`);
    if (existing) {
        shopifyPrivacyLoading = true;
        return;
    }

    shopifyPrivacyLoading = true;
    const script = document.createElement('script');
    script.src = SHOPIFY_PRIVACY_SRC;
    script.async = true;
    script.dataset.source = 'linnevik-shopify-privacy';
    script.onload = () => {
        shopifyPrivacyLoading = false;
        applyConsent(lastApplied);
    };
    script.onerror = () => {
        shopifyPrivacyLoading = false;
    };
    document.head.appendChild(script);
};

const applyConsent = (prefs: StoredPreferences) => {
    if (typeof window === 'undefined') return;

    lastApplied = prefs;

    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    if (gaId) {
        (window as any)[`ga-disable-${gaId}`] = !prefs.analytics;
    }

    const customerPrivacy = (window as any).Shopify?.customerPrivacy;
    if (customerPrivacy?.setTrackingConsent) {
        customerPrivacy.setTrackingConsent(
            {
                analytics: prefs.analytics,
                marketing: prefs.marketing,
                preferences: true,
                sale_of_data: Boolean(prefs.marketing),
            },
            () => {},
        );
    }
};

export const useCookieConsent = () => {
    const [preferences, setPreferences] = useState<StoredPreferences>(defaultPreferences);
    const [showBanner, setShowBanner] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        ensureShopifyPrivacyScript();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const saved =
            window.localStorage.getItem(STORAGE_KEY) ||
            window.localStorage.getItem('linnevik:cookie-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const normalized = normalizePreferences(parsed);
                setPreferences(normalized);
                applyConsent(normalized);
            } catch (error) {
                applyConsent(defaultPreferences);
                setShowBanner(true);
            }
        } else {
            applyConsent(defaultPreferences);
            setShowBanner(true);
        }
        setIsReady(true);
    }, []);

    const persist = useCallback((prefs: StoredPreferences) => {
        const normalized: StoredPreferences = {
            ...defaultPreferences,
            ...prefs,
            necessary: true,
            timestamp: new Date().toISOString(),
        };

        setPreferences(normalized);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        }
        applyConsent(normalized);
        setShowBanner(false);
    }, []);

    const acceptAll = useCallback(() => {
        persist({
            necessary: true,
            analytics: true,
            marketing: true,
            functional: true,
        });
    }, [persist]);

    const acceptNecessary = useCallback(() => {
        persist({
            necessary: true,
            analytics: false,
            marketing: false,
            functional: false,
        });
    }, [persist]);

    const updatePreferences = useCallback(
        (prefs: StoredPreferences) => {
            persist(prefs);
        },
        [persist],
    );

    return {
        isReady,
        showBanner,
        preferences,
        acceptAll,
        acceptNecessary,
        updatePreferences,
        setShowBanner,
    };
};

export const triggerCookieSettings = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('open-cookie-settings'));
};
