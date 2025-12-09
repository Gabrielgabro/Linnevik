import type { Metadata } from "next";
import { Libre_Baskerville, Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/contexts/CartContext";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import GoogleAnalytics from "@/components/GoogleAnalytics";

// Serif font for headings - elegant and refined
const libreBaskerville = Libre_Baskerville({
    variable: "--font-heading",
    subsets: ["latin"],
    weight: ["400", "700"],
    display: "swap",
});

// Sans-serif font for body text - clean and readable
const inter = Inter({
    variable: "--font-body",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
});

const lightFavicon = "/brand/favicon_in_black.png";
const darkFavicon = "/brand/favicon_in_white.png";
const faviconSize = "256x256";

export const metadata: Metadata = {
    title: "Linnevik",
    description: "Linnevik supplies durable textiles for hotels and hospitality spaces.",
    metadataBase: new URL('https://linnevik.se'),
    icons: {
        icon: [
            { url: lightFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: light)" },
            { url: darkFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: dark)" },
        ],
        shortcut: [
            { url: lightFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: light)" },
            { url: darkFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: dark)" },
        ],
        apple: [
            { url: lightFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: light)" },
            { url: darkFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: dark)" },
        ],
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html dir="ltr" suppressHydrationWarning>
            <body className={`${libreBaskerville.variable} ${inter.variable}`}>
                <CartProvider>
                    {children}
                </CartProvider>
                <SpeedInsights />
                <Analytics />
                <GoogleAnalytics />
            </body>
        </html>
    );
}
