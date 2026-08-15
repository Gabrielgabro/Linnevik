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
- The email magic-link authentication specified in this plan (line 7, line 35) is now built: `customer_login_tokens` (migration `0010`), `lib/customerSession.ts` for the signed session cookie, `lib/magicLink.ts` for issuance/consumption, and `/api/auth/magic-link` + `/api/auth/magic-link/consume`. It runs fully in parallel with Shopify login — nothing in the existing login/registration path was touched — and becomes the active path at cutover. Details and open items below.
- Automated tests currently pass: 65 of 65 tests, and TypeScript validation and lint pass with zero errors.

### Not yet complete

- The product catalog itself (title, options, images, descriptions on `/products/[handle]`) and search are still read from Shopify’s GraphQL API, not the owned `products`/`productVariants` tables — that is a separate, larger migration and was deliberately left alone. The owned cart resolves the Shopify variant id it's handed back to its own numeric variant id via `productVariants.shopifyVariantId` (see `resolveVariantIdByShopifyId` in `lib/cartDb.ts`), so cart/checkout could be cut over without waiting on the catalog-read migration.
- No end-to-end test has exercised the magic-link flow against a real database (request → email → click → session cookie → account access). Unit tests cover token hashing/expiry logic, email/rate-limit input validation, and session cookie signing in isolation.
- Rate limiting on link requests is enforced by counting rows in `customer_login_tokens` per email and per IP over a rolling window — adequate for launch traffic, but it is a database read on every request, not a dedicated limiter. Revisit if magic-link volume grows enough to matter.
- Stripe automatic tax remains disabled until the Swedish tax registration has been confirmed and `STRIPE_TAX_REGISTRATION_CONFIRMED` is enabled.
- Owned checkout currently supports Swedish delivery addresses only.
- Database integration tests and full Stripe payment, webhook, expiration, inventory, refund, and fulfillment end-to-end tests are still missing.
- The connected database currently contains no owned carts, customers, orders, or processed Stripe webhook events, so the complete owned purchase flow has not yet been proven end to end.

### Magic-link authentication: what was built and how it fails safely by design

A prior status entry found that the six-digit "email verification" module (`lib/emailVerification.ts`, `/login/verify-email`) had no working back end: nothing issued codes, the page was unreachable, and the verifier accepted any six digits as valid — a rubber stamp, not a check. Rather than fix that module, it has been **deleted** and replaced with the magic-link system the migration plan actually specifies (line 7, line 35).

**Design decisions worth recording:**

- **Login, not registration.** `POST /api/auth/magic-link` only sends a link to an email that already matches a row in `customers`. It never creates an account. Registration still requires company name, org number, and B2B terms acceptance per this plan (line 36); that belongs to `handleRegister`, not to a login mechanism.
- **The response never reveals whether an address is a customer.** The endpoint always answers `{ ok: true }`, whether the email is unknown, rate-limited, or SMTP is down. An attacker probing addresses gets identical responses either way. Only the server log distinguishes the cases.
- **Tokens are hashed at rest.** Only `sha256(token)` is stored in `customer_login_tokens`; a database read alone can't produce a working session.
- **Consumption is atomic.** `claimMagicLinkToken` uses `UPDATE ... WHERE consumed_at IS NULL ... RETURNING`, so two concurrent requests for the same token cannot both succeed.
- **The scanner problem is handled by construction, not by luck.** Corporate email security (Microsoft Defender for Office 365 Safe Links is the relevant one, given the customer base) pre-fetches links in incoming mail over plain GET before a human ever opens the message. A magic link that logs in on GET would be silently burned by the scanner before the recipient clicks it. `/login/verify` therefore only renders a button on GET; the token is consumed only by the POST that button sends, which a scanner does not perform. A short idempotent-replay window on the consume endpoint additionally absorbs an accidental double-submit (network retry, double click) without erroring out a customer who already has a valid session.
- **Two more email vectors: contact and sample-request.** The escaping fix already applied to `/api/contact` and `/api/sample-request` in a previous pass covers those. This build adds no new user-supplied-HTML surface — the magic-link email interpolates only a server-generated URL, and that interpolation is also escaped (see `tests/emailTemplates.test.ts`).

