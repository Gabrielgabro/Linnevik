# i18n Migration Analysis - Current Status

**Date:** 2025-12-07
**Status:** 🟡 Partially Complete - Build Failing

---

## 🔴 Critical Issues (Build Blockers)

### 1. Client Components with Metadata Exports
**Impact:** Build fails completely

**Affected Files:**
- `/app/[locale]/cart/page.tsx`
- `/app/[locale]/contact/page.tsx`
- `/app/[locale]/samples/page.tsx`
- `/app/[locale]/samples/checkout/page.tsx`
- `/app/[locale]/thank-you/page.tsx`

**Problem:** These files have `'use client'` directive but also export `metadata`, which is not allowed in Next.js.

**Solution:** Remove `'use client'` and split into server + client components:

```typescript
// ✅ CORRECT Pattern
// page.tsx (Server Component)
import { Metadata } from 'next';
import ClientComponent from './ClientComponent';

export const metadata: Metadata = { /* ... */ };

export default function Page() {
  return <ClientComponent />;
}

// ClientComponent.tsx
'use client';
export default function ClientComponent() {
  // client logic here
}
```

---

## 🟡 High Priority Issues

### 2. Hardcoded Links Without Locale
**Impact:** Links won't work correctly, users will hit middleware redirects

**Affected Components:**
- `/src/sections/Hero.tsx` - `href="/collections"`
- `/src/sections/SampleCTA.tsx` - `href="/samples"`
- `/src/sections/AlternativFooter.tsx` - Multiple hardcoded links
- `/src/components/SearchPageClient.tsx` - `href="/collections"`
- `/src/components/CookieBanner.tsx` - `href="/cookie-policy"`

**Problem:** Using hardcoded paths like `/collections` instead of locale-aware links

**Solution:** Replace with `LocaleLink`:
```typescript
// ❌ WRONG
<a href="/collections">Products</a>

// ✅ CORRECT
import { LocaleLink } from '@/components/LocaleLink';
<LocaleLink href="/collections">Products</LocaleLink>
```

### 3. Components Still Using `Link` from next/link
**Impact:** Internal links won't include locale

**Affected Files:**
- `/src/components/ProductForm.tsx`
- `/src/components/LanguageSwitcher.tsx` (This one is OK - it needs next/link for language switching)

**Solution:**
```typescript
// Change import
import Link from 'next/link';              // ❌
import { LocaleLink } from '@/components/LocaleLink'; // ✅

// Update usage
<Link href="/path">...</Link>              // ❌
<LocaleLink href="/path">...</LocaleLink>  // ✅
```

### 4. Pages Using Old Language Imports
**Impact:** Inconsistent imports, potential runtime errors

**Affected Files:**
- `/app/[locale]/products/[handle]/page.tsx` - `import { toShopifyLanguage } from '@/lib/language'`
- `/app/[locale]/cookie-policy/page.tsx` - `import { type Language } from '@/lib/language'`
- `/app/[locale]/terms/page.tsx` - `import { type Language } from '@/lib/language'`

**Solution:** Update imports:
```typescript
// ❌ OLD
import { toShopifyLanguage, type Language } from '@/lib/language';

// ✅ NEW
import { toShopifyLanguage, type Language } from '@/lib/languageConfig';
```

---

## 🟢 Completed Successfully

### ✅ Core Infrastructure
- [x] Next.js redirects configured
- [x] Middleware created and working
- [x] `[locale]` folder structure created
- [x] All pages moved to `[locale]` directory
- [x] LocaleContext created
- [x] LocaleLink component created
- [x] LanguageSwitcher component created

### ✅ Major Components Updated
- [x] Header component - fully migrated
- [x] Footer component - fully migrated
- [x] All `useTranslation` imports updated to use LocaleContext

