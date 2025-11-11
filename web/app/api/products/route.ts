import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/shopify';

export async function GET() {
    try {
        const products = await getAllProducts();
        return NextResponse.json(products);
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