Everything above is implemented and unit-tested. What is *not* done is listed under "Not yet complete": no live SMTP test, and no proof against a real database.

### Update 15-8: registration, order history, and the cart/checkout cutover

The four remaining gaps between "login works" and "our own backend accounts, matching what Shopify did" have been closed:

- **Registration (`handleRegister`, `app/[locale]/login/actions.ts`) no longer calls Shopify at all.** It writes the customer directly into Postgres via `registerCustomer` (`lib/commerceOperations.ts`), storing the org number in `customers.tax_id` instead of a Shopify metafield, and — instead of Shopify's password-activation email — sends the same magic link a returning customer would get (`requestMagicLink`). Duplicate emails are rejected with the existing "account already exists" message rather than a Shopify API error. `/login` and `/login/create-account` no longer touch `lib/shopifyAdmin.ts`.
- **Order history on `/account` reads from the owned `orders`/`order_items` tables** for anyone signed in via the magic-link session (`getOwnedCustomerOrders` in `lib/customerAccount.ts`), shaped into the same structure the page already rendered. Shopify GraphQL is now only consulted as a fallback for customers still on the legacy Shopify cookie.
- **The storefront cart and checkout are wired to the owned backend behind `OWNED_COMMERCE_ENABLED`** (default `false`, documented in `web/.env.example`). `CartProvider` (`src/contexts/CartContext.tsx`) takes the flag as a prop from the root layout and, when it's on, talks to `/api/store/cart/*` instead of the Shopify-backed `/api/cart`, adapting the response into the same `Cart` shape every consumer (`Header`, `CartClient`, `ProductForm`, `CheckoutButton`) already expected — none of those components needed to change their own logic. `CheckoutButton` now sends `cartId` straight through to the already-owned-aware `/api/checkout` route instead of rebuilding a Shopify line-items array. The region/currency selectors hide themselves when the flag is on, since owned checkout is Sweden/SEK-only.
- Flipping `OWNED_COMMERCE_ENABLED=true` is still the one deliberate step left before any of this serves real traffic — see "Not yet complete" above for what hasn't been proven end to end yet (SMTP, inventory reservation, a live database run).

### Update 15-8: kategorierna, och en tyst dataförlust som de avslöjade

Symptomet var att påslakan saknade kategori och att det inte gick att sätta den till Sängkläder. Två skilda fel låg bakom, och det ena hade förstört data.

- **Kategorikopplingen fanns, men `is_primary` var falsk.** Brödsmulan bygger på just den flaggan (`getProductBreadcrumb`), så produkten såg kopplad ut i admin och kategorilös på sajten. Aktivitetsloggen visar att sparningen gick igenom utan fel — klienten skickade `primaryCollectionId: null`. Orsaken satt i gränssnittet: kryssrutan och radioknappen "Primär" var två skilda klick, och radioknappen låg låst tills rutan var ikryssad, så ett klick i fel ordning försvann tyst. `CollectionPanel` väljer nu primär åt användaren — första ikryssade kategorin blir primär, och kryssar man ur den flyttas märket — och `parsePrimaryCollectionId` avvisar numera både en primär utanför urvalet och ett urval helt utan primär, i stället för att som förr släppa den tyst.
- **`parseProductInput` nollade varje fält som anropet inte skickade med.** `text()` svarar `null` både för "tomrensat" och för "aldrig skickat", och Drizzle skriver `null` men hoppar över `undefined`. Kategoripanelen skickar bara sina kategori-id:n, så varje sparning där tömde engelsk titel, båda beskrivningarna, varumärke, typ och SEO-fälten. Det är exakt vad som hände påslakan 15-8 kl. 13:33. Systerparsrarna `parseCollectionInput` och `parseVariantInput` hade redan rätt vakt; produktparsern har den nu också, med regressionstest i `tests/productsInput.test.ts`.
- **Påslakan är återställd** från Shopify med `scripts/restore-paslakan.mjs` — samma kolumner och samma källa som `catalog:migrate` skriver. Ingen produkt saknar längre primär kategori.
- **`seo_title_en` och `seo_description_en` gick inte att redigera alls** — kolumnerna fanns, men varken formuläret eller parsern kände till dem. Båda finns nu i `ContentPanel`.