### ✅ Helper Files Created
- [x] `/src/lib/i18n.ts` - Server-side translation helpers
- [x] `/src/contexts/LocaleContext.tsx` - Client-side locale context
- [x] `/src/components/LocaleLink.tsx` - Locale-aware Link wrapper
- [x] `/src/components/LanguageSwitcher.tsx` - URL-based language switcher
- [x] `/src/lib/auth-helpers.ts` - Locale-aware auth redirects

---

## 📋 Complete Task List

### 🔴 Must Fix (Build Blockers)
- [ ] Fix cart/page.tsx - Remove 'use client' or split component
- [ ] Fix contact/page.tsx - Remove 'use client' or split component
- [ ] Fix samples/page.tsx - Remove 'use client' or split component
- [ ] Fix samples/checkout/page.tsx - Remove 'use client' or split component
- [ ] Fix thank-you/page.tsx - Remove 'use client' or split component

### 🟡 High Priority (Functionality)
- [ ] Update Hero.tsx - Replace Link with LocaleLink
- [ ] Update SampleCTA.tsx - Replace Link with LocaleLink
- [ ] Update AlternativFooter.tsx - Replace all Links with LocaleLink
- [ ] Update SearchPageClient.tsx - Replace Link with LocaleLink
- [ ] Update CookieBanner.tsx - Replace <a> with LocaleLink
- [ ] Update ProductForm.tsx - Replace Link with LocaleLink
- [ ] Update products/[handle]/page.tsx - Fix import from '@/lib/language'
- [ ] Update cookie-policy/page.tsx - Fix import from '@/lib/language'
- [ ] Update terms/page.tsx - Fix import from '@/lib/language'

### 🟢 Medium Priority (Pages Need Params)
Most pages need to accept and use `params: Promise<{ locale: string }>`:

- [ ] `/app/[locale]/about/page.tsx`
- [ ] `/app/[locale]/account/page.tsx`
- [ ] `/app/[locale]/cart/page.tsx`
- [ ] `/app/[locale]/collections/page.tsx`
- [ ] `/app/[locale]/collections/[handle]/page.tsx`
- [ ] `/app/[locale]/contact/page.tsx`
- [ ] `/app/[locale]/cookie-policy/page.tsx`
- [ ] `/app/[locale]/login/create-account/page.tsx`
- [ ] `/app/[locale]/login/verify-email/page.tsx`
- [ ] `/app/[locale]/products/[handle]/page.tsx`
- [ ] `/app/[locale]/samples/page.tsx`
- [ ] `/app/[locale]/samples/checkout/page.tsx`
- [ ] `/app/[locale]/terms/page.tsx`
- [ ] `/app/[locale]/thank-you/page.tsx`

**Pattern to follow:**
```typescript
type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const t = getTranslations(locale);

  return {
    title: t.pageTitle,
    alternates: {
      languages: {
        'sv': `https://linnevik.se/sv/path`,
        'en': `https://linnevik.se/en/path`,
      },
    },
  };
}

