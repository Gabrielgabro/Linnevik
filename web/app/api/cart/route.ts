import { NextResponse } from 'next/server';

/** Legacy Shopify cart endpoint. Kept as an explicit tombstone for old clients. */
export async function POST() {
  return NextResponse.json(
    { error: 'The legacy cart has been retired. Use /api/store/cart.' },
    { status: 410 }
  );
}
