# Backend audit — 25 August 2026

The shop is live and taking real payments. That changes what this list is for: the
21 August audit asked "is it safe to cut over"; this one asks "what can silently
cost us money, an order, or a customer, right now — and what is missing before
the admin can be operated by someone who is not the person who wrote it".

Everything below was verified by reading the code in this repo on 25 August 2026,
not from memory of how it used to work. Where a claim was checked against a build,
a manifest, or the live database, that is stated.

**The constraint that governs every fix in this document:** the shop is trading.
No change may break an existing order, an existing URL, an in-flight cart, or the
reconciliation path. Section 7 states the rules that follow from that.

**Status, end of 25 August:** everything in sections 2–5 marked ✅ is implemented
in the working tree. What is left is listed in section 6 — three of the four
items there need a decision from you, not more code.

---

## 0. How to read the severity levels

- **P1 — money or orders can go wrong today.** Something is already possible that
  ends with our books, our stock, or a customer's expectation being wrong, and
  nothing surfaces it.
- **P2 — operationally blind or manual.** Nothing breaks, but the shop cannot be
  run without a terminal or without knowing the code.
- **P3 — friction and fragility.** Slow, or safe only by accident.
- **Ops** — security, deployment, restore, monitoring.

Status markers: ✅ done · ⏳ open · ⚠️ needs a decision.

---

## 1. The change that makes the rest visible ✅

Every finding below shared one property: the code already knew something was
wrong, and told nobody. Failures ended in `console.error`, which on Vercel is a
line no one reads.

There is now an alert sink. `raiseAlert` writes to `ops_alerts` and emails
`OPS_ALERT_TO` (falling back to `CONTACT_EMAIL_TO`), with the same event
deduplicated to one mail per hour while every occurrence is still counted. The
alerts appear under **/admin → Driftlarm** with a badge in the sidebar that is
visible from every page, and each one can be acknowledged — the acknowledgement
covers the event, not the row, so a storm is cleared once.

It never throws, and it never blocks the thing that raised it: a broken SMTP or
an unreachable database must not turn a handled exception into a 500 that Stripe
then retries.

Wired into: webhook handler failure, paid session with no matching order,
reconciliation failures, `stock_exception`, amount mismatch, disputes, refunds
made outside /admin, failed customer email, low stock.

Files: [opsAlerts.ts](web/src/lib/opsAlerts.ts), [alerts/page.tsx](web/app/admin/(dashboard)/alerts/page.tsx), [AlertList.tsx](web/src/components/admin/AlertList.tsx), migration [0024](web/drizzle/0024_ops_alerts.sql)

---

## 2. P1 — money or orders can go wrong today

### 2.1 A refund issued in the Stripe Dashboard never reached our books ✅

`updateRefundStatus` updated `refunds` by `stripe_refund_id` and recomputed the
order from the rows it found. A refund created in Stripe's own UI had no local
row, so the CTE returned nothing and the whole statement was a no-op — silently.
The order kept `payment_status = 'paid'`, `refunded_minor` stayed 0, and the VAT
that had been reversed was recorded nowhere.

**Now:** `refund.created`, `refund.updated`, `refund.failed` and `charge.refunded`
all route through `syncStripeRefund`. An unknown refund creates the local row from
the Stripe object — order found via `payment_intent`, VAT split by the same
`refundVatMinor` the admin path uses, `actor = 'stripe'` — and then raises an
alert. Known refunds just update their status. Idempotent in both directions.

**Found while fixing it:** `updateRefundStatus` summed only `succeeded` refunds
while `recordRefund` summed `pending` *and* `succeeded`. A refund sitting in
`pending` therefore reset `refunded_minor` to zero, and the admin — which offers
`total_minor - refunded_minor` as refundable — would have offered the same money
again. Both now count `pending` and `succeeded`.

[stripeRefunds.ts](web/src/lib/stripeRefunds.ts), [ordersDb.ts](web/src/lib/ordersDb.ts), [webhook/route.ts](web/app/api/stripe/webhook/route.ts)