export default async function Page({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  // Use locale for Shopify calls, translations, etc.
}
```

### 🔵 Low Priority (Enhancement)
- [ ] Add proper hreflang tags to all page metadata
- [ ] Update sitemap to include both languages
- [ ] Add canonical URLs to metadata
- [ ] Consider implementing form state preservation for language switching
- [ ] Delete old unused files (LanguageContext.tsx, old language.ts, etc.)

### ⚪ Deferred (Login/Account Decision)
- [ ] Decide on approach for login/account pages (URL-based vs client-based)
- [ ] Implement chosen approach for authentication flow

---

## 🎯 Priority Order for Fixing

### Step 1: Fix Build (30 minutes)
1. Remove `'use client'` from 5 pages OR split into server + client components
2. Verify build succeeds: `npm run build`

### Step 2: Fix Links (1 hour)
1. Update Hero.tsx, SampleCTA.tsx, AlternativFooter.tsx
2. Update SearchPageClient.tsx, CookieBanner.tsx
3. Update ProductForm.tsx
4. Test that all internal links work correctly

### Step 3: Fix Imports (15 minutes)
1. Update 3 files importing from '@/lib/language'
2. Change to '@/lib/languageConfig'

### Step 4: Update All Pages (2-3 hours)
1. Add `params: Promise<{ locale: string }>` to all page components
2. Update to use locale from params instead of getServerLanguage()
3. Test each page in both languages

### Step 5: Test Everything (1 hour)
- [ ] Navigate through site in Swedish
- [ ] Switch to English, verify all pages work
- [ ] Test all links work correctly
- [ ] Test language switcher preserves path
- [ ] Test Shopify integration in both languages

---

## 🐛 Known Issues

### Issue 1: Breadcrumbs in Product Page
**Location:** `/app/[locale]/products/[handle]/page.tsx` line 29-36

**Problem:** Breadcrumb links are hardcoded without locale:
```typescript
{ href: "/collections", label: "Kategorier" },
{ href: `/collections/${handle}`, label: title },
```

**Fix:** Pass locale to Breadcrumbs component or use LocaleLink internally

### Issue 2: Search Page Locale Detection
**Location:** `/app/[locale]/search/page.tsx`

**Status:** ✅ Already partially fixed
**Remaining:** Needs full testing

---

## 📊 Migration Progress

**Overall:** 60% Complete

| Category | Status |
|----------|--------|
| Core Infrastructure | ✅ 100% |
| Header/Footer | ✅ 100% |
| Helper Files | ✅ 100% |
| Build Status | 🔴 0% (Failing) |
| Link Components | 🟡 60% |
| Page Components | 🟡 40% |
| Import Updates | 🟡 90% |
| Metadata/SEO | 🟢 20% |
| Testing | ⚪ 0% |

---

## 🎓 Key Learnings

### What Went Well
1. Core infrastructure is solid and well-designed
2. LocaleContext provides clean API for components
3. Middleware handles locale detection correctly
4. Most import updates were automated successfully

### What Needs Attention
1. Server/client component separation wasn't handled in all pages
2. Many hardcoded links need manual updating
3. Each page needs locale params pattern applied
4. Metadata generation needs updating for all pages

### Best Practices Established
1. Use `LocaleLink` for all internal links
2. Use `getTranslations(locale)` in server components
3. Use `useTranslation()` in client components
4. Always normalize locale: `normalizeLocale(localeParam)`
5. Pass locale to Shopify functions: `toShopifyLanguage(locale)`

---

## 🚀 Quick Fix Commands

### Fix Most Common Issue (Client Component + Metadata)
```bash
# Pattern: Split page into server (page.tsx) + client (PageClient.tsx)
# Example for cart page:

# 1. Create CartClient.tsx with 'use client'
# 2. Move all client logic there
# 3. Keep page.tsx as server component with metadata
```

### Find All Hardcoded Links
```bash
grep -r "href=\"/" src/sections src/components --include="*.tsx" | grep -v "LocaleLink\|http\|mailto\|tel\|#"
```

### Find All Pages Missing Params
```bash
grep -L "params: Promise" app/[locale]/*/page.tsx
```

---

## 📞 Next Steps

1. **Fix build errors first** - Without a working build, can't test anything
2. **Update links** - Ensures navigation works
3. **Update pages systematically** - One by one, test as you go
4. **Add proper SEO** - hreflang tags, canonical URLs
5. **Make login/account decision** - Then implement consistently
6. **Final testing** - Comprehensive test in both languages
7. **Deploy** - Start getting SEO benefits!

---

## 📚 Reference Documentation

Created documentation:
- `I18N_MIGRATION_GUIDE.md` - Step-by-step implementation guide
- `AUTH_I18N_SOLUTION.md` - Login/account pages solution
- `LANGUAGE_SWITCHING_IN_FORMS.md` - Form state preservation guide
- `MIGRATION_ANALYSIS.md` - This document

These documents contain all the patterns and examples needed to complete the migration.
