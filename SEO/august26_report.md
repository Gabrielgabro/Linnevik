# Linnevik SEO and AI Visibility Audit

**Audit date:** 5 August 2026  
**Website:** [www.linnevik.se](https://www.linnevik.se/)  
**Primary objective:** Increase Linnevik's visibility among hotel-industry buyers in Sweden and relevant international markets, while making the company and its products easy for search engines and AI systems to understand and cite.

> **Implementation status — completed in the repository on 5 August 2026.** The canonical, indexing, locale-routing, code-owned localization and entity-markup fixes in this report have been implemented and passed TypeScript validation. Deployment is still required for the live site to reflect them. Shopify-owned English catalog translations remain an external follow-up.

## Implementation record — 5 August 2026

The following audit findings have been implemented:

- Standardized generated canonical, `hreflang`, Open Graph, sitemap, robots and product-schema URLs on `https://www.linnevik.se`.
- Removed the homepage's canonical trailing-slash redirect chain.
- Made the root locale redirect permanent and added an application-level permanent redirect from the non-`www` host to `www`.
- Rebuilt sitemap inclusion around commercial, indexable pages only; removed login, registration, internal search and legal utility pages; removed false `lastmod` timestamps.
- Removed the `/_next/` robots block and added explicit allow rules for OAI-SearchBot, ChatGPT-User, Claude-SearchBot and PerplexityBot.
- Added noindex metadata to login, account, activation, reset, cart, search, checkout and thank-you routes.
- Validated locale route parameters and disabled unknown locale parameters, preventing routes such as `/llms.txt` from rendering as a Swedish homepage.
- Added server-rendered `lang="sv"` and `lang="en"` values using locale-aware request headers.
- Corrected code-owned English metadata and UI text, including the English About description, contact phone number, product lead-time label and product-information heading.
- Added Organization JSON-LD on the homepages and connected product schema to the Linnevik brand and organization entity.
- Stamped 5 August 2026: stopped setting the locale cookie on already-localized public responses; the cookie is now persisted only on explicit language-switcher clicks.
- Stamped 5 August 2026: added schema-only `BreadcrumbList` JSON-LD on product and collection pages.
- Stamped 5 August 2026: expanded product JSON-LD with variant, MOQ, pack-size, VAT-excluded B2B price basis and seller data using existing product data only.
- Stamped 5 August 2026: added `npm run check:localization` for Swedish/English translation key parity and common language-leak checks.
- Corrected the Terms pages from the irrelevant Galil Textile AB to Linneviken AB, Linnevik's legal daughter company, while preserving Södra Vanadistvätten AB as the prominently stated parent company.
- Corrected product missing-resource handling to return a real 404 and backend collection failures to surface as failures rather than indexable HTTP-200 error pages.
- Normalized product meta-description whitespace before truncation.

Still required outside this repository:

- Translate Shopify-owned English product titles, descriptions, options and collection descriptions.
- Add Linneviken AB's verified organization number to the Terms and Organization schema when available.
- Deploy the changes, then resubmit the sitemap and request recrawls in Google Search Console and Bing Webmaster Tools.

## Executive summary

Linnevik has a crawlable, server-rendered website and some sound SEO foundations, but it is not currently positioned to win important non-brand searches such as “hotelltextilier”, “hotellinne leverantör” or “hotel textile supplier Sweden.”

Heuristic readiness scores:

| Area | Score | Assessment |
|---|---:|---|
| Technical SEO | 4/10 | Crawlable, but canonical, redirect, sitemap, language and status-code signals conflict |
| On-page SEO | 4/10 | Basic metadata exists, but commercial keywords and procurement language are weak |
| Content and search-intent coverage | 2/10 | Almost no dedicated solution, guide or case-study content |
| International SEO | 2/10 | Separate URLs exist, but substantial English pages remain Swedish |
| Entity authority and trust | 2/10 | Conflicting business details and little third-party corroboration |
| AI discoverability | 4/10 | Crawl access is open and content is server-rendered, but entity data and citable content are weak |
| Overall | **3.5/10** | Strong potential once foundational conflicts and content gaps are addressed |

The highest-impact work is:

1. Correct conflicting host, redirect, canonical and sitemap signals.
2. Repair English localization and explicit language signals.
3. Build dedicated landing pages around hotel procurement intent.
4. Establish a consistent, machine-readable company identity.
5. Publish case studies and operational expertise that search engines and AI systems can cite.

## Audit scope and methodology

The audit covered:

- Repository inspection of the Next.js application, metadata, routing, sitemap, robots rules, structured data, translations and public page templates.
- Direct HTTP checks against the live production site.
- Review of all 62 URLs in the live XML sitemap.
- Live HTML inspection of Swedish and English home, about, contact, collection, product, search and login pages.
- Directional search-result sampling for relevant Swedish and English commercial queries.
- AI crawler access, machine-readable identity and answer-engine readiness.
- Competitor positioning and content coverage.

The search-result sample is directional and is not a substitute for Google Search Console or a dedicated rank-tracking platform.

A reliable Core Web Vitals trace could not be completed. The dedicated performance profiler was unavailable, and Google's public PageSpeed endpoint was quota-blocked. Observable caching and loading risks are included, but LCP, INP and CLS must still be measured with a proper mobile trace.

## What is already working

- Important pages return meaningful server-rendered HTML. Crawlers do not depend on client-side JavaScript for primary content.
- Swedish and English use separate URLs.
- Self-referencing canonicals and reciprocal `hreflang` logic exist conceptually.
- A sitemap is generated and contains 62 URLs.
- Product pages contain basic `Product` JSON-LD.
- Products, collections, the company story, contact information and sample ordering are internally linked.
- Public content is allowed by the wildcard rule in `robots.txt`, including OAI-SearchBot, Claude-SearchBot and PerplexityBot.
- Branded pages and some product and collection pages are indexed, including the English About page and the Swedish Sebastian duvet page.
- The About page contains useful factual material: industry history, hotel partner count and bespoke project count.

OpenAI says OAI-SearchBot must be allowed for content to be included in ChatGPT search summaries and citations. Perplexity likewise recommends allowing PerplexityBot for search inclusion.

Sources: [OpenAI publisher guidance](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq), [Perplexity crawler guidance](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).

## Critical technical findings

### 1. Every sitemap URL redirects

All 62 sitemap entries use `https://linnevik.se/...`, while production redirects those URLs to `https://www.linnevik.se/...` with HTTP 307.

The non-`www` hostname is also used for:

- Canonicals
- `hreflang` URLs
- Open Graph URLs
- Product schema URLs
- The sitemap URL declared in `robots.txt`

This creates contradictory signals: redirects favor `www`, while canonicals and the sitemap favor non-`www`. Google recommends aligning redirects, canonicals, internal links and sitemap URLs on one preferred form.

The main source is [`web/src/lib/metadata.ts`](../web/src/lib/metadata.ts), although several pages also hardcode the non-`www` host.

Additionally, the homepage canonical is `https://linnevik.se/sv/`. It first redirects to the `www` host and then redirects again to remove the trailing slash before reaching `https://www.linnevik.se/sv`.

**Impact:** Critical. Crawl resources and canonical signals are being spent reconciling a URL choice that should be unambiguous.

**Recommendation:** Standardize all generated and hardcoded URLs on `https://www.linnevik.se`, without a trailing slash on localized homepages. Ensure internal links, canonicals, `hreflang`, schema, sitemap and Open Graph URLs all match.

Source: [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### 2. Temporary redirects are used for permanent URL choices

- `linnevik.se` to `www.linnevik.se` returns HTTP 307.
- `/` to `/sv` returns HTTP 307.

If `www` and Swedish are permanent defaults, these should normally use permanent 308 or 301 redirects. Google treats permanent redirects as canonical signals, while 307 is a temporary redirect.

**Recommendation:** Use a single permanent redirect from each alternate URL to the final canonical destination. Avoid redirect chains.

Source: [Google redirect documentation](https://developers.google.com/search/docs/crawling-indexing/301-redirects).

### 3. The sitemap reports false freshness

Every request assigns `lastModified: new Date()` to every URL in [`web/app/sitemap.ts`](../web/app/sitemap.ts). This tells crawlers all 62 pages changed at the moment the sitemap was requested.

The sitemap also gives almost every content and utility page a high priority and daily change frequency, even when the page is essentially static.

**Recommendation:**

- Use actual Shopify `updatedAt` timestamps for products and collections.
- Use real editorial modification dates for static pages.
- Omit `lastmod` where no accurate date exists.
- Remove login, registration and search pages from the sitemap.
- Include only preferred, canonical, HTTP 200 URLs.

Source: [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=en).

### 4. Public pages lack an HTML language attribute

The rendered document begins with:

```html
<html dir="ltr">
```

There is no `lang="sv"` or `lang="en"` because [`web/app/layout.tsx`](../web/app/layout.tsx) does not set it.

**Impact:** This weakens language classification, accessibility, pronunciation and automatic translation.

**Recommendation:** Render the correct BCP 47 language value for every localized page.

### 5. Unsupported file paths become false homepages

`/llms.txt` and `/llms-full.txt` currently return:

- HTTP 200
- `text/html`
- The Swedish homepage

They do not return a text file or a 404. File-like paths bypass middleware and are captured as a locale by `[locale]`, after which the invalid locale is normalized to Swedish. The relevant routing behavior is in [`web/middleware.ts`](../web/middleware.ts).

This is both a soft-404/index-quality problem and a direct AI-discoverability problem, because agents requesting `/llms.txt` receive misleading HTML.

**Recommendation:**

- Validate locale route parameters and call `notFound()` for unsupported locales.
- Serve a real `text/plain; charset=utf-8` `/llms.txt`, or return a correct 404 until one exists.
- Apply the same logic to `/llms-full.txt`.

`llms.txt` remains an optional and emerging convention, not a ranking shortcut. Chrome describes it as a machine-readable summary that can help agents understand a site's purpose and key links.

Source: [Chrome llms.txt documentation](https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt?hl=en).

### 6. Public pages are not CDN-cacheable

Both `/sv` and `/en` return:

```text
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

The middleware sets a locale cookie on every localized response. This likely forces otherwise public pages out of Vercel's CDN cache.

**Impact:** Potentially slower time to first byte, reduced cache efficiency and higher crawl cost.

**Recommendation:** Avoid setting the locale cookie on every cacheable public response. Set it only when a user explicitly changes locale, or otherwise separate personalization from public page delivery.

### 7. Search and account utility pages are indexable

The sitemap includes:

- `/search`
- `/login`
- `/login/create-account`

Search pages already appear in search results despite containing little useful content.

**Recommendation:** Apply `noindex, follow` and remove from the sitemap:

- Internal search
- Login and account creation
- Cart and checkout
- Thank-you pages
- Verification and activation pages
- Password reset and forgotten-password pages
- Private account pages

### 8. Error states can return HTTP 200

The product page renders a small `<div>` when a product does not exist rather than calling `notFound()` in [`web/app/[locale]/products/[handle]/page.tsx`](../web/app/%5Blocale%5D/products/%5Bhandle%5D/page.tsx). Collection API failures also render an error page under a successful response.

**Impact:** Soft 404s, transient error content in search results and misleading crawler signals.

**Recommendation:**

- Return a real 404 for missing products and collections.
- Return an appropriate 5xx status for temporary backend failures.
- Do not emit indexable fallback metadata such as “Error – Linnevik.”

### 9. `/_next/` is blocked in robots.txt

The live `robots.txt` blocks `/_next/`, which contains public CSS, JavaScript and other Next.js resources.

**Recommendation:** Remove the restriction unless a verified crawler test proves that public page rendering remains complete without those resources. Keep genuinely private API and account routes restricted or noindexed as appropriate.

### 10. Sitemap quality is diluted by low-value URLs

Of the 62 sitemap URLs:

- 32 are localized product URLs.
- 10 are localized collection URLs.
- 20 are static pages, including login, registration and search.

The sitemap should represent pages Linnevik actively wants shown in search results. Utility URLs dilute that purpose.

## Language and localization findings

International SEO is presently one of the site's weakest areas.

- The English About page has a Swedish meta description.
- English product pages frequently have Swedish titles, descriptions and structured data.
- Static labels including “Leveranstid” and “Produktinformation” remain Swedish on English product pages.
- The English “Pillows & Blankets” collection contains a Swedish description.
- `/en/collections/madrasskydd` is titled “Badrum.”
- Swedish collections without descriptions fall back to English text such as “Browse Badrum at Linnevik.”
- Both languages share untranslated Swedish handles.

Sharing handles across languages is technically valid, but localized slugs would improve usability and keyword relevance where stable redirect mappings can be maintained.

Because visible page content determines language, `hreflang="en"` does not repair a page whose main product content is Swedish.

**Recommendations:**

1. Complete Shopify translations for every title, description, option, collection and product specification.
2. Localize all hardcoded UI labels in product and collection templates.
3. Write locale-specific metadata rather than generic fallbacks.
4. Add automated checks that compare page language with the route locale.
5. Do not launch additional languages until each can be maintained fully.

Source: [Google multilingual-site guidance](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites).

## On-page SEO findings

### Homepage

The Swedish homepage title is broadly relevant, but its meta description contains a visible duplication:

> Linnevik levererar hållbara och hållbara textilier...

The H1, “En ny identitet för ditt hotell,” is attractive brand language but weak for discovery. The main heading should state what Linnevik sells and for whom.

Suggested positioning:

> Hotelltextilier utvecklade för professionell tvätt och daglig drift

The homepage should naturally introduce the main commercial entities:

- Hotelltextilier
- Hotellinne
- Sängkläder för hotell
- Handdukar och frotté
- Kuddar och täcken
- Morgonrockar och tofflor
- Skräddarsydda hotellprodukter
- Brodyr and private label
- Professionell tvätt
- Sweden and the Nordics

### Collection pages

The collection taxonomy is generic and sometimes semantically inconsistent:

- The handle `madrasskydd` represents the “Badrum” collection.
- “Featured” is indexable despite having little independent search intent.
- Descriptions are frequently short, absent or untranslated.
- Titles do not consistently include “för hotell” or another B2B qualifier.

Each category should explain:

- Who the product is designed for
- Commercial-laundry suitability
- Materials, weight, dimensions and construction
- MOQ and volume pricing
- Delivery and sample process
- Customization, embroidery and private-label options
- Relevant certifications
- Links to related guides and customer cases

### Product pages

The strongest product descriptions contain useful operational detail, especially the Sebastian duvet. However:

- Meta descriptions are cut at 160 characters without normalizing whitespace or completing a sentence.
- Product imagery can receive empty alt text when Shopify alt text is missing.
- English pages duplicate Swedish product data.
- Product headings do not consistently add hotel-use context.
- The structured price may be misleading for B2B products. The page states that the price is based on 50 units and excludes VAT, while schema presents a simple single-item offer.

### Navigation and internal linking

The primary navigation concentrates on Products, Search, Login, Cart and Contact. It does not prominently expose the company's expertise, custom services, case studies or knowledge content.

**Recommendation:** Add top-level navigation or strong contextual links for:

- Hotel textiles
- Custom solutions
- References/case studies
- Knowledge/guides
- About Linnevik
- Samples/contact

## Search visibility assessment

Directional searches were performed for:

- hotelltextilier Sverige leverantör
- hotellinne leverantör Sverige
- hotellhanddukar hotell företag Sverige
- hotellsängkläder leverantör
- hotel textiles supplier Sweden
- Linnevik hotelltextilier

Linnevik appeared for branded queries and some product pages, but it did not appear among the surfaced results for the sampled non-brand commercial searches.

Competitors surfaced included:

- [Hotex](https://hotex.se/om-oss/)
- [Ernst Hotel Supply](https://www.ernsths.se/om-oss/)
- [HTL-Service](https://www.htl-service.se/sv)
- [Fritz Magnus](https://www.fritzmagnus.se/)
- [VarUnik](https://varunik.se/sa-arbetar-vi)
- [LUSINI](https://www.lusini.com/sv-se/series/saengklaeder-linon/)

These competitors generally use more explicit procurement language around product categories, hotel specialization, customization, professional laundering, certifications and operational benefits.

Searches for the Linnevik brand outside its own domain also surfaced an unrelated Swedish place named Linnevik, including travel pages. This makes entity disambiguation and third-party corroboration especially important.

## Recommended keyword and landing-page architecture

| Search intent | Suggested primary page | Purpose |
|---|---|---|
| hotelltextilier / hotelltextil leverantör | `/sv/hotelltextilier` | Central commercial category hub |
| hotellinne / hotellakan | `/sv/hotelltextilier/sangklader` | Hotel bed-linen procurement |
| hotellhanddukar / frotté hotell | `/sv/hotelltextilier/handdukar-frotte` | Bathroom and spa textiles |
| hotellkuddar och täcken | `/sv/hotelltextilier/kuddar-tacken` | Bedding inserts and operational specifications |
| hotellmorgonrockar / spatextilier | `/sv/hotelltextilier/morgonrockar-spa` | Spa, bathrobe and slipper range |
| skräddarsydda hotellprodukter | `/sv/skraddarsytt-hotell` | Bespoke products and development process |
| brodyr / private label hotell | `/sv/private-label-brodyr` | Branding and customization |
| textilier för hotelltvätt | `/sv/kunskap/textilier-professionell-tvatt` | Operational expertise and laundry durability |
| hotel textile supplier Sweden | `/en/hotel-textile-supplier-sweden` | International commercial landing page |
| custom hotel textiles Scandinavia | `/en/custom-hotel-textiles` | International bespoke-services page |

English commercial pages should launch only after the underlying product, collection and service content is genuinely translated and Linnevik's service geography is clearly defined.

## AI and answer-engine visibility

### Current strengths

- Important content is available as rendered HTML.
- Major AI search crawlers are not blocked by the wildcard robots rule.
- Basic product structured data exists.
- The About page contains potentially useful factual claims.

### 1. No reliable entity definition

Only `Product` schema is implemented in [`web/src/components/JsonLd.tsx`](../web/src/components/JsonLd.tsx).

Add `Organization`, `OnlineStore` or the most accurate business subtype on the homepage or About page with verified values for:

- `name`
- `alternateName`
- `legalName`
- `url`
- `logo`
- `description`
- `foundingDate`
- `email`
- `telephone`
- Postal address
- VAT or organization identifier
- Service area
- `sameAs` links to official external profiles
- Relationship between Linnevik and Södra Vanadistvätten AB

Google recommends Organization schema partly to disambiguate organizations and their administrative details.

Source: [Google Organization schema guidance](https://developers.google.com/search/docs/appearance/structured-data/organization).

### 2. Conflicting business facts weaken trust

Before the correction implemented on 5 August 2026, the site presented conflicting business details. The Terms pages incorrectly named Galil Textile AB, while the footer and contact pages named Södra Vanadistvätten AB. The repository now identifies Linneviken AB as Linnevik's legal daughter company and Södra Vanadistvätten AB as its parent company, while removing Galil Textile AB.

The remaining entity information presented on the site is:

- Footer copyright: Södra Vanadistvätten AB
- Legal Terms entity: Linneviken AB
- Parent company shown on the site and in schema: Södra Vanadistvätten AB
- Swedish contact phone: `+46 73 897 02 39`
- English contact phone: `+46 8 123 456 78`
- Contact visiting address: Tumba
- Terms address: Bromma

The English phone number has also been aligned with the Swedish contact number. Add the verified organization number as the final missing company-identity field, then reuse the complete source of truth in schema, social profiles and business directories.

### 3. Very little independently corroborated entity evidence

The sampled search results found little credible third-party material associating Linnevik with hotel textiles. AI systems are more likely to cite or confidently recommend an entity when claims are supported by independent sources.

Recommended authority-building sources include:

- Approved client supplier pages
- Hotel case studies published or linked by the hotel
- Hospitality trade publications
- Swedish and Nordic supplier directories
- Trade-fair and association profiles
- Consistent LinkedIn and Google Business profiles
- Manufacturer and certification partner pages

### 4. No citable customer stories

Client logos are labeled “References,” but there are no pages explaining:

- The hotel and project context
- Operational problem
- Products supplied
- Volume or property type
- Laundry and durability requirements
- Customization process
- Result
- Approved customer quote

Detailed case studies would support rankings, conversion, brand authority and AI citations simultaneously.

### 5. No knowledge layer

AI answers favor specific, well-supported passages. Linnevik should publish practical answers about:

- GSM
- Thread count
- Percale versus sateen
- Commercial-laundry durability
- Replacement cycles
- Par levels
- MOQ and lead times
- Certifications
- Embroidery and private label
- Total cost per use

### 6. Broken `llms.txt`

Serve a real, concise `text/plain` Markdown document after core company facts and priority pages are corrected. It should include:

- A one-paragraph verified company definition
- Main service geography
- Primary product and service categories
- Links to the authoritative About, product-category, custom-service, certification and contact pages
- Links to the strongest guides and customer cases
- A clear explanation of legal and brand relationships

Do not treat `llms.txt` as a substitute for regular HTML content, schema, internal linking or authority.

### 7. Structured data should be expanded carefully

Add:

- `Organization` or the most accurate merchant subtype
- `BreadcrumbList` on product and collection pages
- Richer `Product` and `ProductGroup` markup for variants
- `brand`, `seller`, SKU/MPN/GTIN where available
- Shipping and return-policy information where accurate
- `Article` for guides and case studies

The present `Product` schema contains name, description, image, SKU and a basic Offer. It omits brand and seller identity and models only the first variant.

For B2B pricing, ensure schema accurately reflects the visible MOQ, quantity basis, VAT treatment and purchase availability. Structured data must not imply that a single unit can be purchased at a volume price when that is not true.

Source: [Google Product structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/product).

## Recommended content program

The strongest topics are those closest to actual hotel procurement decisions.

### Buyer guides

- Guide till hotelltextilier: kvalitet, livslängd och kostnad per användning
- Percale eller satin för hotell?
- Vilken GSM bör hotellhanddukar ha?
- Så påverkar professionell tvätt livslängden på hotellinne
- Hur många uppsättningar sänglinne behöver ett hotell?
- Så väljer hotell kuddar och täcken för olika rumstyper
- Standardprodukt, brodyr eller helt skräddarsytt?
- MOQ och ledtider för specialdesignade hotellprodukter
- Certifieringar för hotelltextilier: OEKO-TEX, GOTS och EU Ecolabel
- Så räknar du total kostnad per användning för hotelltextilier

### Case studies

Create individual, approved customer cases for Nobis, Blique, Ligula, Freys and other references where permission exists.

Each case should include attributable facts, original photography, relevant products, operational constraints, result, internal product links and an approved quote.

### Commercial FAQ content

Answer questions such as:

- What is Linnevik's minimum order quantity?
- Can hotels order free samples?
- Which products are stocked versus made to order?
- Which products tolerate industrial laundering?
- Can Linnevik embroider logos or create custom packaging?
- What countries does Linnevik deliver to?
- What are normal lead times?
- Which certifications apply to each product?
- Does pricing include VAT, freight and customs?

FAQ content should be visible, useful page content. Schema alone is not a substitute.

## Prioritized roadmap

### Phase 0: First 1–2 weeks

1. Standardize all URLs on `https://www.linnevik.se`.
2. Make permanent redirects match that canonical choice.
3. Remove homepage trailing-slash canonical conflicts.
4. Rebuild the sitemap with final HTTP 200 URLs and truthful modification dates.
5. Remove utility pages from the sitemap and apply `noindex`.
6. Add the correct HTML `lang` value.
7. Validate locales and return real 404s for unsupported values.
8. Fix `/llms.txt` and `/llms-full.txt` behavior.
9. Remove the `/_next/` robots restriction.
10. Correct English product, collection and metadata content.
11. Resolve legal entity, phone and address inconsistencies.
12. Avoid setting a locale cookie on every cacheable public response.
13. Ensure missing resources return 404 and temporary failures return 5xx.

### Phase 1: Weeks 2–6

1. Create the hotel-textile landing-page architecture.
2. Rewrite collection titles, descriptions and introductory content around B2B search intent.
3. Add Organization, Breadcrumb and richer Product schema.
4. Publish the first three buyer guides.
5. Publish at least two detailed customer cases.
6. Improve Open Graph images and product image alt text.
7. Add clear trust content for certifications, manufacturing, laundry testing, MOQ, delivery regions and service model.
8. Add stronger internal navigation to services, knowledge and references.

### Phase 2: Months 2–4

1. Publish one substantive guide or case study every two weeks.
2. Secure approved links from hotel clients and hospitality partners.
3. Build consistent LinkedIn, Google Business and relevant industry-directory profiles.
4. Pursue hospitality trade publications and supplier directories.
5. Expand English only around markets Linnevik can serve effectively.
6. Track a fixed set of Google, Bing, ChatGPT and Perplexity discovery queries monthly.

## Measurement plan

### Search measurement

- Configure a Google Search Console domain property.
- Submit the corrected sitemap.
- Review Pages/Indexing, Crawl Stats, Core Web Vitals and Enhancements.
- Export at least 16 months of query and page data where available.
- Separate branded and non-branded impressions and clicks.
- Track average position and click-through rate for each intent cluster.
- Configure Bing Webmaster Tools and submit the sitemap there.

### AI visibility measurement

- Track referrals from ChatGPT, Perplexity and other AI assistants in analytics.
- Review server/CDN logs for OAI-SearchBot, Claude-SearchBot and PerplexityBot.
- Verify that crawler requests receive HTTP 200 without CAPTCHA, authentication, WAF or rate-limit blocks.
- Maintain a monthly prompt set covering supplier recommendations, product categories, commercial laundry and bespoke hotel textiles.
- Record whether Linnevik is mentioned, cited and linked, and which source pages are selected.

### Conversion measurement

SEO success should be judged by qualified hotel-industry demand, not traffic alone. Track:

- Sample requests
- Contact-form completions
- Click-to-call and click-to-email actions
- Account applications
- Quote requests
- Leads by landing page and query cluster
- Lead quality, property type and estimated purchasing value

## Performance measurement still required

No reliable Core Web Vitals values were available during this audit. A follow-up mobile performance audit should measure:

| Metric | Target |
|---|---:|
| LCP | Under 2.5 seconds |
| INP | Under 200 milliseconds |
| CLS | Under 0.1 |
| TTFB | Under 800 milliseconds |

The follow-up should specifically test:

- The effect of `private, no-store` responses and locale cookies on TTFB.
- Collection pages that mark many images as priority.
- Duplicate light/dark logo preloads.
- Shopify image weight and responsive sizes.
- Font loading and render delay.
- Third-party analytics and visit logging.
- Mobile interaction performance for search, cart, currency and sample flows.

These targets follow current Core Web Vitals guidance, but Linnevik's actual values must be measured before performance changes are prioritized.

## Final assessment

Linnevik's core problem is not an inability to be crawled. Search engines can read the site, and several pages are already indexed. The larger problem is that the site sends inconsistent technical and entity signals while offering too little content for high-intent hotel procurement searches.

The immediate technical corrections will improve crawl efficiency and prevent index-quality problems. The larger growth opportunity comes from combining Linnevik's real operational advantage—hotel and laundry experience since 1986—with explicit commercial landing pages, verifiable business information, detailed customer cases and practical procurement guidance.

That combination will make Linnevik easier to rank, easier to trust and substantially easier for AI systems to identify, summarize and cite.
