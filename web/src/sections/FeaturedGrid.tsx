import FeaturedGridClient from './FeaturedGridClient';
import { getCollectionPage, listCatalogProductCards } from '@/lib/catalogDb';

import { normalizeLocale } from "@/lib/i18n";

export default async function FeaturedGrid({ locale }: { locale: string }) {
    // const language = await getServerLanguage();
    const language = normalizeLocale(locale);
    const featured = await getCollectionPage('featured', language, { limit: 6 });
    const shown = featured?.products ?? (await listCatalogProductCards(language, 6));

    return <FeaturedGridClient products={shown} />;
}
