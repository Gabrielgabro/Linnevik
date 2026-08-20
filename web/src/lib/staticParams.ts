import { SUPPORTED_LANGUAGES } from './languageConfig';
import { listCollectionHandles, listProductHandles } from './catalogDb';

export async function getStaticLocaleParams() {
    return SUPPORTED_LANGUAGES.map((lang) => ({
        locale: lang.code,
    }));
}

// Produkterna kommer ur vår egen tabell — samma källa som sidan sedan läser.
// Handlarna är språkoberoende, så listan hämtas en gång och paras ihop med
// varje språk, precis som kategorierna nedan.
export async function getProductStaticParams() {
    const handles = await listProductHandles();

    return SUPPORTED_LANGUAGES.flatMap((lang) =>
        handles.map((handle) => ({ locale: lang.code, handle }))
    );
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
