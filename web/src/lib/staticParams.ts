import { SUPPORTED_LANGUAGES, toShopifyLanguage } from './languageConfig';
import { getAllProducts, getAllCollections } from './shopify';

export async function getStaticLocaleParams() {
    return SUPPORTED_LANGUAGES.map((lang) => ({
        locale: lang.code,
    }));
}

export async function getProductStaticParams() {
    const params: { locale: string; handle: string }[] = [];

    for (const lang of SUPPORTED_LANGUAGES) {
        const shopifyLang = toShopifyLanguage(lang.code);
        // Fetch a large number to cover most catalogs. For very large catalogs, pagination would be needed.
        const products = await getAllProducts(250, shopifyLang);

        for (const product of products) {
            params.push({
                locale: lang.code,
                handle: product.handle,
            });
        }
    }

    return params;
}

export async function getCollectionStaticParams() {
    const params: { locale: string; handle: string }[] = [];

    for (const lang of SUPPORTED_LANGUAGES) {
        const shopifyLang = toShopifyLanguage(lang.code);
        const collections = await getAllCollections(250, shopifyLang);

        for (const collection of collections) {
            params.push({
                locale: lang.code,
                handle: collection.handle,
            });
        }
    }

    return params;
}
