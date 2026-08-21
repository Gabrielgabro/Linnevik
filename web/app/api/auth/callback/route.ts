import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    return NextResponse.redirect(new URL('/sv/login', request.url), 308);
}
