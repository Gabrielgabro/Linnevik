import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

const lightFavicon = "/brand/favicon_in_black.png";
const darkFavicon = "/brand/favicon_in_white.png";
const faviconSize = "256x256";

const favicons = [
    { url: lightFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: light)" },
    { url: darkFavicon, type: "image/png", sizes: faviconSize, media: "(prefers-color-scheme: dark)" },
];

/**
 * Det som förr stod i `app/layout.tsx`: standardtitel, beskrivning och
 * favikoner. Båda rot-layouterna (butiken och adminvyn) utgår från det.
 */
export const baseMetadata: Metadata = {
    title: "Linnevik",
    description: "Linnevik supplies durable textiles for hotels and hospitality spaces.",
    metadataBase: new URL(SITE_URL),
    icons: {
        icon: favicons,
        shortcut: favicons,
        apple: favicons,
    },
};
