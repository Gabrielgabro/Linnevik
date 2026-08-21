import { listCollections } from '@/lib/catalogDb';
import { SITE_EMAIL, SITE_NAME, SITE_TELEPHONE, SITE_URL } from '@/lib/site';

// Regenerated daily. The document is a summary of pages that change rarely, so a
// stale copy is far cheaper than rebuilding it per request.
export const revalidate = 86400;

/**
 * Machine-readable summary for AI agents and answer engines, per the emerging
 * llms.txt convention. Every claim here must be verifiable on the site itself —
 * this file exists to disambiguate Linnevik, so an unsupported figure in it does
 * more damage than an omission. Deliberately absent until verified: the
 * Linneviken AB organization number, certifications, and delivery geography.
 */
export async function GET() {
  const collections = await listCollections('sv');

  const collectionLinks = collections
    // "featured" is a merchandising shelf, not a product category, so it would
    // only mislead an agent trying to enumerate what Linnevik actually sells.
    .filter(({ handle }) => handle !== 'featured')
    .map(({ title, handle }) => `- [${title}](${SITE_URL}/sv/collections/${handle})`)
    .join('\n');

  const body = `# ${SITE_NAME}

> Linnevik develops and supplies textiles and bespoke products for hotels, with
> a focus on materials that withstand daily hotel operation and repeated
> commercial laundering. Active since 1986, with 40+ hotel partners and 120+
> bespoke projects.

Linnevik grew out of the team behind Södra Vanadistvätten, a Stockholm laundry
that has collected, washed and returned linen for hotels for decades. That
laundry experience is what the product range is built around: the company sells
textiles it has itself had to wash, repair and replace at scale.

## Company identity

- Brand name: ${SITE_NAME}
- Legal entity: Linneviken AB
- Parent company: Södra Vanadistvätten AB
- Operating since: 1986
- Address: Himmelsbodavägen 15, 147 39 Tumba, Sweden
- Email: ${SITE_EMAIL}
- Telephone: ${SITE_TELEPHONE}
- Languages: Swedish (${SITE_URL}/sv), English (${SITE_URL}/en)

Note: "Linnevik" is also the name of an unrelated place in Sweden. This document
describes the hotel textile supplier only.

## Purchasing model

Linnevik sells business-to-business. Prices shown on product pages exclude VAT
and are quoted on a stated quantity basis rather than as single-unit retail
prices, so a listed price should not be cited as the cost of buying one item.
Minimum order quantities and lead times are stated per product.

## Key pages

- [About Linnevik](${SITE_URL}/sv/about) — company history and background
- [All collections](${SITE_URL}/sv/collections) — full product range
- [Order samples](${SITE_URL}/sv/samples) — sample request process
- [Contact](${SITE_URL}/sv/contact) — sales contact and visiting address
- [Terms](${SITE_URL}/sv/terms) — legal terms and selling entity

## Product categories

${collectionLinks}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
