# Shopify Customer Account API - Authentication Setup

This guide explains how to set up OAuth 2.0 authentication with Shopify's Customer Account API.

## Overview

The authentication flow uses **OAuth 2.0 with PKCE** (Proof Key for Code Exchange) for secure, passwordless customer authentication.

### Flow:
1. User clicks "Login" → Redirected to `/login`
2. Click "Continue to Shopify" → Redirected to Shopify's hosted login page
3. Customer enters email → Shopify sends verification code
4. Customer enters code → Shopify authenticates and redirects back
5. Callback handler exchanges code for access token → Redirect to `/account`

## Required Environment Variables

Add these to your `web/.env.local` file:

```bash
# Shopify Store Domain (already exists)
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com

# Customer Account API OAuth Credentials (NEW - REQUIRED)
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID=shp_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET=shpcs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Base URL for OAuth redirects
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
# For local development:
# NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Setup Steps in Shopify Admin

### 1. Enable Customer Accounts

1. Go to **Shopify Admin** → **Settings** → **Customer accounts**
2. Select **"New customer accounts"** (not Classic)
3. Enable **"Required" or "Optional"**
4. Save changes

### 2. Install Headless or Hydrogen Sales Channel

1. Go to **Shopify Admin** → **Apps**
2. Search for **"Headless"** in the Shopify App Store
3. Install **"Headless"** sales channel
4. This unlocks Customer Account API access

### 3. Get OAuth Credentials

1. Go to **Shopify Admin** → **Settings** → **Customer Account API**
   - Or navigate to: `https://admin.shopify.com/store/YOUR_STORE/settings/customer_accounts/api`
2. Click **"Create application"** or **"Manage application"**
3. Fill in application details:
   - **Application name**: Your site name (e.g., "Linnevik Website")
   - **Application URL**: Your website URL
   - **Redirect URIs**: Add your callback URL:
     - Production: `https://yourdomain.com/api/auth/callback`
     - Development: `http://localhost:3000/api/auth/callback`
4. Save and copy the credentials:
   - **Client ID** → `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID`
   - **Client Secret** → `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET`

### 4. Configure Scopes

The application uses these OAuth scopes:
- `openid` - Basic authentication
- `email` - Customer email address
- `profile` - Customer profile information

These are configured in `web/src/lib/customerAccountAuth.ts`

## Local Development with ngrok

Since Shopify requires HTTPS redirect URIs, use ngrok for local testing:

```bash
# Install ngrok
npm install -g ngrok

# Start your dev server
npm run dev

# In another terminal, start ngrok
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update .env.local:
NEXT_PUBLIC_BASE_URL=https://abc123.ngrok.io

# Add to Shopify redirect URIs:
https://abc123.ngrok.io/api/auth/callback
```

## File Structure

```
web/
├── app/
│   ├── login/
│   │   ├── page.tsx              # Login page (checks if already logged in)
│   │   ├── LoginClient.tsx       # Login UI (redirect to Shopify)
│   │   └── actions.ts            # Server actions (get auth URL)
│   ├── account/
│   │   ├── page.tsx              # Account page (protected)
│   │   └── AccountClient.tsx     # Account UI (VAT + orders)
│   └── api/
│       └── auth/
│           └── callback/
│               └── route.ts       # OAuth callback handler
├── src/
│   └── lib/
│       ├── customerAccountAuth.ts  # OAuth 2.0 flow with PKCE
│       ├── customerAccount.ts      # Customer Account API queries
│       └── shopifyAdmin.ts         # Admin API (VAT metafield)
└── .env.local                     # Environment variables
```

## Security Features

✅ **PKCE (Proof Key for Code Exchange)** - Prevents authorization code interception
✅ **State parameter** - CSRF protection
✅ **HTTP-only cookies** - XSS protection
✅ **Secure cookies in production** - HTTPS only
✅ **Short-lived OAuth state** - 10-minute expiry
✅ **Token validation** - State verification on callback

## Testing the Flow

1. **Start development server**:
   ```bash
   cd web
   npm run dev
   ```

2. **Visit login page**: `http://localhost:3000/login`

3. **Click "Continue to Shopify"** → Should redirect to Shopify's login page

4. **Enter email** → Shopify sends verification code

5. **Enter code** → Should redirect back to `/account` page

## Troubleshooting

### "Authorization failed"
- Check that `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` is correct
- Verify redirect URI matches exactly in Shopify admin

### "Token exchange failed"
- Check that `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET` is correct
- Ensure Customer Account API is enabled in Shopify

### "Redirect URI mismatch"
- Verify `NEXT_PUBLIC_BASE_URL` matches your Shopify redirect URI configuration
- Check for trailing slashes (should NOT have one)

### "Customer Account API not available"
- Install the Headless sales channel in Shopify admin
- Enable "New customer accounts" (not Classic)

## Production Deployment

1. **Add production redirect URI** in Shopify admin:
   ```
   https://yourdomain.com/api/auth/callback
   ```

2. **Set production environment variables** in Vercel/hosting:
   ```bash
   NEXT_PUBLIC_BASE_URL=https://yourdomain.com
   SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID=shp_...
   SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET=shpcs_...
   ```

3. **Test authentication** on production domain

## Additional Resources

- [Shopify Customer Account API Docs](https://shopify.dev/docs/custom-storefronts/building-with-the-customer-account-api)
- [OAuth 2.0 with PKCE](https://oauth.net/2/pkce/)
- [Customer Account API GraphQL Reference](https://shopify.dev/docs/api/customer)
