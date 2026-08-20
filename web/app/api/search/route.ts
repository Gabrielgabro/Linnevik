import { NextRequest, NextResponse } from 'next/server';
import { searchCatalogProducts } from '@/lib/catalogDb';
import { getServerLanguage } from '@/lib/language';
import { isSupportedLanguage, type Language } from '@/lib/languageConfig';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const langParam = searchParams.get('lang') || searchParams.get('locale');

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ products: [] });
    }

    try {
        const language: Language =
            langParam && isSupportedLanguage(langParam)
                ? langParam
                : await getServerLanguage();
        const products = await searchCatalogProducts(query.trim(), language, 10);

        return NextResponse.json({ products });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json(
            { error: 'Search failed' },
            { status: 500 }
        );
    }
}
