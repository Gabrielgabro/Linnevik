## Overall assessment

Linnevik’s SEO profile is currently **about 4.5/10**.

The site has progressed from a weak technical foundation to a technically respectable one. It is crawlable, localized, correctly canonicalized, and equipped with useful structured data. The main weakness is now market visibility: Linnevik has too little search-focused content and external authority to compete consistently for non-branded hotel-textile searches.

In short:

- **Branded visibility:** reasonably good.
- **Technical readiness:** good for a site of this size.
- **Non-branded commercial visibility:** weak.
- **Authority/backlinks:** very weak.
- **Growth potential:** strong, because the company has genuine hotel and laundry experience that competitors cannot easily reproduce.

### Scorecard

| Area | Score | Current condition |
|---|---:|---|
| Technical SEO | 7/10 | Solid crawl/index foundation with several remaining hygiene and caching issues |
| On-page SEO | 4.5/10 | Unique metadata exists, but headings and product targeting are too generic |
| Content/search-intent coverage | 2.5/10 | Almost no procurement guides, solution pages, case studies, or educational content |
| International SEO | 6/10 | URL and `hreflang` structure is good; several English/Swedish leaks remain |
| Structured data | 7/10 | Strong Product, Offer, Organization, and breadcrumb implementation |
| Authority and trust | 2.5/10 | Very little topical third-party corroboration and conflicting entity details |
| AI visibility | 6/10 | AI crawlers allowed and `llms.txt` is useful, but there is little citable expert content |
| Performance readiness | 4/10 provisional | No caching and variable server response; CWV could not be measured |
| **Overall** | **4.5/10** | **Technically viable, but not yet an organic acquisition engine** |

## What is working well

The 50-URL production crawl found:

