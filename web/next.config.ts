import type { NextConfig } from "next";


const nextConfig: NextConfig = {
    images: {
        remotePatterns: [{ protocol: 'https', hostname: 'cdn.shopify.com', pathname: '/**' }],
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