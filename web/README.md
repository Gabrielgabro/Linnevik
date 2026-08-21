# Linnevik web

Next.js storefront and the Linnevik-owned commerce backend. Customer-facing
catalog, cart, checkout, and accounts use Postgres, Stripe, and magic links.

## Owned commerce rollout

1. Migrations in `drizzle/*.sql` run automatically as part of `npm run build`
   (see `scripts/migrate.mjs`), so a Vercel deploy always applies pending
   migrations before the new code goes live. Run `npm run migrate` to apply
   them by hand against `DATABASE_URL` without doing a build.
2. Set `OWNED_COMMERCE_ENABLED=true` to accept cart/checkout traffic. It is a
   kill-switch: when false the commerce endpoints return 503; there is no
   fallback checkout.
3. Keep `STRIPE_TAX_REGISTRATION_CONFIRMED` unset until the Swedish registration
   is visible as **Collecting** in Stripe. Set it to `true` only after that
   operational check; this is what enables `automatic_tax` in Checkout.
   Stripe Tax with *no* registration computes 0 % and silently collects nothing,
   which is worse than the explicit rate — so `checkoutTaxMode()` verifies the
   registration against Stripe and refuses to open Checkout if it is missing,
   rather than selling untaxed. Until the flag is on:
   - freight is sent as a VAT-rated **line item**, not a shipping rate, because
     Stripe only accepts an explicit tax rate on line items. The order keeps its
     own subtotal/shipping split via session metadata.
   - delivery stays restricted to `SE`. Reverse charge and other countries' rates
     need Stripe Tax; `assertEveryAmountIsTaxed()` fails the checkout if anyone
     opens up a second country without it.
   Orders snapshot how VAT was applied — `vat_mode`, `vat_bps`, `vat_rate_id` —
   plus the buyer's billing address and tax ID, so an old order can still be
   reconciled after the rate or the flag changes. Refunds record the VAT portion
   they reverse in `refunds.tax_minor`.
4. Optionally set `STRIPE_INTEGRATION_IDENTIFIER`. It must be a stable label
   ending in eight random letters. The default is `linnevik_owned_qhjmztka`.
5. Use a separate restricted Stripe key for each environment and give it only
   the Checkout Session, Customer, Coupon and Refund permissions exercised by
   this application. Store it as a sensitive Vercel environment variable.
6. Set `CRON_SECRET`. `/api/cron/commerce-reconcile` runs every ten minutes,
   repairs order/session links from metadata, applies delayed payment state,
   and releases expired reservations. Checkout reserves all tracked inventory
   before Stripe can collect payment; `CHECKOUT_RESERVATION_MINUTES` defaults
   to 45 and is also used as the Stripe Session expiry.

The operational admin is split into `/admin/orders`, `/admin/commerce`, and
the unified customer register at `/admin/clients`. Refund requests require a paid PaymentIntent and use a
per-request idempotency key. Fulfillment is payment-gated and atomically checks
remaining quantities, reservations, physical stock, movements, and order
status. Returns cannot exceed net shipped quantities.

The owned API accepts internal variant IDs, never prices:

- `POST /api/store/cart` creates a cart.
- `GET /api/store/cart/:id` reads and reprices it.
- `POST /api/store/cart/:id/items` sets a variant quantity.
- `PATCH` or `DELETE /api/store/cart/:id/items/:itemId` changes a line.
- `POST /api/checkout` with `{ "cartId": "..." }` freezes the cart version and
  creates or reuses its Stripe Checkout Session.

Products tagged `MTO` or `SAMPLE_ONLY` stay visible for estimates and sample/
quote requests, but are never orderable. The storefront hides their cart action,
the cart API rejects direct requests, and migration `0022` marks their variants
unavailable for sale.

Run `npm test`, `npx tsc --noEmit`, and a test-mode checkout/webhook/expiration
smoke test before enabling the flag in production.

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