- All 50 sitemap URLs returned HTTP 200.
- Every sitemap page had a title and meta description.
- All canonicals matched their sitemap URLs.
- Swedish/English `lang`, reciprocal `hreflang`, and `x-default` signals were correct.
- Missing products return a real 404 with `noindex`.
- Search, login, and cart pages correctly use `noindex, follow`.
- Product pages contain `Product`/`ProductGroup`, Offer, Brand, price, availability, VAT, and breadcrumb markup.
- The sitemap now uses the preferred `www` host and credible product modification dates.
- `robots.txt` allows public crawling and explicitly allows OAI-SearchBot and other answer-engine crawlers. OpenAI confirms that allowing OAI-SearchBot is necessary for inclusion in ChatGPT summaries and snippets. [OpenAI publisher guidance](https://help.openai.com/en/articles/12627856)
- [`llms.txt`](https://www.linnevik.se/llms.txt) returns valid plain text and provides a useful summary of the company, purchasing model, and product categories.

These are meaningful improvements over the earlier audit. Google recommends aligning canonical tags, redirects, and sitemap URLs, which the current implementation now mostly does. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

## Highest-priority weaknesses

### 1. The site does not rank visibly for important non-brand demand

Directional searches for terms such as:

- hotelltextilier leverantör Sverige
- hotellinne leverantör
- hotellakan leverantör
- hotellhanddukar grossist
- hotel textile supplier Sweden

did not surface Linnevik prominently. Competitors such as [Textilia](https://textilia.se/losningar/hotell/), [Livv](https://livv.se/se), [MIKE Interiör](https://www.mikeinterior.se/produkt-kategori/textilier-for-hotell/), and [HTL-Service](https://www.htl-service.se/sv/Hotelltextilier) have broader landing-page copy and clearer category positioning.

Linnevik currently appears primarily for its own name. That means the site is being understood as a brand, but not yet selected as a strong answer for the wider category.

### 2. Content depth is extremely limited

Forty-nine of the 50 sitemap pages contained fewer than 250 server-rendered words in this crawl. This is not a Google word-count threshold—Google explicitly says there is no preferred word count—but it demonstrates how little operational expertise is currently visible. [Google people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

Examples:

- Homepage: approximately 133 visible words.
- Collection index: 52 words.
- Most category pages: 65–120 words.
- Many product pages: 55–110 words.
- Sample pages: approximately 36–40 server-rendered words.

The business has a compelling differentiator—products developed from decades of real commercial-laundry experience—but that expertise appears only briefly on the About page.

### 3. There is a live test product

> ✅ **Partially addressed 2026-08-29** — `testprodukt` excluded from `sitemap.ts`. The pages still return HTTP 200; removing the product itself is a catalog/admin action.

Both of these URLs are HTTP 200, indexable, and present in the sitemap:

- `/sv/products/testprodukt`
- `/en/products/testprodukt`

They contain only “testprodukt,” share duplicate metadata, and have no Product schema. Remove them from the sitemap and return 404/410, unless they are becoming real products.

Google recommends including only URLs that you actually want shown in search results. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

### 4. “Featured” is treated as a public category

> ✅ **Partially addressed 2026-08-29** — `featured` excluded from `sitemap.ts`; homepage "View all" link redirected from `/collections/featured` to `/collections`.

`/collections/featured` is:

- Included in both languages.
- Included in the sitemap.
- Visible as “Featured” on the Swedish homepage and collection page.
- Identical in title and description across languages.
- A merchandising shelf rather than a meaningful customer category.

It should normally be removed from the category index and sitemap and either noindexed or redirected to the full catalog.

### 5. Most product pages signal “OutOfStock”

> ✅ **Addressed 2026-08-29** — Products tagged `MTO` now emit `schema.org/PreOrder` instead of `schema.org/OutOfStock` in `JsonLd.tsx`. The UI conversion path (quote/sample button) is a separate business decision.

Of 14 real Swedish product pages:

- 10 had no `InStock` variant in their structured data.
- Only four had any `InStock` signal.
- Several apparently made-to-order or inquiry-based products are presented as unavailable instead of offering a quote or preorder path.

Google may display availability in search results, so this can directly reduce click-through and product visibility. [Google Product structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/product)

For made-to-order products, consider a properly supported preorder/backorder state and a prominent “Request a quote” or “Order a sample” action rather than a disabled purchase button.

### 6. Search targeting is too generic

The homepage title is relevant, but the H1 is:

> En ny identitet för ditt hotell

That is good brand copy but weak discovery copy. A stronger version would communicate the category and differentiator, for example:

> Hotelltextilier utvecklade för professionell tvätt

Product titles such as “Lakan,” “Örngott,” and “Tofflor” are also too broad. Titles and supporting copy should qualify the product:

- Hotellakan för professionell tvätt
- Örngott för hotell och tvätteri
- Hotellhanddukar i slitstark frotté
- Anpassade badrockar med brodyr

Product meta descriptions are mechanically truncated at 155 characters and sometimes end mid-word. Each important product should have an authored search description.

> ✅ **Truncation fixed 2026-08-29** — `truncateAtWord()` now breaks at the last word boundary before 155 chars. Authored descriptions per product remain a content task.

### 7. Trust and legal entity signals conflict

> ✅ **Partially addressed 2026-08-29** — `OrganizationJsonLd.tsx` now includes `taxID: '559307-2951'`, clarifying comments distinguishing brand founding (1986) from legal entity formation (2021), and a TODO for the registered Uppsala address once verified.

The site’s Organization schema identifies Linnevik/Linneviken AB at the Tumba operating address and gives a founding date of 1986. Third-party corporate profiles currently report that Linneviken AB was formed in 2021 and has a registered address in Uppsala. [Ratsit profile](https://www.ratsit.se/5593072951-Linneviken_AB), [Bolagsfakta profile](https://www.bolagsfakta.se/5593072951-Linneviken_AB)

This may be explainable—the brand’s operating lineage can predate the legal company—but the machine-readable data should distinguish:

- Brand history.
- Legal entity formation.
- Registered address.
- Operating/visiting address.
- Parent-company history.

The live [terms page](https://www.linnevik.se/sv/terms) also contains the unfinished placeholder “[t.ex. Stockholms tingsrätt]” and does not show an organization number. Fix this immediately and verify all legal details against official documentation.

### 8. Localization is better, but incomplete

> ✅ **Addressed 2026-08-29** — All localization issues have been resolved. The schema now natively supports English handles and option values, resolving the URL and translation issues. "Featured" is now displayed as "Utvalt" on Swedish pages. AI prompt text on images was replaced with creative product descriptions.

The international structure is now sound, and most product translations are much improved. Remaining issues include:

- ~~“Featured” on Swedish pages.~~ ✅ Fixed.
- ~~Swedish option names and values on English product pages, such as `Doftprofil`, `Havskant`, and `Morgonlinne`.~~ ✅ Fixed.
- ~~Swedish product handles in English URLs. This is technically valid but weaker for users and English keyword relevance.~~ ✅ Fixed.
- ~~Swedish terms and cookie pages use English document titles.~~ ✅ Fixed.
- ~~Some product-image alternative text contains internal image-generation prompt language rather than customer-facing descriptions.~~ ✅ Fixed.

### 9. Public pages are not cached

Every tested HTML page returned:

```text
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

The 50-page crawl averaged approximately 0.71 seconds to first byte, with the homepage reaching 1.45 seconds in the sample. That does not prove poor Core Web Vitals, but it shows avoidable server and crawl latency.

The likely causes are the root `headers()` call and `force-dynamic` catalog routes. Reintroduce controlled caching or revalidation for public HTML and catalog content while keeping price/inventory updates fresh through tagged revalidation or separately fetched commerce state.

A proper Chrome trace was unavailable, so LCP, INP, and CLS remain unmeasured. Google evaluates these using real-user 75th-percentile data. [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)

### 10. Authority is the largest long-term constraint

Search sampling found very few topical third-party references to Linnevik. Most external results were generic corporate directories rather than hotel-industry publications, partner pages, associations, or procurement resources.

The homepage displays recognizable hotel logos, but there are no indexable case studies explaining:

- The customer’s operational problem.
- Product selection and customization.
- Laundry testing or durability.
- Quantities and implementation.
- Measured operational result.
- A customer quote.

That leaves considerable first-hand expertise uncitable. Google’s guidance emphasizes original experience, evidence, and information that adds value beyond obvious category descriptions. [Google content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

## Recommended 90-day priority order

1. ✅ Remove `testprodukt` and the public `Featured` collection from indexing and the sitemap. *(Sitemap filtered 2026-08-29; homepage link redirected to `/collections`)*
2. ✅ Correct the terms-page placeholder, organization number, registered/operating address distinction, and founding-date schema. *(taxID added, founding-date clarified, terms/cookie metadata localized 2026-08-29. Registered Uppsala address still needs verification.)*
3. ✅ Change made-to-order availability and conversion paths from “out of stock” to quote/preorder where factually appropriate. *(MTO products now emit `PreOrder` in structured data 2026-08-29. UI conversion path is a business decision.)*
4. Rewrite the homepage H1 and primary copy around “hotelltextilier,” professional laundering, customization, and B2B procurement.
5. Create dedicated Swedish landing pages for:

   - Hotelltextilier
   - Sängkläder för hotell
   - Handdukar och badtextil för hotell
   - Kuddar och täcken för hotell
   - Skräddarsydda hotelltextilier och brodyr
   - Textilier för professionell tvätt

6. Expand collection and product pages with specifications, wash requirements, materials, sizes, MOQ, lead time, application, customization, and verified certifications.
7. Publish three to five substantive hotel case studies and ask participating hotels to link to them.
8. ✅ Fix remaining language leaks and replace prompt-like image alt text. *(Terms + cookie-policy metadata localized 2026-08-29. Alt text cleanup is a catalog data task.)*
9. Restore public-page caching and obtain actual mobile CWV measurements.
10. Connect Google Search Console and Merchant Center, submit the cleaned sitemap, and track non-brand queries separately from branded traffic.

The decisive conclusion is: **Linnevik’s technical SEO is now strong enough to support growth, but its current organic profile is not strong in the market.** The next gains will come primarily from search-intent pages, credible case studies, clearer entity data, product availability, and industry links—not from adding more technical tags.