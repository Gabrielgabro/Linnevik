import type { NextConfig } from "next";


/**
 * Sidhuvudets innehållspolicy.
 *
 * `script-src` måste tillåta `unsafe-inline`: Next lägger sin egen hydrerings-
 * data i inline-taggar, och en nonce kräver att varje sida renderas per anrop —
 * det skulle slå ut cachningen av de publika sidorna, vilket är ett större pris
 * än vad nonce-skyddet är värt här. Resten är däremot skarpt: `object-src` och
 * `frame-ancestors` är stängda, `base-uri` och `form-action` är låsta till
 * sajten, och bara de värdar vi faktiskt laddar från är listade.
 *
 * Värdarna: Stripe för kassans skript och dess iframe, Vercel för Analytics och
 * Speed Insights, Google för mätningen, och Vercel Blob för produktbilderna.
 */
const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://www.googletagmanager.com https://www.google-analytics.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/**' },
        ],
    },
    async redirects() {
        return [
            // Kategorin "Badrum" låg på handlen `madrasskydd` — den döptes om i
            // Shopify utan att handlen följde med, och handlen är adressen.
            // Bytt i 0012; den gamla adressen finns i sökmotorer och länkar.
            {
                source: '/:locale(sv|en)/collections/madrasskydd',
                destination: '/:locale/collections/badrum',
                permanent: true,
            },
            {
                source: '/collections/madrasskydd',
                destination: '/sv/collections/badrum',
                permanent: true,
            },
            // Redirect /products to /collections for both locales
            {
                source: '/:locale(sv|en)/products',
                destination: '/:locale/collections',
                permanent: true,
            },
            // Redirect root /products to default locale
            {
                source: '/products',
                destination: '/sv/collections',
                permanent: true,
            },
            // Redirect root to default locale (Swedish)
            {
                source: '/',
                destination: '/sv',
                permanent: true,
            },
            // Old account links now enter the owned magic-link login flow.
            {
                source: '/account/activate/:id/:token',
                destination: '/sv/login',
                permanent: false,
            },
            {
                source: '/account/reset/:id/:token',
                destination: '/sv/login',
                permanent: false,
            },
        ];
    },
    async headers() {
        return [
            {
                // Sajten tar emot betalningar, så den ska inte gå att rama in,
                // sniffa om eller lura att skicka en full referer vidare.
                source: '/:path*',
                headers: [
                    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                ],
            },
        ];
    },
    typescript: {
        // Enable type checking during builds
        ignoreBuildErrors: false,
    },
};

export default nextConfig;
