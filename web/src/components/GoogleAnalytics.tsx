'use client';

import Script from 'next/script';

export default function GoogleAnalytics() {
    const gaId = process.env.NEXT_PUBLIC_GA_ID;

    if (!gaId) return null;

    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
                strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){window.dataLayer.push(arguments);}
                    gtag('js', new Date());

                    // Check localStorage for consent immediately to avoid race conditions
                    try {
                        const saved = window.localStorage.getItem('linnevik:cookie-consent');
                        const gaId = '${gaId}';
                        if (saved) {
                            const prefs = JSON.parse(saved);
                            if (prefs.analytics) {
                                window['ga-disable-' + gaId] = false;
                            } else {
                                window['ga-disable-' + gaId] = true;
                            }
                        } else {
                            // Default to disabled if no consent stored
                            window['ga-disable-' + gaId] = true;
                        }
                    } catch(e) {
                        // If error, disable to be safe
                        window['ga-disable-' + '${gaId}'] = true;
                    }

                    gtag('config', '${gaId}');
                `}
            </Script>
        </>
    );
}