### 2.2 Chargebacks and disputes were not handled at all ✅

No `charge.dispute.*` case existed. Stripe pulled the money and we learned
nothing: the order still read paid, stock was still consumed, and the evidence
deadline passed while the order looked normal.

**Now:** `charge.dispute.created` / `.updated` / `.closed` mark the order
`disputed`, write an `order_events` row carrying the dispute id, reason, amount
and `evidence_due_by`, and raise an alert with the deadline. A closed dispute
returns the order to `paid` if won and `refunded` if lost. Stock is deliberately
untouched — a dispute is not a refund and may still be won. Submitting evidence
stays manual in Stripe; knowing it exists no longer is.

The status mapping is a pure function with tests, including the rule that an
unknown future Stripe status is treated as closed-but-not-lost — better to leave
an order marked paid than to silently claim we lost money we still have.
[orderChecks.ts](web/src/lib/orderChecks.ts), [moneyPaths.test.ts](web/tests/moneyPaths.test.ts)

### 2.3 `stock_exception` was invisible in the admin ✅

`markOrderPaid` set the status and wrote the event correctly, but the order list
rendered neither: it showed payment and fulfilment status only, and the tone map
had no entry, so a paid-but-unshippable order looked like any other row.

**Now:** order `status` is rendered as its own tag next to the order number for
the states that need attention (lager saknas, tvist, misslyckad, makulerad,
utgången), and the list carries a red banner listing the affected order numbers.
The alert fires the moment the status is set.

[orders/page.tsx](web/app/admin/(dashboard)/orders/page.tsx)

### 2.4 Renaming a handle killed the old URL, silently ✅

The handle field is freely editable and the handle *is* the address. Redirects
lived hardcoded in `next.config.ts` and needed a deploy.

**Now:** a `url_redirects` table, written automatically whenever a product or
collection handle changes, recording who did it. The lookup runs where the page
would otherwise have called `notFound()` — not in the proxy, so ordinary traffic
pays nothing for it — and answers with a permanent redirect.

Chains collapse rather than stack: rename a→b then b→c and the first redirect is
rewritten to point at c. Reusing an old handle deletes the stale row instead of
creating a loop. Both behaviours were verified against the live schema.

**Also fixed on the way:** handles were stored raw from the form. "Täcke
Sebastian" typed into the handle field became a URL with a space and a non-ASCII
character. `updateProduct` and `updateCollection` now slugify, as creation
already did.

[redirectsDb.ts](web/src/lib/redirectsDb.ts), migration [0025](web/drizzle/0025_url_redirects.sql)

### 2.5 A dropped `checkout.session.expired` locked stock for up to 24 hours ✅

Release happened only via that webhook or the 03:00 reconciliation. A lost webhook
meant an abandoned checkout held real units for the rest of the day.

**Now:** the checkout route releases expired reservations before it reserves —
one indexed statement, at the exact moment stock matters to someone, wrapped so a
failure there can never fail the checkout itself.

[checkout/route.ts](web/app/api/checkout/route.ts)

### 2.6 Nothing compared our total to what Stripe charged ✅

`markOrderPaid` wrote Stripe's amounts over ours without looking at the
difference.

**Now:** the pending order's expected total is read before the overwrite and
compared. More than 1 kr apart raises `order.amount_mismatch` with both figures.
The payment is never blocked — Stripe remains the authority on what was collected;
we just stop discarding the signal. Tolerance and comparison are pure and tested.

---

## 3. P2 — operationally blind or manual

### 3.1 Stock history existed but was shown nowhere ✅

`inventory_movements` had every reservation, release, fulfilment, return and
manual adjustment since 0011, and no view rendered it.

**Now:** each variant row in the product card has a **Lagerhistorik** section —
type, quantity, actor, order and note, newest first — loaded when the row is
opened rather than with the page. Manual adjustments show their sign, since an
adjustment can go either way.

