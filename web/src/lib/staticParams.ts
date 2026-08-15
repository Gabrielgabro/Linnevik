import { SUPPORTED_LANGUAGES, toShopifyLanguage } from './languageConfig';
import { getAllProducts } from './shopify';
import { listCollectionHandles } from './catalogDb';

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

// Kategorierna kommer ur vår egen tabell — samma källa som sidan sedan läser.
// Handlarna är språkoberoende, så listan hämtas en gång och paras ihop med
// varje språk.
export async function getCollectionStaticParams() {
    const handles = await listCollectionHandles();

    return SUPPORTED_LANGUAGES.flatMap((lang) =>
        handles.map((handle) => ({ locale: lang.code, handle }))
    );
}