**Kategoriträdet når nu sajten.** `listCollections` i `catalogDb.ts` hade noll anropare: hela trädet som redigeras i admin — förälder, ordning, tvåspråkiga titlar, `active` — var skrivet men aldrig inkopplat, och varje kategorisida på sajten lästes fortfarande från Shopify. Därför gjorde `parent_id` ingen skillnad för någon besökare. Nu läser `/collections`, `/collections/[handle]`, `CategoriesTeaser` och `getCollectionStaticParams` ur våra egna tabeller:

- Översikten ritar rötterna med sina barn under sig, och antalet produkter räknas över hela underträdet.
- En kategorisida visar sina underkategorier och produkterna i hela underträdet, så en förälder är något annat än en tom rubrik. Verifierat genom att tillfälligt lägga Sängkläder under Kuddar & Täcken: översikten nästlade, antalet gick 6 → 11, och brödsmulan blev `Kuddar & Täcken › Sängkläder › Påslakan`. Trädet är återställt till fem rötter.
- Sidbrytningen gick från Shopifys markör (`?after=`) till `?page=N`.

Produktsidan och sökningen läser fortfarande katalogen från Shopify — det är samma separata migrering som förut, se "Ännu inte klart".

### Update 15-8: sortimentsspärren, engelskan och handlen

Tre saker som stod som öppna ovan är nu stängda. Den första var feldiagnostiserad i en tidigare version av det här stycket, och rättelsen är värd att skriva ut.

- **`product_variants.active` är inte trasig — den är ett beslut.** En enda sats 14-8 kl. 18:07:04.873 satte `active = false` på 35 varianter, och de sex produkter som blev kvar är exakt de sex i `src/data/landedCost.ts`, alltså de vi lagerför. `available_for_sale` kommer från Shopify och betyder "finns i lager"; `active` är vårt eget beslut om att varan går att beställa hos oss alls. `cartRules` kräver båda, och det är rätt.

  Felet var i stället att sajten erbjöd de tio andra produkterna ändå — pris i listorna och en aktiv köpknapp för något kassan skulle neka. Nu går alla säljytor efter samma villkor som `cartRules`:
  - `getCollectionPage` räknar "från"-pris bara på varianter som är både `active` och `available_for_sale`. Produkten listas fortfarande — den är verklig och har en sida — men utan pris.
  - Produktsidan väger in `getPurchasableShopifyVariantIds` innan den skickar varianterna vidare, så knappen säger "Kan inte beställas" i stället för att vara avstängd utan förklaring. Samma tillgänglighet går in i den strukturerade datan, som annars hade påstått "InStock" om något vi inte säljer.
  - `FeaturedGrid` filtrerar på samma sätt via `filterPurchasableHandles`.

  Kopplingen produkt → Shopify-variant är komplett: alla 55 varianter har `shopify_variant_id`.

- **Kategoriernas engelska texter var svenska.** Shopify har ingen engelsk översättning av kategorierna, så `@inContext(language: EN)` svarade med den svenska texten och importen skrev in den. Migrering `0012` sätter riktiga engelska titlar och beskrivningar, villkorat på att engelskan fortfarande är identisk med svenskan så att en handskriven rättelse aldrig skrivs över.

- **Kategorin med handle `madrasskydd` hette `Badrum`.** Den döptes om i Shopify utan att handlen följde med — Shopify behåller handlen vid namnbyte — och handlen är adressen. `0012` byter den till `badrum`, och `next.config.ts` har en permanent omdirigering från den gamla adressen på båda språken.

