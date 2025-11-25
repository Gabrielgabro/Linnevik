'use client';

import { triggerCookieSettings } from '@/hooks/useCookieConsent';

export const CookieSettingsButton = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    return (
        <button
            onClick={triggerCookieSettings}
            className={className}
        >
            {children}
        </button>
    );
};