[inventoryDb.ts](web/src/lib/inventoryDb.ts), [ProductEditor.tsx](web/src/components/admin/ProductEditor.tsx)

### 3.2 A product could not be linked to Stripe from the admin ✅

The list flagged products without `stripe_product_id` in red, but the only cure
was a terminal script limited to landed-cost handles — so a product created in
/admin could never be linked at all.

**Now:** a "Koppla till Stripe" button in the product card, doing exactly what
the script does for one product: deterministic id from the handle, `shippable`,
SKUs in metadata, no Stripe prices (amounts stay dynamic and are sent as
`price_data` at checkout). Idempotent.

[stripeCatalog.ts](web/src/lib/stripeCatalog.ts)

### 3.3 Nothing stopped a half-finished product going live ✅

**Now:** a publishing checklist in the product card — image, at least one
*purchasable* variant (new variants default to not-for-sale, so "has variants"
was never the right measure), primary collection, English title, Stripe link. It
reports; it does not block. Publishing early is sometimes the right call.

### 3.4 A failed order email had no way back ✅

**Now:** the order page has a **Kundutskick** section showing the last logged
email event and offering to resend the confirmation, or the shipment notice when
one exists. Same send path as the webhook, so the customer gets identical
content. Failures raise an alert rather than sitting in `order_events`.

[orders/[id]/emails/route.ts](web/app/api/admin/orders/[id]/emails/route.ts)

### 3.5 Pricing rules had no history ✅

`pricing_config` was one row with a fixed id, and `CURRENT_PRICING_VERSION` was a
hardcoded `'v1'` stamped on every cart. Amounts on old orders were safe;
the *rule* behind them was not recoverable.

**Now:** every save archives the resulting config into
`pricing_config_versions` under a running version name, orders carry
`pricing_version`, and the version list is shown under /admin → Mängdrabatt. The
existing configuration was backfilled as v1, which is what carts already claimed.
Archiving swallows its own errors: a successful price change must not roll back
because the copy failed.

Migration [0028](web/drizzle/0028_pricing_config_history.sql)

### 3.6 No manual order entry, no invoice terms ⚠️

Unchanged, and deliberately so — see section 6.

### 3.7 Nothing exported orders or VAT for the bookkeeping ✅

**Now:** /admin → Export. Orders per period and refunds per period as CSV, plus
the whole catalogue as a file. Semicolon-separated with a BOM so Swedish Excel
opens them correctly; amounts as kronor with a decimal comma. Test-mode orders
are always excluded — they are not business events and must never reach a VAT
return. Each order row carries `vat_mode` and the rate in effect *for that order*,
which is why 0021 stored them per order in the first place.

The period's totals — net, output VAT, gross, refunded, VAT refunded — are shown
above the download, so an implausible figure is caught here rather than in the
return.

[bookkeepingExport.ts](web/src/lib/bookkeepingExport.ts), [catalogExport.ts](web/src/lib/catalogExport.ts)

### 3.8 No low-stock signal ✅

**Now:** the nightly run alerts on purchasable, tracked variants at or below
`LOW_STOCK_THRESHOLD` (default 5), measured as physical stock minus what open
orders have reserved — the same number checkout works from, not the shelf count.

---

## 4. P3 — friction and fragility

### 4.1 No duplicate, no bulk edit, no export

- **Duplicate ✅** — copies fields, variants and collection links as a *draft*,
  with no stock, no Stripe link, no images (two products sharing a blob means the
  first deletion takes the picture with it), and SKUs suffixed `-KOPIA`
  deliberately ugly so they cannot be missed.
- **Catalogue export ✅** — one row per variant, in /admin → Export.
- **Bulk edit ⏳** — still one click per variant. See section 6.

### 4.2 Variant order was accidental ✅

The admin sorted by SKU and the product page built its option buttons in
variant-id order, so 50x70 could appear after 60x90 with no way to change it.

**Now:** a `position` column, arrows in the product card (keyboard-operable,
like the images already had), and both the admin and the storefront ordering by
it. The backfill seeds SKU order — exactly what the admin showed before — so no
list changes appearance from the migration itself.

