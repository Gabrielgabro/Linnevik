# Login & Account Pages - i18n Solution

## The Challenge
Shopify manages authentication via cookies, but now you have language-specific URLs (`/sv/login`, `/en/login`). The session must work across both locales seamlessly.

## ✅ Recommended Solution: Language-Agnostic Cookies + Locale-Aware Redirects

### Key Principles:
1. **Authentication cookies work across all locales** (path: `/`)
2. **Redirects preserve the user's current language**
3. **No duplicate session management needed**

---

## Implementation

### 1. Helper Functions (Already Created)

File: `/src/lib/auth-helpers.ts`

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { normalizeLocale } from './i18n';
import type { Language } from './languageConfig';

export async function getCurrentLocale(): Promise<Language> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'sv';
  return normalizeLocale(locale);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get('shopify_customer_token')?.value;
  return !!token;
}

export async function redirectToLogin(locale?: Language) {
  const currentLocale = locale || await getCurrentLocale();
  redirect(`/${currentLocale}/login`);
}

export async function redirectToAccount(locale?: Language) {
  const currentLocale = locale || await getCurrentLocale();
  redirect(`/${currentLocale}/account`);
}

export async function redirectToHome(locale?: Language) {
  const currentLocale = locale || await getCurrentLocale();
  redirect(`/${currentLocale}`);
}
```

### 2. Update Login Page

File: `/app/[locale]/login/page.tsx`

```typescript
import type { Metadata } from 'next';
import LoginClient from './LoginClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { isAuthenticated, redirectToAccount } from '@/lib/auth-helpers';

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.login.metadata.title,
        description: t.login.metadata.description,
    };
}

export default async function LoginPage({ params }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);

    // Check if already logged in - redirect to account in same locale
    if (await isAuthenticated()) {
        redirectToAccount(locale);
    }

    return <LoginClient />;
}
```

### 3. Update LoginClient Component

File: `/app/[locale]/login/LoginClient.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { handleLogin, type LoginState } from './actions';
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';
import Button from '@/components/Button';

const initialState: LoginState = { status: 'idle' };

export default function LoginClient() {
    const [state, formAction] = useActionState(handleLogin, initialState);
    const { t, locale } = useTranslation();
    const router = useRouter();

    // Redirect to account page on successful login
    useEffect(() => {
        if (state.status === 'success') {
            // Use setTimeout to allow user to see success message
            const timer = setTimeout(() => {
                router.push(`/${locale}/account`);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [state.status, locale, router]);

    return (
        <main className="min-h-screen flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-md">
                {/* ... existing form UI ... */}

                <form action={formAction} className="space-y-5">
                    {/* ... existing fields ... */}

                    <div className="space-y-3 pt-2">
                        <Button type="submit" variant="primary" className="w-full">
                            {t.login.actions.signIn}
                        </Button>

                        {/* Use LocaleLink instead of <a> */}
                        <LocaleLink
                            href="/login/create-account"
                            className="inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 font-medium transition hover:bg-gray-50"
                        >
                            {t.login.actions.create}
                        </LocaleLink>
                    </div>
                </form>
            </div>
        </main>
    );
}
```

### 4. Update Login Actions (Optional Enhancement)

File: `/app/[locale]/login/actions.ts`

The actions already work correctly because:
- ✅ Cookies are set with `path: '/'` (works for all locales)
- ✅ Translations use `getActionTranslations()` which reads locale from cookies

**Optional improvement:** Add a comment for clarity:

```typescript
export async function handleLogin(_: LoginState, formData: FormData): Promise<LoginState> {
    // ... existing code ...

    try {
        const token = await createCustomerAccessToken(email, password);
        const expiresDate = new Date(token.expiresAt);

        const cookieStore = await cookies();

        // ✅ Language-agnostic cookie - works for /sv/account and /en/account
        cookieStore.set(COOKIE_NAME, token.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: expiresDate,
            path: '/', // 👈 Critical: works across all locales
        });

        return { status: 'success', message: t.login.messages.success };
    } catch (error) {
        // ... existing error handling ...
    }
}
```

### 5. Update Account Page

File: `/app/[locale]/account/page.tsx`

```typescript
import type { Metadata } from 'next';
import AccountClient from './AccountClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { isAuthenticated, redirectToLogin } from '@/lib/auth-helpers';

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.account.metadata.title,
        description: t.account.metadata.description,
    };
}

export default async function AccountPage({ params }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);

    // Require authentication - redirect to login in same locale if not logged in
    if (!await isAuthenticated()) {
        redirectToLogin(locale);
    }

    return <AccountClient />;
}
```

### 6. Update Logout Action

File: `/app/[locale]/account/actions.ts` (or wherever logout is)

```typescript
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function logout(locale: string = 'sv') {
    const cookieStore = await cookies();

    // Clear all auth cookies
    cookieStore.delete('shopify_customer_token');
    cookieStore.delete('customer_access_token');

    // Redirect to home in current locale
    redirect(`/${locale}`);
}
```

Usage in AccountClient:
```typescript
'use client';

