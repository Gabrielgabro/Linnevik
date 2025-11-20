import { NextRequest, NextResponse } from 'next/server';
import { getProductsBasic } from '@/lib/shopify';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ products: [] });
    }

    try {
        // Läs språk från cookie
        const cookieStore = await cookies();
        const locale = cookieStore.get('NEXT_LOCALE')?.value;
        const language = (locale === 'en' || locale === 'sv') ? locale.toUpperCase() as 'SV' | 'EN' : 'SV';

        const products = await getProductsBasic(10, query.trim(), language);
        return NextResponse.json({ products });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json(
            { error: 'Search failed' },
            { status: 500 }
        );
    }
}
