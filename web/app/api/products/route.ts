import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/shopify';
import { getServerLanguage, toShopifyLanguage } from '@/lib/language';

export async function GET() {
    try {
        const language = await getServerLanguage();
        const shopifyLanguage = toShopifyLanguage(language);
        const products = await getAllProducts(100, shopifyLanguage);
        return NextResponse.json(products);
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
