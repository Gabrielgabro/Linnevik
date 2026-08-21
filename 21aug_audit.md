Short answer: the backend is a solid foundation for a limited card-payment pilot, but it is not yet safe or complete enough to replace Shopify as both the payment and inventory backend.

I would not remove the Shopify credentials or enable unrestricted live checkout until the critical issues below are addressed.

## What already works well

The owned backend has meaningful functionality:

- Local products, variants, prices, inventory and reservations
- Stripe-hosted Checkout with SEK and Swedish VAT handling
- Signed, idempotent Stripe webhooks
- Orders, refunds, fulfillment and basic returns
- Customer accounts with magic links
- Discounts, shipping rules and sample orders
- Admin interfaces for catalog, customers, inventory and orders
- Restricted Stripe-key guidance and a tax-registration safety gate

Using Stripe’s integration guidance as part of the review, the fundamental Stripe approach is sound: hosted Checkout, dynamic payment methods, webhook signature verification and explicit tax gating are all good choices. The weaknesses are mainly in the surrounding order, inventory and reconciliation lifecycle.

All automated checks currently pass:

- 106 tests passed
- TypeScript passed
- ESLint reported no errors, only 17 warnings

However, most tests are unit tests. Some “contract” tests merely inspect source text, rather than exercising the database and Stripe flows—for example [ownedCartContracts.test.ts](/Users/gabrielgabro/Code/Linnevik/web/tests/ownedCartContracts.test.ts:1).

## Critical problems before cutover

### 1. Made-to-order minimum quantities can be bypassed

The UI may start these products at 50 units, but the server validates the variant database fields, which are currently set to a minimum of 1 for all 11 sellable made-to-order variants.

The pricing calculation derives a higher quantity but its caller can ignore that returned quantity:

- [pricingRules.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/pricingRules.ts:158)
- [cartDb.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/cartDb.ts:170)

A direct API request can therefore purchase one unit of products intended to have a much higher MOQ. This is a launch blocker.

### 2. Unpaid orders can be shipped

Fulfillment creation does not require a paid order and accepts statuses such as `pending`, `shipped`, `delivered`, and `cancelled`. It also consumes reserved inventory regardless of that status:

- [ordersDb.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/ordersDb.ts:438)
- [inventoryDb.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/inventoryDb.ts:158)

This is not just theoretical: the current review database contains a pending, unpaid test order marked as shipped.

Additional problems:

- Concurrent fulfillment requests could fulfill the same units twice.
- Returns are not bounded by the fulfilled quantity.
- Repeated returns could increase inventory beyond what was shipped.
- Order fulfillment status reflects the latest shipment, rather than an aggregate of all lines and shipments.

Fulfillment and returns need transactional state-machine enforcement.

### 3. The legacy checkout endpoint bypasses important validation

The public checkout route still accepts arbitrary variant lines without requiring an owned cart:

- [checkout route](/Users/gabrielgabro/Code/Linnevik/web/app/api/checkout/route.ts:34)
- [pricing.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/pricing.ts:87)

That path does not enforce all of the following:

- Product active status
- `availableForSale`
- Stock availability
- MOQ and increments
- Sample-only restrictions
- The owned-commerce feature flag

This legacy path should be removed or completely disabled at cutover.

### 4. Inventory can still oversell

Stock is reserved after payment, not while Checkout is in progress. Two customers can therefore pay for the last units. The later reservation records an oversold movement, but there is no operational alert, queue or explicit order status for resolving it:

- [inventoryDb.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/inventoryDb.ts:21)
- [ordersDb.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/ordersDb.ts:245)

The order-paid update and reservation are also separate database operations.

You need either:

- Reservation before payment with expiration and cleanup, or
- An intentional backorder/oversold workflow with customer communication and staff alerts.

The current documentation’s statement that oversell risk is gone is incorrect.

### 5. Payment-to-order reconciliation is incomplete

Checkout creates the order, creates a Stripe session, and then attaches that session to the database order. If Stripe succeeds but attaching the session fails, the webhook searches only by session ID.

Although the Stripe session contains `linnevik_order_id` metadata, the webhook does not use it as a recovery lookup:

- [checkout route](/Users/gabrielgabro/Code/Linnevik/web/app/api/checkout/route.ts:142)
- [ordersDb.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/ordersDb.ts:205)

That creates a possible “customer paid, order still pending” situation. There is also no reconciliation job for pending Stripe sessions, payment mismatches, refunds or stuck events.

### 6. Shopify is still an active dependency

Several customer-facing and account paths still read from or import Shopify code:

- Homepage featured products: [FeaturedGrid.tsx](/Users/gabrielgabro/Code/Linnevik/web/src/sections/FeaturedGrid.tsx:1)
- Sample product API: [products route](/Users/gabrielgabro/Code/Linnevik/web/app/api/products/route.ts:1)
- Sitemap timestamps and `llms.txt`
- Currency endpoint
- Legacy carts and customer-account fallback
- Password recovery and account activation actions
- Shopify privacy script and cookie-policy wording

