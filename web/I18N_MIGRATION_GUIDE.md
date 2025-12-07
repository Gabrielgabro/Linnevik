# i18n Migration Guide - URL-based Locales

## ✅ What's Been Completed

1. **Core Infrastructure**
   - ✅ Next.js redirects configured (/, /products)
   - ✅ Middleware for locale detection
   - ✅ [locale] folder structure created
   - ✅ LocaleContext replaces LanguageContext
   - ✅ LocaleLink component for locale-aware links
   - ✅ LanguageSwitcher for URL-based switching
   - ✅ Header component fully updated

2. **New Files Created**
   - `/middleware.ts` - Handles locale detection and redirects
   - `/src/lib/i18n.ts` - Server-side i18n helpers
   - `/src/contexts/LocaleContext.tsx` - Client-side locale context
   - `/src/components/LocaleLink.tsx` - Locale-aware Link component
   - `/src/components/LanguageSwitcher.tsx` - New language switcher
   - `/app/[locale]/layout.tsx` - Locale layout provider

3. **Import Updates**
   - ✅ All `from '@/hooks/useTranslation'` → `from '@/contexts/LocaleContext'`

## 🔧 Remaining Work

### 1. Update All Page Components

Every page in `app/[locale]/*/page.tsx` needs to:

#### Pattern for Server Components:
```typescript
// BEFORE
export default async function Page() {
  const language = await getServerLanguage();
  // ...
}

// AFTER
type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const shopifyLang = toShopifyLanguage(locale);
  // ...
}
```

#### Pages to Update:
- ✅ `/app/[locale]/search/page.tsx` - DONE
- `/app/[locale]/page.tsx` - Home page
- `/app/[locale]/about/page.tsx`
- `/app/[locale]/contact/page.tsx`
- `/app/[locale]/cart/page.tsx`
- `/app/[locale]/collections/page.tsx`
- `/app/[locale]/collections/[handle]/page.tsx`
- `/app/[locale]/products/[handle]/page.tsx`
- `/app/[locale]/samples/page.tsx`
- `/app/[locale]/samples/checkout/page.tsx`
- `/app/[locale]/login/page.tsx`
- `/app/[locale]/login/create-account/page.tsx`
- `/app/[locale]/login/verify-email/page.tsx`
- `/app/[locale]/account/page.tsx`
- `/app/[locale]/cookie-policy/page.tsx`
- `/app/[locale]/cookie-settings/page.tsx`
- `/app/[locale]/terms/page.tsx`
- `/app/[locale]/thank-you/page.tsx`

### 2. Update Footer Component

Similar to Header updates:

```typescript
// /src/sections/Footer.tsx
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';
import LanguageSwitcher from '@/components/LanguageSwitcher';

// Replace all <Link> with <LocaleLink>
// Replace <LanguageSelector> with <LanguageSwitcher>
```

### 3. Update Components with Internal Links

Search for components using `<Link href="..."` and update to `<LocaleLink>`:

```bash
# Find all components with Link
grep -r "import Link" src/sections src/components --include="*.tsx"
```

Common components to check:
- `/src/sections/CategoriesTeaser.tsx`
- `/src/sections/FeaturedGrid.tsx`
- `/src/sections/SampleCTA.tsx`
- `/src/components/ProductCard.tsx`
- `/src/components/Breadcrumbs.tsx`

### 4. Update API Routes

API routes in `app/api/*` may need updates if they use language detection:

```typescript
// BEFORE
const language = await getServerLanguage();

// AFTER
const locale = cookies().get('NEXT_LOCALE')?.value || 'sv';
```

### 5. Add Proper Metadata with hreflang

Update each page's metadata:

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = getTranslations(locale);

  return {
    title: t.pageTitleHere,
    description: t.pageDescriptionHere,
    alternates: {
      canonical: `https://linnevik.se/${locale}/page-path`,
      languages: {
        'sv': 'https://linnevik.se/sv/page-path',
        'en': 'https://linnevik.se/en/page-path',
      },
    },
  };
}
```

### 6. Delete Old Files

Once everything works:
```bash
rm src/contexts/LanguageContext.tsx
rm src/components/LanguageSelector.tsx
rm src/lib/language.ts  # If it only contained getServerLanguage
rm src/hooks/useTranslation.ts
```

### 7. Testing Checklist

- [ ] Visit `/` → redirects to `/sv`
- [ ] Visit `/sv` → Shows Swedish content
- [ ] Visit `/en` → Shows English content
- [ ] Language switcher changes URL
- [ ] All internal links include locale
- [ ] Shopify products load in correct language
- [ ] Cart works in both languages
- [ ] Search works in both languages
- [ ] Login/account pages work
- [ ] Forms submit correctly

## Quick Reference

### Get translations in server components:
```typescript
import { getTranslations } from '@/lib/i18n';

const t = getTranslations(locale);
```

### Get translations in client components:
```typescript
import { useTranslation } from '@/contexts/LocaleContext';

const { t, locale, shopifyLanguage } = useTranslation();
```

### Create locale-aware links:
```typescript
import { LocaleLink } from '@/components/LocaleLink';

<LocaleLink href="/about">About</LocaleLink>
// Renders: /sv/about or /en/about based on current locale
```

### Switch languages:
```typescript
import LanguageSwitcher from '@/components/LanguageSwitcher';

<LanguageSwitcher /> // Header variant
<LanguageSwitcher variant="footer" /> // Footer variant
```

## Common Patterns

### Pattern 1: Simple Page
```typescript
import { getTranslations, normalizeLocale } from '@/lib/i18n';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  const t = getTranslations(locale);

  return (
    <div>
      <h1>{t.pageTitle}</h1>
    </div>
  );
}
```

### Pattern 2: Page with Shopify Data
```typescript
import { normalizeLocale } from '@/lib/i18n';
import { toShopifyLanguage } from '@/lib/languageConfig';
import { getProductByHandle } from '@/lib/shopify';

type Props = {
  params: Promise<{ locale: string; handle: string }>;
};

export default async function ProductPage({ params }: Props) {
  const { locale: localeParam, handle } = await params;
  const locale = normalizeLocale(localeParam);
  const shopifyLang = toShopifyLanguage(locale);

  const product = await getProductByHandle(handle, shopifyLang);

  return <div>{/* ... */}</div>;
}
```

### Pattern 3: Client Component
```typescript
'use client';

import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

export default function MyComponent() {
  const { t, locale } = useTranslation();

  return (
    <div>
      <h2>{t.heading}</h2>
      <LocaleLink href="/products">
        {t.viewProducts}
      </LocaleLink>
    </div>
  );
}
```

## SEO Benefits

Once complete, you'll have:
- ✅ Separate URLs for each language (`/sv/about`, `/en/about`)
- ✅ Proper hreflang tags for international SEO
- ✅ Language-specific sitemaps possible
- ✅ Better geographic targeting in Google Search Console
- ✅ Shareable language-specific links
- ✅ Crawlable language variants

## Troubleshooting

### "useLocale must be used within LocaleProvider"
- Server component trying to use `useTranslation()`
- Solution: Use `getTranslations(locale)` instead

### "params is a Promise"
- Next.js 15 changed params to async
- Solution: `const { locale } = await params;`

### Links don't include locale
- Using `<Link>` instead of `<LocaleLink>`
- Solution: Import and use `LocaleLink`

### Language doesn't switch
- Using old `LanguageSelector`
- Solution: Use new `LanguageSwitcher`
