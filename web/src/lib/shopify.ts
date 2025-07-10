const domain = process.env.SHOPIFY_STORE_DOMAIN!;
const token  = process.env.SHOPIFY_STOREFRONT_TOKEN!;

export async function getFirstProduct() {
  const q = /* GraphQL */ `
    { products(first: 1) { edges { node { id title } } } }
  `;
  const res = await fetch(`https://${domain}/api/2024-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query: q }),
    next: { revalidate: 60 },      // ISR-cache
  });
  return res.json();
}

