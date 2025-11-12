import { NextRequest, NextResponse } from 'next/server';
import { getProductsBasic } from '@/lib/shopify';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ products: [] });
    }

    try {
        const products = await getProductsBasic(10, query.trim());
        return NextResponse.json({ products });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json(
            { error: 'Search failed' },
            { status: 500 }
        );
    }
}