Migration [0027](web/drizzle/0027_variant_position.sql)

### 4.3 No "view on site" link ✅ — now in the product card header.

### 4.4 `createVariant` did not check the product exists ✅ — a bad id reached
the foreign key and returned an unexplained 500; it now answers 404.

### 4.5 Catalogue rendering worked by accident ✅

The pages exported `generateStaticParams` while `[locale]/layout.tsx` set
`dynamicParams = false` — a combination that normally 404s any handle that did
not exist at build time. Next resolves that route-wide, not per segment
(`build/static-paths/app.js` carries an explicit TODO saying so). It did not
bite only because the root layout awaits `headers()`.

**Now:** both catalogue pages declare `export const dynamic = 'force-dynamic'`
and no longer export `generateStaticParams`; `dynamicParams = false` is gone from
the locale layout, which already calls `notFound()` for an unknown locale in both
its metadata and its body. The handle lists remain in `staticParams.ts` where the
sitemap uses them.

Verified after `next build`: `prerender-manifest.json` still shows zero dynamic
routes and both catalogue routes render on demand — the same behaviour as before,
now on purpose rather than by side effect.

---

## 5. Ops, security, restore

### 5.1 Admin authentication is one shared password — partly ✅, rest ⚠️

**Now:** failed logins are rate-limited to 10 per IP per 15 minutes, and a
blocked attempt is written to the activity log. The 600 ms delay stays as a
second brake.

Still true, and still a decision: one shared password, self-selected identity, no
MFA, no roles. The same session that edits a product title can refund money.

[rateLimit.ts](web/src/lib/rateLimit.ts), migration [0026](web/drizzle/0026_rate_limits.sql)

### 5.2 Migrations were not atomic and had no lock ✅

The Neon HTTP driver sends one statement per request, so a file that failed
halfway left the database half-migrated *and* left `_migrations` untouched — the
next deploy replayed it from the top, which is safe for `IF NOT EXISTS` and not
safe for a data update or an `ADD CONSTRAINT`.

**Now:** each file is applied as one transaction with the `_migrations` row
written inside it, behind a `pg_advisory_xact_lock` so two concurrent builds
cannot both apply it. A file needing `CREATE INDEX CONCURRENTLY` opts out with
`-- migrate: no-transaction` on its first line and owns that risk explicitly.

[migrate.mjs](web/scripts/migrate.mjs)

### 5.3 `.env.example` was missing variables the code reads ✅

Eleven, not the fifteen first counted — `SMTP_SECURE`, `PRICE_WATCH_TO`,
`VAT_PERCENT` and `STRIPE_TAX_REGISTRATION_CONFIRMED` were present as commented
examples. The genuinely absent ones included `ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET` and `BLOB_READ_WRITE_TOKEN` — without which a fresh
environment has no admin login and no image uploads.

All are documented now, along with the new `OPS_ALERT_TO` and
`LOW_STOCK_THRESHOLD`. Only `NODE_ENV` is intentionally absent; the runtime sets
it.

### 5.4 No rate limiting on the public forms ✅

`/api/contact` and `/api/sample-request` are unauthenticated and send email.
Both are now limited to 5 per IP per hour and answer 429 with `Retry-After`.
The limiter fails open — a database outage must not close the contact form —
and expired buckets are pruned nightly.

### 5.5 Magic links stay replayable for two minutes — accepted

Deliberate and documented in `magicLink.ts`: a double POST must not show an error
to a customer who is already logged in. Recorded here as an accepted risk so it
is not rediscovered as a bug.

### 5.6 Nothing watched the logs ✅ — see section 1.

### 5.7 No documented backup or restore ✅

[RUNBOOK.md](web/RUNBOOK.md): where the truth lives for each question, what to do
when a customer has paid but no order exists, a paid order cannot ship, a dispute
or external refund arrives, an email fails, stock looks wrong; how to take a Neon
branch before a risky change and what to check after a restore; how to roll back
a deploy and why a migration does not roll back with it; the kill switch; and
what runs on its own.

