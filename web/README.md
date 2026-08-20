# Linnevik web

Next.js storefront and the Linnevik-owned commerce backend. Shopify remains the
live storefront/cart fallback while the owned path is tested.

## Owned commerce rollout

1. Migrations in `drizzle/*.sql` run automatically as part of `npm run build`
   (see `scripts/migrate.mjs`), so a Vercel deploy always applies pending
   migrations before the new code goes live. Run `npm run migrate` to apply
   them by hand against `DATABASE_URL` without doing a build.
2. Set `OWNED_COMMERCE_ENABLED=true` only in the environment being tested.
   When absent or false, every `/api/store/cart` endpoint returns 503 and the
   existing Shopify cart remains unchanged.
3. Keep `STRIPE_TAX_REGISTRATION_CONFIRMED` unset until the Swedish registration
   is visible as **Collecting** in Stripe. Set it to `true` only after that
   operational check; this is what enables `automatic_tax` in Checkout.
4. Optionally set `STRIPE_INTEGRATION_IDENTIFIER`. It must be a stable label
   ending in eight random letters. The default is `linnevik_owned_qhjmztka`.
5. Use a separate restricted Stripe key for each environment and give it only
   the Checkout Session, Customer, Coupon and Refund permissions exercised by
   this application. Store it as a sensitive Vercel environment variable.

The operational admin is split into `/admin/orders`, `/admin/commerce`, and
the unified customer register at `/admin/clients`. Refund requests require a paid PaymentIntent and use a
per-request idempotency key. Fulfillment quantities are checked against the
remaining unfulfilled quantity before a shipment is recorded.

The owned API accepts internal variant IDs, never prices:

- `POST /api/store/cart` creates a cart.
- `GET /api/store/cart/:id` reads and reprices it.
- `POST /api/store/cart/:id/items` sets a variant quantity.
- `PATCH` or `DELETE /api/store/cart/:id/items/:itemId` changes a line.
- `POST /api/checkout` with `{ "cartId": "..." }` freezes the cart version and
  creates or reuses its Stripe Checkout Session.

Run `npm test` and `npm run build` before enabling the flag. Do not remove the
Shopify fallback until test-mode payment, expiration, duplicate-webhook, and
inventory scenarios have also passed in the deployment environment.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
