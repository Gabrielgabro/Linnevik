'use client';

import { useEffect, useState } from 'react';
import type { ConsentPreferences } from '@/hooks/useCookieConsent';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { useTranslation } from '@/hooks/useTranslation';

const Toggle = ({
    label,
    description,
    checked,
    onChange,
    disabled = false,
}: {
    label: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange?: (next: boolean) => void;
}) => (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-[#E7EDF1] bg-white px-4 py-3">
        <div className="flex-1">
            <p className="text-sm font-semibold text-[#0B3D2E]">{label}</p>
            <p className="text-xs text-[#4B5563]">{description}</p>
        </div>
        <input
            type="checkbox"
            className="h-5 w-5 accent-[#0B3D2E]"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange?.(event.target.checked)}
        />
    </label>
);

export const CookieBanner = () => {
    const {
        isReady,
        showBanner,
        preferences,
        acceptAll,
        acceptNecessary,
        updatePreferences,
        setShowBanner,
    } = useCookieConsent();
    const { t } = useTranslation();
    const copy = t.common.cookieBanner;
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState<ConsentPreferences>(preferences);

    useEffect(() => {
        setDraft(preferences);
    }, [preferences]);

    useEffect(() => {
        const handleOpen = () => {
            setShowBanner(true);
            setExpanded(true);
        };
        window.addEventListener('open-cookie-settings', handleOpen);
        return () => window.removeEventListener('open-cookie-settings', handleOpen);
    }, [setShowBanner]);

    if (!isReady || (!showBanner && !expanded)) {
        return null;
    }

    return (
        <div className="fixed inset-x-4 bottom-4 z-50">
            <div className="mx-auto max-w-5xl rounded-2xl border border-[#E7EDF1] bg-white/95 p-5 shadow-2xl backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="md:max-w-3xl">
                        <p className="text-sm font-semibold text-[#0B3D2E]">{copy.title}</p>
                        <p className="text-sm text-[#4B5563]">
                            {copy.body}{" "}
                            <a href="/cookie-policy" className="underline">
                                {copy.linkLabel}
                            </a>
                            .
                        </p>
                    </div>
                    {!expanded && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                onClick={() => setExpanded(true)}
                                className="rounded-full border border-[#E7EDF1] px-4 py-2 text-sm font-medium text-[#0B3D2E] transition hover:border-[#0B3D2E]"
                            >
                                {copy.customize}
                            </button>
                            <button
                                onClick={acceptNecessary}
                                className="rounded-full border border-[#0B3D2E] px-4 py-2 text-sm font-semibold text-[#0B3D2E] transition hover:bg-[#0B3D2E] hover:text-white"
                            >
                                {copy.necessaryOnly}
                            </button>
                            <button
                                onClick={acceptAll}
                                className="rounded-full bg-[#0B3D2E] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                                {copy.acceptAll}
                            </button>
                        </div>
                    )}
                </div>

                {expanded && (
                    <div className="mt-4 space-y-3">
                        <Toggle
                            label={copy.categories.necessary.label}
                            description={copy.categories.necessary.description}
                            checked
                            disabled
                        />
                        <Toggle
                            label={copy.categories.analytics.label}
                            description={copy.categories.analytics.description}
                            checked={Boolean(draft.analytics)}
                            onChange={(next) => setDraft({ ...draft, analytics: next })}
                        />
                        <Toggle
                            label={copy.categories.marketing.label}
                            description={copy.categories.marketing.description}
                            checked={Boolean(draft.marketing)}
                            onChange={(next) => setDraft({ ...draft, marketing: next })}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                                onClick={() => {
                                    setExpanded(false);
                                    setDraft(preferences);
                                }}
                                className="rounded-full border border-[#E7EDF1] px-4 py-2 text-sm font-medium text-[#0B3D2E] transition hover:border-[#0B3D2E]"
                            >
                                {copy.cancel}
                            </button>
                            <button
                                onClick={() => {
                                    updatePreferences({
                                        ...draft,
                                        necessary: true,
                                    });
                                    setExpanded(false);
                                }}
                                className="rounded-full bg-[#0B3D2E] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                                {copy.save}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
