# Shopify Email Localization Setup

## Overview

The website now passes each customer's locale (language preference) to Shopify when creating their account. Shopify will automatically send emails in the correct language based on this locale field.

## What We've Implemented

When a customer creates an account:
- On `/en/login/create-account` → Customer is created with `locale: "en-SE"`
- On `/sv/login/create-account` → Customer is created with `locale: "sv-SE"`

Shopify stores this in the customer's `locale` field and uses it to determine which language version of notification emails to send.

**Important**: Shopify requires the locale in the format `language-COUNTRY` (e.g., `en-SE`, `sv-SE`), not just the language code. The code automatically converts Next.js locale format (`en`, `sv`) to Shopify format.

## Shopify Admin Configuration

### Step 1: Enable Multiple Languages

1. Log in to **Shopify Admin**
2. Go to **Settings** → **Languages**
3. Make sure you have both **Swedish** and **English** enabled as published languages
4. Set your default/primary language (probably Swedish)

### Step 2: Translate Email Notifications

1. Go to **Settings** → **Notifications**
2. Find **"Customer account invite"** template
3. You should see language tabs at the top (e.g., "Svenska" and "English")
4. Click on each language tab and customize the template for that language

**Swedish version:**
- Edit the Swedish template with Swedish text
- Use variables like `{{ customer.first_name }}`, `{{ customer.account_activation_url }}`, etc.

**English version:**
- Switch to the English tab
- Edit with English text
- Use the same variables

### Step 3: Test

1. Create a test account from `/en/login/create-account`
   - Should receive activation email in English
2. Create a test account from `/sv/login/create-account`
   - Should receive activation email in Swedish

## How It Works

1. User visits `/en/login/create-account` or `/sv/login/create-account`
2. The locale is read from the `NEXT_LOCALE` cookie (set by Next.js)
3. When registration form is submitted:
   - Customer is created in Shopify with `locale: "en"` or `locale: "sv"`
   - Activation email is sent
4. Shopify automatically uses the customer's `locale` field to determine which language template to send

## Technical Details

### Code Locations

- **Customer Creation**: `web/src/lib/shopifyAdmin.ts` - `createCustomerAccount()`
  - Sets `locale` field in CustomerInput
- **Email Sending**: `web/src/lib/shopifyAdmin.ts` - `sendActivationEmail()`
  - Shopify handles language selection automatically
- **Registration Flow**: `web/app/[locale]/login/actions.ts` - `handleRegister()`
  - Reads locale from cookie and passes to customer creation

### GraphQL Mutation

```graphql
mutation CreateCustomer($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer {
      id
      state
      locale
    }
    userErrors {
      field
      message
    }
  }
}
```

With input:
```json
{
  "email": "customer@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "locale": "en"  // or "sv"
}
```

## Adding More Languages

To add support for additional languages (e.g., Norwegian, Danish):

1. **In Shopify Admin**:
   - Go to Settings → Languages
   - Add and publish the new language
   - Translate the "Customer account invite" notification template

2. **In Your Code**:
   - Add the new locale to your i18n configuration
   - The locale will automatically be passed to Shopify when customers register

That's it! The locale field is scalable and works with any language Shopify supports.

## Troubleshooting

### Emails still in the wrong language

1. **Check customer locale in Shopify**:
   - Go to Customers in Shopify Admin
   - Find the customer
   - Check their "Locale" field - it should show "en" or "sv"

2. **Check language configuration**:
   - Go to Settings → Languages
   - Make sure both languages are published
   - Check that translations exist for the email template

3. **Check server logs**:
   - Look for the log line: `Customer created with state: ... locale: ...`
   - Verify the locale is being set correctly

### Locale not being set

1. Check that `NEXT_LOCALE` cookie exists
2. Verify the locale is being read correctly in `handleRegister()`
3. Check the GraphQL response for any userErrors

## Benefits of This Approach

✅ **Scalable**: Easy to add more languages
✅ **Native**: Uses Shopify's built-in localization
✅ **Maintainable**: No custom Liquid logic needed
✅ **Automatic**: Shopify handles language selection
✅ **Consistent**: Works for all Shopify notification emails
