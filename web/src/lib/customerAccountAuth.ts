/**
 * Shopify Customer Account API - OAuth 2.0 Authentication
 * Uses authorization code flow with PKCE for secure authentication
 */

import { cookies } from 'next/headers';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const CLIENT_ID = process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`
    : 'http://localhost:3000/api/auth/callback';

if (!SHOPIFY_DOMAIN) {
    throw new Error('SHOPIFY_STORE_DOMAIN is required');
}

/**
 * Generate a random string for OAuth state parameter
 */
function generateState(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePKCE() {
    const verifier = generateState() + generateState(); // 64 chars

    // Create SHA-256 hash of verifier
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Base64 URL encode the hash
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const challenge = btoa(String.fromCharCode(...hashArray))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    return { verifier, challenge };
}

/**
 * Get the authorization URL to redirect the customer to Shopify's login
 */
export async function getAuthorizationUrl(): Promise<string> {
    const state = generateState();
    const { verifier, challenge } = await generatePKCE();

    // Store state and verifier in cookies for verification later
    const cookieStore = await cookies();
    cookieStore.set('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
    });

    cookieStore.set('oauth_code_verifier', verifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
    });

    // Build authorization URL
    const authUrl = new URL(`https://${SHOPIFY_DOMAIN}/account/customer/api/unstable/oauth/authorize`);

    const params = {
        scope: 'openid email profile',
        client_id: CLIENT_ID || '',
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    };

    Object.entries(params).forEach(([key, value]) => {
        authUrl.searchParams.append(key, value);
    });

    return authUrl.toString();
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string, state: string): Promise<{
    accessToken: string;
    expiresAt: Date;
} | null> {
    const cookieStore = await cookies();
    const storedState = cookieStore.get('oauth_state')?.value;
    const codeVerifier = cookieStore.get('oauth_code_verifier')?.value;

    // Verify state to prevent CSRF
    if (!storedState || storedState !== state) {
        console.error('[auth] OAuth state mismatch');
        return null;
    }

    if (!codeVerifier) {
        console.error('[auth] Code verifier not found');
        return null;
    }

    try {
        const tokenUrl = `https://${SHOPIFY_DOMAIN}/account/customer/api/unstable/oauth/token`;

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID || '',
            client_secret: CLIENT_SECRET || '',
            redirect_uri: REDIRECT_URI,
            code,
            code_verifier: codeVerifier,
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[auth] Token exchange failed:', response.status, errorText);
            return null;
        }

        const data = await response.json();

        if (!data.access_token) {
            console.error('[auth] No access token in response');
            return null;
        }

        // Calculate expiry (default to 30 days if not provided)
        const expiresIn = data.expires_in || 2592000; // 30 days in seconds
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        // Store the access token
        cookieStore.set('customer_access_token', data.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: expiresAt,
            path: '/',
        });

        // Clean up OAuth cookies
        cookieStore.delete('oauth_state');
        cookieStore.delete('oauth_code_verifier');

        return {
            accessToken: data.access_token,
            expiresAt,
        };
    } catch (error) {
        console.error('[auth] Token exchange error:', error);
        return null;
    }
}

/**
 * Get current customer access token from cookies
 */
export async function getCustomerToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get('customer_access_token')?.value || null;
}

/**
 * Logout - clear authentication token
 */
export async function clearCustomerToken(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete('customer_access_token');
    cookieStore.delete('shopify_customer_token');
}

/**
 * Create a session from an access token (e.g. after password activation)
 */
export async function createSession(accessToken: string, expiresAt: string | Date) {
    const cookieStore = await cookies();
    const expiryDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;

    cookieStore.set('customer_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiryDate,
        path: '/',
    });
}