- **Importen skriver inte längre över det vi äger.** `catalog:migrate` nycklade på `handle`, vilket efter namnbytet hade skapat en dubblettkategori i stället för att hitta raden den redan har — och den skrev över `title_en`/`description_html_en` med den svenska texten vid varje körning, alltså återinförde felet `0012` just rättat. Upserten nycklar nu på `shopify_collection_id`, rör inte handlen, och fyller de engelska kolumnerna bara när de är tomma. Verifierat mot databasen: samma upsert träffar rad 1, behåller `badrum` och `Bathroom`, och antalet kategorier står kvar på fem.

### Ännu inte klart efter den här omgången

- Produktsidan och sökningen läser fortfarande katalogtexten från Shopify. Det är samma separata migrering som förut.
- `title_en` och `description_html_en` på **produkterna** är fortfarande svenska av samma skäl som kategorierna var det. Bara kategorierna är översatta hittills.
- Kategorisidan visar beskrivningen som ren text, precis som Shopify-versionen gjorde, så kontaktlänken i Sängkläders beskrivning renderas inte som en länk.

### Update 15-8: SMTP-handskakningen är bevisad, och lagerreservationen är byggd

Två poster som stod under "Not yet complete" är stängda och har därför tagits bort därifrån.

- **Utskicket fungerar på riktigt.** Inloggningen mot `smtp.wsr.se:465` (implicit TLS) godkändes och ett provmejl från `"Linnevik" <noreply@linnevik.se>` togs emot av servern (`250 2.0.0 Ok: queued as 1B8D619AD06`) och levererades till en extern Outlook-adress. Testet använde exakt samma transportkonfiguration och `From`-format som `lib/mailer.ts` bygger, så resultatet gäller appens egna utskick. Kvar att kontrollera: `Authentication-Results` i det mottagna mejlet, alltså att SPF, DKIM och DMARC var för sig står på pass. Servern accepterade utskicket och Microsoft levererade det, men ingetdera bevisar att DKIM-signaturen är inpassad mot `linnevik.se` — och strikt `adkim=s` är just det som fäller ett utskick i större volym eller hos en strängare mottagare.
- **Lagret reserveras nu vid betalning.** Migrering `0011_inventory.sql` och `lib/inventoryDb.ts` ger `reserveOrderStock`, `releaseOrderStock`, `releaseExpiredReservations`, `fulfillReservedStock` och `recordInventoryReturn`. `ordersDb.ts` reserverar när Stripe bekräftar betalningen, släpper vid misslyckad betalning och vid annullering, och drar av vid utleverans. Överförsäljningsrisken som stod beskriven här är därmed borta.
- **Produktionsmiljön har fått e-postkonfigurationen** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM` och `CONTACT_EMAIL_TO` (satt till `info@linnevik.se`, inte den obevakade `noreply@`-lådan som fallbacken annars hade valt). `SMTP_PASS` och `CUSTOMER_SESSION_SECRET` saknas fortfarande i produktion och måste läggas till manuellt; utan `SMTP_PASS` är `mailConfigured()` falsk och varje utskick hoppas tyst över, vilket är precis vad kontaktformuläret på den publika sajten gjort hittills.

### Readiness decision

Customer accounts, order history, and the cart/checkout path all now run on owned infrastructure when `OWNED_COMMERCE_ENABLED` is on, matching what Shopify used to do in each of those areas — that flag is the entire remaining cutover switch for this slice. The product catalog itself is the one storefront-facing piece still read from Shopify (see "Not yet complete") and was intentionally left out of this pass as a separate migration. Before flipping the flag for real traffic: add `SMTP_PASS` and `CUSTOMER_SESSION_SECRET` to the production environment, confirm the SPF/DKIM/DMARC verdicts on the delivered test message, and run the complete owned purchase flow (cart → checkout → Stripe webhook → order → reservation → fulfillment mail) against a real database at least once.