Some Shopify modules throw during module loading when Shopify environment variables are absent. Consequently, simply removing those variables could break owned account functionality.

The Shopify API versions in [shopify.ts](/Users/gabrielgabro/Code/Linnevik/web/src/lib/shopify.ts:4) are also stale.

## Business capabilities that are still missing

The backend does not yet implement several functions described in your own migration plan:

- Fortnox/accounting integration
- Invoice payments and payment terms
- Credit approvals and credit limits
- Quotes and quotation thresholds
- Credit notes
- Manual order entry
- Purchase orders and replenishment
- Low-stock alerts
- Multiple warehouses or locations
- Backorder management
- Accounting reconciliation and exports
- Retry queues for accounting and email failures

See [the_big_purge.md](/Users/gabrielgabro/Code/Linnevik/the_big_purge.md:10).

If your intended replacement is “prepaid Stripe card orders, Sweden only, with manual accounting and manual quotation handling,” the backend is reasonably close after fixing the critical bugs.

If the intended replacement is a complete B2B commerce and inventory system, it does not yet have enough functionality.

## Customer and pricing gaps

The B2B customer record is too thin for reliable invoicing and accounting:

- Registration does not properly collect company name, phone, billing address, delivery address or explicit terms acceptance.
- Stripe billing address and tax IDs are not copied into the local order.
- Orders do not snapshot VAT treatment, company registration number, pricing version or terms acceptance.
- A new Stripe Customer is created for every checkout instead of reusing the customer’s saved Stripe ID.

Discount and pricing issues include:

- Per-customer coupon limits can be bypassed because normal checkout does not supply the customer email during validation.
- Coupon limits use a count-before-payment check that can be exceeded concurrently.
- Coupons can stack with made-to-order volume discounts.
- Pricing configuration is overwritten as `v1`; carts and orders do not preserve a true pricing-version history.
- Margin-floor protection is effectively incomplete.
- Postal-code shipping prefixes exist in the database but are not used.
- Manual VAT is applied to product lines but not a nonzero shipping fee.

## Current database health

The configured Neon database used in this review is small and currently internally consistent in several important ways:

- 17 active products
- 55 variants, of which 17 are sellable
- No negative available stock
- No current reservation mismatch
- Four test orders and one paid order
- No stuck checkout carts older than 24 hours
- No Stripe webhook stuck in processing
- No Shopify-hosted image URLs

Cleanup findings:

- One active test product lacks a collection.
- Ten products have an unknown supplier.
- One product lacks an English title.
- Four products lack English descriptions.
- Two sample items are not linked to catalog products.
- One unpaid test order is marked shipped.
- All 55 variants still retain Shopify variant IDs.
- Stripe catalog synchronization appears only partially used; all variant Stripe price IDs are empty, although Checkout’s inline prices currently make that non-fatal.

## Operational and security weaknesses

These are not necessarily pilot blockers, but should not remain long-term:

- Admin access is a shared password with self-selected staff identity, no MFA or real roles.
- Magic links can be replayed for about two minutes after consumption.
- Contact and sample endpoints have no meaningful rate limiting or bot protection.
- Email failures are logged but have no retry/resend workflow.
- Inventory edits do not always produce an inventory movement history.
- Database migrations are not atomic and run automatically during `npm run build`.
- The environment-variable example is far behind what the application actually requires: [.env.example](/Users/gabrielgabro/Code/Linnevik/web/.env.example:1).
- There is no clear backup/restore, reconciliation or incident runbook.
- There are obsolete large files such as `src/lib/kladd.ts` and `src/lib/test.ts`.

## Recommended cutover order

Before accepting live traffic:

1. Enforce MOQ and increment rules on the server and correct the variant data.
2. Make fulfillment and returns transactional, payment-gated and quantity-bounded.
3. Disable the arbitrary-lines legacy checkout path.
4. Add Stripe/order recovery using order metadata plus a recurring reconciliation job.
5. Choose and implement an explicit oversell or reservation policy.
6. Remove all customer-facing Shopify reads and import-time Shopify dependencies.
7. Decide whether Fortnox, invoices and quotations are required for launch or will have a documented temporary manual process.
8. Add real database/Stripe integration tests for checkout, webhook retry, expiration, fulfillment, refund and returns.
9. Clean the test orders and incomplete catalog records.
10. Only then test a staged live cutover with low order volume and close monitoring.

My overall assessment is: good technical foundation, but currently around “controlled pilot” maturity rather than “safe Shopify replacement.” The most urgent problems are not cosmetic missing features—they are enforceable commercial rules, fulfillment integrity, overselling and recovery from partially completed Stripe operations.