import { logout } from './actions';
import { useTranslation } from '@/contexts/LocaleContext';

export default function AccountClient() {
    const { t, locale } = useTranslation();

    const handleLogout = async () => {
        await logout(locale); // Pass current locale
    };

    return (
        <div>
            {/* ... account UI ... */}
            <button onClick={handleLogout}>
                {t.account.logout}
            </button>
        </div>
    );
}
```

---

## How It Works

### Scenario 1: User logs in via `/sv/login`
1. User submits credentials
2. Action creates Shopify token, sets cookie with `path: '/'`
3. Cookie is accessible from **both** `/sv/*` and `/en/*`
4. Client redirects to `/sv/account`
5. ✅ User sees Swedish account page

### Scenario 2: Logged-in user switches language
1. User clicks language switcher on `/sv/account`
2. URL changes to `/en/account`
3. Same cookie is valid (path: '/')
4. ✅ User sees English account page, still logged in

### Scenario 3: Protected route access
1. User visits `/en/products/something` (requires auth)
2. Server checks `isAuthenticated()` → false
3. Server redirects to `/en/login` (preserves language)
4. ✅ User sees English login page

---

## Benefits

✅ **Single session across all languages** - No duplicate login needed
✅ **Language preserved** - Redirects maintain user's language choice
✅ **Shopify-native** - Works perfectly with Shopify's auth system
✅ **SEO-friendly** - Each locale has its own login/account URL
✅ **Simple implementation** - Minimal code changes needed

---

## Testing Checklist

- [ ] Login at `/sv/login` → redirects to `/sv/account`
- [ ] Login at `/en/login` → redirects to `/en/account`
- [ ] Switch language on account page → stays logged in
- [ ] Logout from `/sv/account` → redirects to `/sv`
- [ ] Logout from `/en/account` → redirects to `/en`
- [ ] Visit `/sv/account` logged out → redirects to `/sv/login`
- [ ] Visit `/en/account` logged out → redirects to `/en/login`
- [ ] Cookie works for cart across languages
- [ ] Registration flow works in both languages

---

## Common Pitfalls to Avoid

❌ **DON'T** create separate cookies for each language
❌ **DON'T** hard-code redirects like `redirect('/account')`
❌ **DON'T** use `<a href="/login">` - use `<LocaleLink href="/login">`
❌ **DON'T** forget to pass locale to server actions

✅ **DO** use `path: '/'` for auth cookies
✅ **DO** use helper functions for redirects
✅ **DO** use `LocaleLink` for all internal links
✅ **DO** pass locale from client components to server actions

---

## Quick Reference

### Get current user's locale in server action:
```typescript
const cookieStore = await cookies();
const locale = cookieStore.get('NEXT_LOCALE')?.value || 'sv';
```

### Redirect with locale preservation:
```typescript
import { redirectToAccount } from '@/lib/auth-helpers';

// In server component
redirectToAccount(locale);

// In client component via server action
await logout(locale);
```

### Check authentication:
```typescript
import { isAuthenticated } from '@/lib/auth-helpers';

if (!await isAuthenticated()) {
    redirectToLogin(locale);
}
```
