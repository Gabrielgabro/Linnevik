import { NextRequest, NextResponse } from 'next/server';
import { getServerLanguage } from '@/lib/language';
import { listCatalogProductCards } from '@/lib/catalogDb';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const localeParam = searchParams.get('locale');

        let language = await getServerLanguage();
        if (localeParam === 'en' || localeParam === 'sv') {
            language = localeParam;
        }
        const products = await listCatalogProductCards(language, 100);
        return NextResponse.json(products);
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
