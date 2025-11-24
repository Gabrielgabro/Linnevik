import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/customerAccountAuth';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
        console.error('[auth-callback] OAuth error:', error);
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }

    // Validate required parameters
    if (!code || !state) {
        console.error('[auth-callback] Missing code or state');
        return NextResponse.redirect(new URL('/login?error=invalid_params', request.url));
    }

    // Exchange authorization code for access token
    const result = await exchangeCodeForToken(code, state);

    if (!result) {
        console.error('[auth-callback] Token exchange failed');
        return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.url));
    }

    console.log('[auth-callback] Authentication successful');

    // Redirect to account page
    return NextResponse.redirect(new URL('/account', request.url));
}
