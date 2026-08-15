# Full Headless Commerce and Pricing Migration

## Summary

Replace Shopify with a Linnevik-owned commerce system built into the existing Next.js application and Neon/Postgres database. Stripe Checkout handles immediate payments, Fortnox handles approved invoice customers and accounting, and Linnevik admin becomes the source of truth for catalog, pricing, inventory, customers, orders, shipping, and fulfillment.

The launch is Sweden-only, SEK, B2B, immediate cutover, with no customer or order-history migration because Shopify has no existing orders. New customers use email magic-link authentication.

## Core implementation

### Commerce data and administration

- Add database entities for products, variants, localized content, media, inventory movements, companies, contacts, addresses, carts, orders, order lines, payments, shipments, quotes, and pricing configuration.
- Store money as integer öre and snapshot descriptions, VAT treatment, costs, prices, discounts, addresses, and terms onto each order.
- Import the current Shopify catalog, variants, images, SKU data, MOQ, carton size, lead time, tags, inventory, and Swedish/English content before cutover.
- Add Linnevik admin screens for catalog editing, stock adjustments, customers, order processing, shipment tracking, quotes, and pricing settings.
- Treat stocked products as inventory-controlled. Treat MTO products as orderable without stock reservation, with their configured MOQ, carton increment, and lead time.
- Record every price-setting, stock, order, refund, quote, and fulfillment change in the existing admin activity log.

### Central pricing engine

- Replace all existing duplicated MTO calculators with one server-side pricing service used by product pages, cart, quotes, checkout, and admin previews.
- Calculate tier eligibility from the cart’s list-price subtotal excluding VAT and shipping, before discounts.
- Let staff immediately save configurable thresholds, discount percentages, and the quotation cutoff in Linnevik admin.
- Keep the pricing feature disabled until at least one valid tier and a quote cutoff have been configured.
- Apply the selected order discount independently to each line, capped so no line falls below a 45% gross margin over its active landed cost.
- Round final unit prices deterministically to öre; derive totals from quantity multiplied by the rounded unit price.
- Never stack volume pricing with campaigns, negotiated prices, or codes; return the single lowest permitted price.
- At or above the configurable cutoff, disable payment checkout and create a quote request containing the frozen cart and customer details.
- Expose exact calculated tiers and savings only to authenticated B2B customers; logged-out visitors see list prices and a login prompt for business pricing.
- Show actual unit price rather than making the discount percentage the dominant customer-facing message.

### Accounts, cart, checkout, and orders

- Replace Shopify customer authentication with signed, single-use, expiring email magic links.
- Require company name, organization number, contact details, billing address, delivery address, and acceptance of B2B terms during account creation.
- Implement server-owned carts with MOQ/carton validation, inventory availability, price-version tracking, shipping calculation, and expiration.
- Recalculate and validate every cart server-side when lines change and immediately before creating payment or invoice orders.
- Use Stripe-hosted Checkout Sessions for immediate payments, dynamic payment methods, address collection, and tax-ID collection where applicable.
- Create a pending order before redirecting to Stripe; mark it paid only from a signature-verified, idempotently processed Stripe webhook.
- Use restricted Stripe keys, separate test/live credentials, Vercel sensitive environment variables, webhook replay protection, and no client-visible secrets.
- For approved credit customers, create the order and corresponding Fortnox customer/invoice instead of a Stripe Checkout Session.
- Store credit approval, payment terms, and credit limit on the company; default new companies to card payment only.
- Support cancellation, full and partial refunds, credit notes, payment failure, expired checkout, and webhook events arriving more than once or out of order.

### Tax, shipping, fulfillment, and accounting

- Launch in SEK for Swedish delivery addresses only.
- Confirm the company’s Swedish VAT registration and product tax classification with its accountant before enabling production tax collection.
- Use Stripe Tax only after the Swedish registration is active in Stripe; otherwise block production launch rather than silently collecting zero tax.
- Keep ex-VAT pricing throughout the storefront and record VAT separately on orders and Fortnox documents.
- Configure Swedish flat shipping fees and a free-shipping threshold in admin; orders requiring exceptional freight are routed to quotation.
- Reserve stocked inventory when a paid or approved-invoice order is created; release it on expiration or cancellation and decrement it on fulfillment.
- Provide admin picking views, shipment creation, carrier/tracking fields, customer shipment emails, partial fulfillment, and returns/restocking.
- Synchronize customers, invoices, payments, refunds, and credit notes with Fortnox using idempotent external identifiers; queue and visibly retry failed synchronizations.

