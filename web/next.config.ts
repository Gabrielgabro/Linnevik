import type { NextConfig } from "next";


const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            // Produktbilderna ligger i Vercel Blob. cdn.shopify.com står kvar
            // tills produktsidan slutat läsa från Shopify, och tas bort då.
            { protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/**' },
            { protocol: 'https', hostname: 'cdn.shopify.com', pathname: '/**' },
        ],
    },
    async redirects() {
        return [
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
            // Redirect Shopify activation links (no locale) to Swedish default
            {
                source: '/account/activate/:id/:token',
                destination: '/sv/account/activate/:id/:token',
                permanent: false,
            },
            // Redirect Shopify password-reset links (no locale) to Swedish default
            {
                source: '/account/reset/:id/:token',
                destination: '/sv/account/reset/:id/:token',
                permanent: false,
            },
        ];
    },
    typescript: {
        // Enable type checking during builds
        ignoreBuildErrors: false,
    },
};

export default nextConfig;
