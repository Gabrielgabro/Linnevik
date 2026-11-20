import { Libre_Baskerville, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { CartProvider } from "@/contexts/CartContext";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import VisitLogger from "@/components/VisitLogger";

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

/**
 * `<html>` och `<body>` för sajtens två rot-layouter: butiken under
 * `app/[locale]` och adminvyn under `app/admin`.
 *
 * Förr fanns en enda rot-layout i `app/layout.tsx`. Den visste inte vilket
 * språk sidan hade och läste därför `headers()`, där proxyn hade lagt språket.
 * Det gjorde varje sida på sajten dynamisk, så ingenting kunde cachas. Nu får
 * butikens rot-layout språket ur URL:en (`[locale]`), och då kan de publika
 * sidorna förrenderas.
 */
export default function DocumentShell({
    lang,
    children,
}: {
    lang: string;
    children: React.ReactNode;
}) {
    return (
        <html lang={lang} dir="ltr" suppressHydrationWarning>
            <body className={`${libreBaskerville.variable} ${inter.variable}`}>
                <CartProvider>
                    {children}
                </CartProvider>
                <SpeedInsights />
                <Analytics />
                <GoogleAnalytics />
                <VisitLogger />
            </body>
        </html>
    );
}
