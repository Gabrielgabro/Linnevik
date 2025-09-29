// web/src/lib/shopify.ts
type FetchArgs = {
  query: string;
  variables?: Record<string, any>;
};

const domain = process.env.SHOPIFY_STORE_DOMAIN!;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN!;
const apiVersion = '2024-07';

const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;

async function shopifyFetch<T>({ query, variables }: FetchArgs): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storefront fetch failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    const message = json.errors.map((e: { message: string }) => e.message).join('\n');
    throw new Error(message);
  }
  return json.data as T;
}

const PRODUCT_CARD_FIELDS = `
  id
  handle
  title
  images(first: 1) {
    edges { node { url altText } }
  }
  priceRange {
    minVariantPrice { amount currencyCode }
  }
`;

export async function getFeaturedProducts(first = 6) {
  // 1) prova hämta kollektion "featured"
  const FEATURED_QUERY = `
    query Featured($handle: String!, $first: Int!) {
      collection(handle: $handle) {
        id
        title
        products(first: $first) {
          edges { node { ${PRODUCT_CARD_FIELDS} } }
        }
      }
    }
  `;

  type FeaturedData = {
    collection: {
      id: string;
      title: string;
      products: { edges: { node: any }[] };
    } | null;
  };

  const data = await shopifyFetch<FeaturedData>({
    query: FEATURED_QUERY,
    variables: { handle: 'featured', first },
  });

  let nodes = data.collection?.products.edges.map(e => e.node) ?? [];

  // 2) fallback: ta första N produkter om kollektionen saknas/tom
  if (!nodes.length) {
    const FALLBACK_QUERY = `
      query All($first: Int!) {
        products(first: $first, sortKey: UPDATED_AT, reverse: true) {
          edges { node { ${PRODUCT_CARD_FIELDS} } }
        }
      }
    `;
    const fb = await shopifyFetch<{ products: { edges: { node: any }[] } }>({
      query: FALLBACK_QUERY,
      variables: { first },
    });
    nodes = fb.products.edges.map(e => e.node);
  }

  return nodes as Array<{
    id: string;
    handle: string;
    title: string;
    images: { edges: { node: { url: string; altText: string | null } }[] };
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  }>;
}

export async function getProductByHandle(handle: string) {
  const q = `
    query Product($handle: String!) {
      product(handle: $handle) {
        id
        handle
        title
        descriptionHtml
        images(first: 10) { edges { node { url altText } } }
        options { name values }
        variants(first: 100) {
          edges {
            node {
              id
              title
              availableForSale
              price { amount currencyCode }
              selectedOptions { name value }
              sku
            }
          }
        }
        moq: metafield(namespace: "b2b", key: "moq") { value }
        packSize: metafield(namespace: "b2b", key: "pack_size") { value }
        leadTime: metafield(namespace: "b2b", key: "lead_time") { value }
      }
    }`;
  type T = {
    product: {
      id: string; handle: string; title: string; descriptionHtml: string;
      images: { edges: { node: { url: string; altText: string | null } }[] };
      options: { name: string; values: string[] }[];
      variants: { edges: { node: {
            id: string; title: string; availableForSale: boolean;
            price: { amount: string; currencyCode: string };
            selectedOptions: { name: string; value: string }[]; sku: string | null;
          } }[] };
      moq?: { value: string } | null;
      packSize?: { value: string } | null;
      leadTime?: { value: string } | null;
    } | null
  };
  const data = await shopifyFetch<T>({ query: q, variables: { handle } });
  return data.product;
}


export async function getAllCollections(first = 30) {
  const q = `
    query AllCollections($first: Int!) {
      collections(first: $first, sortKey: TITLE) {
        edges {
          node {
            id
            handle
            title
            image { url altText }
            products(first: 1) { edges { node { id } } }
          }
        }
      }
    }`;

  try {
    const data = await shopifyFetch<{ collections: { edges: { node: any }[] } }>({
      query: q,
      variables: { first }
    });

    return data.collections.edges.map(e => {
      const hasProducts = !!e.node.products?.edges?.length;
      return {
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        image: e.node.image as { url: string; altText: string | null } | null,
        hasProducts,
      };
    }).filter(c => c.hasProducts); // Bonus: Filtrera bort tomma kategorier
  } catch (err) {
    // Viktigt: krascha inte sidan om API-anropet misslyckas.
    console.error('getAllCollections failed:', err);
    return []; // Returnera en tom lista vid fel.
  }
}
export async function getCollectionByHandle(handle: string, first = 12, after?: string) {
  const q = `
    query Collection($handle: String!, $first: Int!, $after: String) {
      collection(handle: $handle) {
        id
        title
        description
        image { url altText }
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              handle
              title
              images(first: 1) { edges { node { url altText } } }
              priceRange { minVariantPrice { amount currencyCode } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
      // i getCollectionByHandle, inne i node { ... } för products
    node {
      id
      handle
      title
      tags
      images(first: 1) { edges { node { url altText } } }
      priceRange { minVariantPrice { amount currencyCode } }
    }
    }`;
  type T = {
    collection: {
      id: string; title: string; description: string | null;
      image?: { url: string; altText: string | null } | null;
      products: {
        edges: { cursor: string; node: any }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  };
  const data = await shopifyFetch<T>({ query: q, variables: { handle, first, after } });
  return data.collection;
}


// Sida för att ladda upp elementen till formuläret om att beställa prover

// web/src/lib/shopify.ts
const SF_VERSION = "2024-04";
const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;

type StorefrontResult<T> = { data?: T; errors?: any };

async function storefront<T>(query: string, variables?: Record<string, any>) {
  const res = await fetch(`https://${DOMAIN}/api/${SF_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await res.json()) as StorefrontResult<T>;
  if (json.errors) {
    console.error(json.errors);
    throw new Error("Shopify Storefront query failed");
  }
  return json.data!;
}

export async function getProductsBasic(first = 60, queryStr?: string) {
  const query = /* GraphQL */ `
    query Products($first: Int!, $query: String) {
      products(first: $first, query: $query, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            productType
            featuredImage { url altText }
          }
        }
      }
    }
  `;
  // Exempel: filtrera med text (titel, taggar m.m.) om ?q= finns
  const variables = {
    first,
    query: queryStr && queryStr.trim() ? queryStr.trim() : null,
  };
  const data = await storefront<{
    products: { edges: { node: any }[] };
  }>(query, variables);
  return data.products.edges.map(e => e.node) as Array<{
    id: string;
    title: string;
    handle: string;
    productType?: string | null;
    featuredImage?: { url: string; altText?: string | null } | null;
  }>;
}