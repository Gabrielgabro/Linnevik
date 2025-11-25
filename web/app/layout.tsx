import type { Metadata } from "next";
import { Libre_Baskerville, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/sections/Header";
import Footer from "@/sections/Footer";
import HomePageBubbles from "@/components/HomePageBubbles";
import { CookieBanner } from "@/components/CookieBanner";
import { CartProvider } from "@/contexts/CartContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

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

export const metadata: Metadata = {
    title: "Linnevik",
    description: "Linnevik supplies durable textiles for hotels and hospitality spaces.",
    icons: {
        icon: [
            { url: "/brand/favicon_in_black.png", type: "image/png", media: "(prefers-color-scheme: light)" },
            { url: "/brand/favicon_in_white.png", type: "image/png", media: "(prefers-color-scheme: dark)" },
        ],
        shortcut: "/brand/favicon_in_black.png",
        apple: [
            { url: "/brand/favicon_in_black.png", type: "image/png", media: "(prefers-color-scheme: light)" },
            { url: "/brand/favicon_in_white.png", type: "image/png", media: "(prefers-color-scheme: dark)" },
        ],
    },
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    ],
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="sv">
        <body className={`${libreBaskerville.variable} ${inter.variable}`}>
        <LanguageProvider>
            <CartProvider>
                <HomePageBubbles />
                <Header />
                {children}
                <Footer />
                <CookieBanner />
            </CartProvider>
        </LanguageProvider>
        </body>
        </html>
    );
}
