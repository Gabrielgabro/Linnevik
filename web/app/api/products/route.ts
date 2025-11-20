import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/shopify';
import { cookies } from 'next/headers';

export async function GET() {
    try {
        // Läs språk från cookie
        const cookieStore = await cookies();
        const locale = cookieStore.get('NEXT_LOCALE')?.value;
        const language = (locale === 'en' || locale === 'sv') ? locale.toUpperCase() as 'SV' | 'EN' : 'SV';

        const products = await getAllProducts(100, language);
        return NextResponse.json(products);
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
