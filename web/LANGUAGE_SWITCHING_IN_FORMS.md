# Language Switching During Forms - Seamless UX

## The Problem

Multi-step processes break when users switch language:

**Bad UX Example:**
1. User fills out registration form in Swedish
2. Clicks language switcher to English
3. Form resets → user loses all data ❌
4. User has to start over

## ✅ Solution 1: URL Search Params (Recommended)

Store form state in URL - survives language switches automatically.

### Implementation

#### 1. Update Language Switcher to Preserve Query Params

File: `/src/components/LanguageSwitcher.tsx`

```typescript
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/contexts/LocaleContext';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import Link from 'next/link';
import type { Language } from '@/lib/languageConfig';

export default function LanguageSwitcher({ variant = 'header' }) {
  const { locale: currentLang } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Remove current locale from pathname and preserve query params
  const getLocalizedPath = (newLocale: Language) => {
    const pathWithoutLocale = pathname.replace(/^\/(sv|en)/, '') || '/';
    const queryString = searchParams.toString();
    const query = queryString ? `?${queryString}` : '';
    return `/${newLocale}${pathWithoutLocale}${query}`;
  };

  // ... rest of component
}
```

#### 2. Update Form Components to Use URL State

**Example: Registration Form**

File: `/app/[locale]/login/create-account/CreateAccountClient.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { handleRegister, type RegisterState } from '../actions';
import { useTranslation } from '@/contexts/LocaleContext';

const initialState: RegisterState = { status: 'idle' };

export default function CreateAccountClient() {
    const [state, formAction] = useActionState(handleRegister, initialState);
    const { t, locale } = useTranslation();
    const searchParams = useSearchParams();
    const router = useRouter();

    // Read initial values from URL
    const email = searchParams.get('email') || '';
    const firstName = searchParams.get('firstName') || '';
    const lastName = searchParams.get('lastName') || '';
    const companyNumber = searchParams.get('company') || '';

    // Update URL when form changes (debounced)
    const updateURL = (field: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set(field, value);
        } else {
            params.delete(field);
        }
        // Use replace to avoid filling browser history
        router.replace(`/${locale}/login/create-account?${params.toString()}`, {
            scroll: false,
        });
    };

    return (
        <form action={formAction} className="space-y-5">
            <div>
                <label htmlFor="email">{t.register.emailLabel}</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={email}
                    onChange={(e) => updateURL('email', e.target.value)}
                    className="..."
                />
            </div>

            <div>
                <label htmlFor="firstName">{t.register.firstNameLabel}</label>
                <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    defaultValue={firstName}
                    onChange={(e) => updateURL('firstName', e.target.value)}
                    className="..."
                />
            </div>

            <div>
                <label htmlFor="lastName">{t.register.lastNameLabel}</label>
                <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    defaultValue={lastName}
                    onChange={(e) => updateURL('lastName', e.target.value)}
                    className="..."
                />
            </div>

            <div>
                <label htmlFor="companyNumber">{t.register.companyLabel}</label>
                <input
                    id="companyNumber"
                    name="companyRegistrationNumber"
                    type="text"
                    defaultValue={companyNumber}
                    onChange={(e) => updateURL('company', e.target.value)}
                    className="..."
                />
            </div>

            <button type="submit">
                {t.register.submit}
            </button>
        </form>
    );
}
```

**How it works:**
1. Form fields read from URL: `?email=test@example.com&firstName=John`
2. User types → URL updates automatically
3. User switches language → URL preserved
4. Form fields remain filled ✅

#### 3. Add Debouncing for Better Performance

```typescript
import { useEffect, useRef } from 'react';

export default function CreateAccountClient() {
    const timeoutRef = useRef<NodeJS.Timeout>();

    const updateURL = (field: string, value: string) => {
        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Debounce URL updates (wait 500ms after typing stops)
        timeoutRef.current = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (value) {
                params.set(field, value);
            } else {
                params.delete(field);
            }
            router.replace(`/${locale}/login/create-account?${params.toString()}`, {
                scroll: false,
            });
        }, 500);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // ... rest of component
}
```

---

## ✅ Solution 2: SessionStorage (For Sensitive Data)

Use sessionStorage for data you don't want in URL (like passwords).

### Implementation

#### Create a Form State Hook

File: `/src/hooks/useFormState.ts`

```typescript
'use client';

import { useState, useEffect } from 'react';

type FormState = Record<string, string>;

export function useFormState(formKey: string) {
  const [formData, setFormDataState] = useState<FormState>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(formKey);
    if (saved) {
      try {
        setFormDataState(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved form data');
      }
    }
    setIsLoaded(true);
  }, [formKey]);

  // Save to sessionStorage whenever data changes
  const setFormData = (data: FormState) => {
    setFormDataState(data);
    sessionStorage.setItem(formKey, JSON.stringify(data));
  };

  const updateField = (field: string, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
  };

  const clearFormData = () => {
    setFormDataState({});
    sessionStorage.removeItem(formKey);
  };

  return { formData, setFormData, updateField, clearFormData, isLoaded };
}
```

#### Use in Form Component