### 5.8 Tests did not cover the money paths — partly ✅

**Now:** [moneyPaths.test.ts](web/tests/moneyPaths.test.ts) — the pure rules
(amount drift, dispute status mapping) run for real, and the invariants that live
in SQL are held by contract tests against the source, the same technique
`ownedCartContracts.test.ts` uses: refunds counted the same way in both places,
the webhook still handling disputes and external refunds, checkout still
releasing and reserving, stock still refusing to go below what is reserved.

A contract test does not prove the statement works. It makes it impossible to
delete by accident, which is how these holes appeared. Real database and Stripe
integration tests are still missing — section 6.

148 tests pass; TypeScript and ESLint are clean; the production build succeeds.

---

## 6. What is left

| # | Item | Why it is not done |
| --- | --- | --- |
| 1 | **Manual order entry, invoices, payment terms** ⚠️ | Not a defect — a product decision. B2B hotels buy by phone and email, and today that means typing the order in as the customer. Building it means an order-creation flow, invoice documents, credit terms and a dunning path. Needs your call on scope before any code. |
| 2 | **Bulk edit** ⏳ | Checkboxes in the product list with activate/deactivate/change supplier. Straightforward, roughly a day, and safe to add once the P1 work is deployed. CSV *import* deliberately last: it is the only one of these that can write damage across the catalogue. |
| 3 | **Per-person admin passwords, MFA on refunds** ⚠️ | Rate limiting closes the brute-force hole; the shared credential remains. Three hashes in env would give per-person identity without a user table. Worth deciding now that the admin can move money. |
| 4 | **Real DB/Stripe integration tests** ⏳ | Needs a disposable Neon branch and Stripe test fixtures in CI. The highest-value coverage left, and the largest single piece of work. |

Two operational notes:

- **Redirect backfill.** Handle changes made *before* today have no redirect row.
  `admin_activity` recorded them; a one-off script could replay them into
  `url_redirects`. Worth doing if any product has been renamed since launch.
- **Reconciliation cadence.** Still daily, because the Hobby plan allows one cron
  a day. The opportunistic release in checkout removes the worst consequence, but
  a lost webhook still waits until 03:00 for everything else. Changing plan is a
  one-line schedule change in `vercel.json`.

---

## 7. Rules for changing this while trading

1. **Additive migrations only.** Add a column nullable, backfill, then constrain
   in a later migration. Never rename or drop in the same deploy that changes the
   code reading it. All five migrations added today (0024–0028) are additive.
2. **Never remove a URL.** Every handle change is a redirect — automatic now, but
   the rule still governs anything done by hand in SQL.
3. **Keep the fallbacks.** Checkout must keep working without a Stripe product;
   the cart must keep pricing server-side; the webhook must stay idempotent.
   Everything added today is additive to those paths, not a replacement.
4. **Test-mode order first.** Each money-path change gets one live test-mode order
   through the whole flow — checkout, webhook, email, fulfilment, refund — before
   it is called done.
5. **One concern per deploy** while this batch goes out, so a rollback is a
   decision and not an archaeology exercise.

---

## 8. Deploying this batch

Migrations 0024 and 0025 are **already applied** to the live database (see the
note in the session log — they were run while verifying the new transactional
migration runner). Both are additive and empty; the deployed code does not yet
reference them.

0026 (`rate_limits`), 0027 (`product_variants.position`) and 0028
(`pricing_config_versions`, `orders.pricing_version`) apply automatically on the
next deploy, each in its own transaction.

Order of verification after deploying:

1. `/admin → Driftlarm` renders and the sidebar badge shows 0.
2. Change a product handle; the old URL redirects.
3. Open a variant; the stock history loads.
4. Export the current month; the totals match Stripe's dashboard for the period.
5. One test-mode order end to end, then refund it from Stripe's dashboard and
   confirm the refund and its VAT appear here without anyone touching /admin.