## Interfaces and state

- Introduce a shared `PricingResult` containing list subtotal, applied tier, per-line list/final unit prices, margin-cap adjustments, discount total, quote requirement, shipping, VAT, and payable total.
- Add authenticated cart endpoints for create/get/add/update/remove and an authoritative `reprice` operation; clients never submit trusted prices or discounts.
- Add checkout endpoints for Stripe session creation, invoice-order creation, quote submission, and Stripe/Fortnox webhooks.
- Use explicit order states: `draft`, `awaiting_payment`, `payment_failed`, `paid`, `invoice_approved`, `processing`, `partially_fulfilled`, `fulfilled`, `cancelled`, and `refunded`.
- Store a pricing-configuration version on carts, quotes, and orders so administrative price changes cannot silently alter accepted orders.
- Return structured validation errors for MOQ, carton increments, insufficient stock, expired prices, unavailable delivery, lost invoice eligibility, and quote-only totals.

## Cutover

- Build and test against Stripe test mode, a Fortnox test environment, and a production-like database.
- Run a final Shopify catalog export/import, verify product counts, SKU uniqueness, prices, media, inventory, MOQ, pack sizes, and localized content.
- Disable purchasing briefly, perform the final inventory import, switch storefront reads and checkout to the new system, and remove Shopify credentials only after production smoke tests pass.
- Retain the export as an immutable migration artifact; do not import customers or historical orders.
- Prepare a rollback deployment that restores Shopify storefront/cart integration if payment, inventory, or order creation fails during immediate cutover.

## Test and acceptance plan

- Unit-test tier boundaries, list-subtotal qualification, 45% margin caps, rounding, non-stacking, quote cutoff, MTO rules, shipping, and VAT calculations.
- Integration-test cart repricing, concurrent stock reservations, expired carts, Stripe success/failure/abandonment/refunds, duplicate webhooks, Fortnox retries, invoice credit limits, and partial fulfillment.
- Verify that logged-out users cannot access negotiated prices and that every client-visible price matches the server-created order and Stripe/Fortnox total.
- Reconcile a representative product and mixed cart manually from landed cost through discount, shipping, VAT, payment, fulfillment, refund, and accounting.
- Require successful test card and invoice orders, correct stock movements, customer emails, admin audit records, and Fortnox reconciliation before production cutover.

## Assumptions

- The existing Next.js/Vercel application and Neon/Postgres database remain the platform foundation.
- There are no Shopify orders or customer accounts requiring migration.
- Pricing tiers and the quote cutoff are intentionally configured by staff later; the system launches with discounts disabled until valid settings exist.
- Changes to pricing configuration become active immediately after validation and are audit-logged.
- Invoice terms are available only after explicit staff approval; all other customers pay through Stripe.
- Stripe Checkout Sessions, restricted keys, verified webhooks, and registration-gated Stripe Tax are the chosen payment and tax integration defaults.


## Status 15-8

## Current backend status

### Available now

