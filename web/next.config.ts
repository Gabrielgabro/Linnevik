import type { NextConfig } from "next";


const nextConfig: NextConfig = {
    images: {
        remotePatterns: [{ protocol: 'https', hostname: 'cdn.shopify.com', pathname: '/**' }],
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
                permanent: false,
            },
            // Redirect Shopify activation links (no locale) to Swedish default
            {
                source: '/account/activate/:id/:token',
                destination: '/sv/account/activate/:id/:token',
                permanent: false,
            },
        ];
    },
    eslint: {
        // Ignore ESLint during production builds on Vercel to avoid config conflicts
        ignoreDuringBuilds: true,
    },
    typescript: {
        // Enable type checking during builds
        ignoreBuildErrors: false,
    },
};

export default nextConfig;
