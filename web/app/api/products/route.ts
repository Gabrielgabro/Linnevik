import { NextRequest, NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/shopify';
import { getServerLanguage, toShopifyLanguage } from '@/lib/language';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const localeParam = searchParams.get('locale');

        let language = await getServerLanguage();
        if (localeParam === 'en' || localeParam === 'sv') {
            language = localeParam;
        }
        const shopifyLanguage = toShopifyLanguage(language);
        const products = await getAllProducts(100, shopifyLanguage);
        return NextResponse.json(products);
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