```typescript
'use client';

import { useFormState } from '@/hooks/useFormState';
import { useTranslation } from '@/contexts/LocaleContext';

export default function CreateAccountClient() {
    const { t } = useTranslation();
    const { formData, updateField, clearFormData, isLoaded } = useFormState('register-form');

    // Don't render form until sessionStorage is loaded
    if (!isLoaded) {
        return <div>Loading...</div>;
    }

    return (
        <form action={formAction} className="space-y-5">
            <input
                name="email"
                type="email"
                defaultValue={formData.email || ''}
                onChange={(e) => updateField('email', e.target.value)}
            />
            <input
                name="firstName"
                type="text"
                defaultValue={formData.firstName || ''}
                onChange={(e) => updateField('firstName', e.target.value)}
            />
            {/* ... other fields ... */}

            <button type="submit">
                {t.register.submit}
            </button>
        </form>
    );
}
```

**Benefits:**
- ✅ Data survives language switches
- ✅ Data survives page refreshes
- ✅ More secure than URL (not visible)
- ✅ Automatically cleared when tab closes

**Downsides:**
- Requires client-side JavaScript
- Doesn't work with back button

---

## 🎯 Recommended Approach: Hybrid

**Use URL params for non-sensitive data:**
- Email
- First/last name
- Company number
- Current step in multi-step flow

**Use sessionStorage for sensitive data:**
- Passwords (never in URL!)
- Credit card info
- Any PII you don't want visible

### Hybrid Implementation

```typescript
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useFormState } from '@/hooks/useFormState';
import { useTranslation } from '@/contexts/LocaleContext';

export default function CreateAccountClient() {
    const { t, locale } = useTranslation();
    const searchParams = useSearchParams();
    const router = useRouter();

    // Non-sensitive data → URL
    const email = searchParams.get('email') || '';
    const firstName = searchParams.get('firstName') || '';

    // Sensitive data → sessionStorage
    const { formData, updateField } = useFormState('register-form');

    const updateURL = (field: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) params.set(field, value);
        else params.delete(field);
        router.replace(`/${locale}/login/create-account?${params.toString()}`, {
            scroll: false,
        });
    };

    return (
        <form action={formAction}>
            {/* Non-sensitive → URL */}
            <input
                name="email"
                defaultValue={email}
                onChange={(e) => updateURL('email', e.target.value)}
            />

            {/* Sensitive → sessionStorage */}
            <input
                name="password"
                type="password"
                defaultValue={formData.password || ''}
                onChange={(e) => updateField('password', e.target.value)}
            />

            <button type="submit">{t.register.submit}</button>
        </form>
    );
}
```

---

## Multi-Step Processes (e.g., Checkout)

For multi-step flows like sample orders or checkout:

### Track Current Step in URL

```typescript
// URL structure: /sv/samples/checkout?step=2&email=...&name=...

export default function SamplesCheckoutClient() {
    const searchParams = useSearchParams();
    const currentStep = parseInt(searchParams.get('step') || '1');

    const nextStep = () => {
        const params = new URLSearchParams(searchParams);
        params.set('step', (currentStep + 1).toString());
        router.push(`/${locale}/samples/checkout?${params.toString()}`);
    };

    const prevStep = () => {
        const params = new URLSearchParams(searchParams);
        params.set('step', (currentStep - 1).toString());
        router.push(`/${locale}/samples/checkout?${params.toString()}`);
    };

    // Render current step
    if (currentStep === 1) return <Step1 />;
    if (currentStep === 2) return <Step2 />;
    // etc...
}
```

**Benefits:**
- ✅ Language switch preserves step
- ✅ Browser back button works correctly
- ✅ Can share link to specific step
- ✅ Refreshing page maintains state

---

## Testing Checklist

### Registration Flow
- [ ] Fill out email field in Swedish
- [ ] Switch to English → email still filled
- [ ] Continue filling form in English
- [ ] Switch back to Swedish → all fields still filled
- [ ] Submit form → success

### Multi-Step Checkout
- [ ] Start at step 1 in Swedish
- [ ] Fill out fields
- [ ] Go to step 2
- [ ] Switch to English → still on step 2, data preserved
- [ ] Go back to step 1 → data still there
- [ ] Complete checkout in English → success

### Login Flow
- [ ] Enter email in Swedish
- [ ] Switch to English → email preserved
- [ ] Enter password in English
- [ ] Switch back to Swedish
- [ ] Login → success, redirects to `/sv/account`

---

## Common Pitfalls

❌ **DON'T** put passwords in URL
❌ **DON'T** forget to update LanguageSwitcher to preserve params
❌ **DON'T** use `value={}` (controlled) - use `defaultValue={}` (uncontrolled)
❌ **DON'T** update URL on every keystroke - debounce it

✅ **DO** use URL params for public data
✅ **DO** use sessionStorage for sensitive data
✅ **DO** debounce URL updates
✅ **DO** clear sessionStorage after successful submission

---

## Quick Reference

### URL Params Pattern
```typescript
const email = searchParams.get('email') || '';
onChange={(e) => updateURL('email', e.target.value)}
```

### SessionStorage Pattern
```typescript
const { formData, updateField } = useFormState('form-key');
onChange={(e) => updateField('password', e.target.value)}
```

### Language Switcher with Query Params
```typescript
const queryString = searchParams.toString();
const query = queryString ? `?${queryString}` : '';
return `/${newLocale}${pathWithoutLocale}${query}`;
```

### Clear State After Success
```typescript
// After successful submission
clearFormData(); // sessionStorage
router.push(`/${locale}/success`); // clears URL params
```