- The Neon/Postgres database is reachable and the commerce schema is deployed.
- Catalog management is operational with products, variants, collections, localized content, and product images.
- Admin authentication and protected APIs are implemented.
- Admin operations exist for products, collections, customers, sales clients and contacts, discounts, shipping rules, orders, refunds, and fulfillments.
- Stripe Checkout Session creation and signature-verified, idempotent Stripe webhook processing are implemented.
- Orders are stored before checkout and can be managed through the admin interface after payment.
- Shopify customer registration, login, activation, password recovery, storefront cart, and checkout fallback remain available during migration.
- Outgoing mail is sent through Linnevik's own SMTP provider (`smtp.wsr.se`), configured by environment rather than hardcoded. The sending identity (`MAIL_FROM`) is separate from the SMTP login and must stay on `linnevik.se`, because the domain publishes SPF `-all` and DMARC `p=quarantine` with strict alignment (`aspf=s; adkim=s`).
- Order-confirmation and shipment emails are implemented and wired. Confirmations are sent from the Stripe webhook after the event is acknowledged, so a mail failure cannot trigger a Stripe retry and a duplicate email. Shipment notices are sent from the admin fulfillment endpoint for `shipped` and `delivered` only, and list the lines in that specific shipment so partial deliveries are accurate.
- Every send attempt is recorded in `order_events` as `email.sent` or `email.failed`, so the admin order timeline shows whether the customer was actually reached.
- The admin interface has been redesigned: a grouped sidebar with active states replaces the flat link bar, and shared UI primitives (`PageHeader`, `Panel`, `StatusPill`, `DataTable`, `Notice`, `StatTile`) replace per-page markup.
- Automated tests currently pass: 37 of 37 tests, and TypeScript validation and lint pass with zero errors.

### Not yet complete

- The storefront still uses the Shopify cart. The owned cart API exists, but `OWNED_COMMERCE_ENABLED` is not enabled and the UI has not been connected to it.
- Inventory is validated during cart and checkout operations, but stock is not reserved or deducted when payment succeeds, leaving an overselling risk.
- SMTP credentials are still not present in the local environment, so no message has been delivered end to end. The transport, templates, and failure paths are implemented and unit-tested, but the handshake with `smtp.wsr.se` is unproven. Required variables are documented in `web/.env.example`.
- Customer email verification has no working back end and should not be treated as a partially finished feature. Details below.
- Stripe automatic tax remains disabled until the Swedish tax registration has been confirmed and `STRIPE_TAX_REGISTRATION_CONFIRMED` is enabled.
- Owned checkout currently supports Swedish delivery addresses only.
- Database integration tests and full Stripe payment, webhook, expiration, inventory, refund, and fulfillment end-to-end tests are still missing.
- The connected database currently contains no owned carts, customers, orders, or processed Stripe webhook events, so the complete owned purchase flow has not yet been proven end to end.

### Email verification: assessment

The previous status entry described this as "a logging-only placeholder". That understated the problem. The transport was the only part that was missing, and it is now built; what is absent is everything around it.

- **Nothing issues a code.** `handleRegister` creates the customer in Shopify and triggers Shopify's own activation email (`send_invite.json`). It never generates, stores, or sends a verification code. The entire `lib/emailVerification.ts` module had no callers anywhere in the codebase.
- **The page is unreachable.** `/login/verify-email` exists and is fully built, but nothing in the application links to it. It can only be reached by typing the URL.
- **The verifier was a rubber stamp.** `handleVerifyEmail` accepted *any* six-digit input and returned success, with a comment describing this as "UX continuity". Anyone reaching the page was verified without holding a code. This has been fixed: it now calls the real `verifyCode` and fails closed. Because nothing issues codes, it consistently answers "session expired", which is the correct behaviour until issuance exists.
- **The code store is unsound by design.** `storeVerificationCode` puts the plaintext code in a cookie belonging to the same user who is supposed to prove they control the inbox. `httpOnly` stops JavaScript but not the person: the code is readable in browser developer tools without ever opening the email. This defeats the purpose of email verification. A real implementation needs the code hashed in the database, bound to the address, with an attempt limit.
- **Six-digit codes are the wrong design for this project.** The migration plan specifies signed, single-use, expiring magic links as the replacement for Shopify authentication. This module is a leftover from a different approach and should most likely be deleted rather than connected.

Recommendation: do not wire the existing module. Build magic-link authentication as planned, with database-backed single-use tokens, and delete `lib/emailVerification.ts` and `/login/verify-email` at that point. The mail transport and templating layer built for order emails is reusable for it as-is.

### Readiness decision

The existing Shopify-backed customer journey can continue operating, and many owned backend functions are usable now. The owned backend is not yet ready to replace Shopify. The immediate priorities are connecting the owned cart to the storefront, implementing atomic inventory handling, proving the mail path with real SMTP credentials, and validating the complete Stripe flow in test mode. Customer authentication remains on Shopify until magic links are built.