const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;
const DEFAULT_API_VERSION = '2024-07';
const LEGACY_API_VERSION = '2024-04';

type FetchArgs = {
    query: string;
    variables?: Record<string, unknown>;
    apiVersion?: string;
};

async function storefrontFetch<T>({
                                      query,
                                      variables,
                                      apiVersion = DEFAULT_API_VERSION,
                                  }: FetchArgs): Promise<T> {
    const endpoint = `https://${SHOPIFY_DOMAIN}/api/${apiVersion}/graphql.json`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
        next: { revalidate: 0 },
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Storefront fetch failed: ${response.status} ${message}`);
    }

    const json = await response.json();
    if (json.errors) {
        const message = json.errors
            .map((error: { message: string }) => error.message)
            .join('\n');
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

    const data = await storefrontFetch<FeaturedData>({
        query: FEATURED_QUERY,
        variables: { handle: 'featured', first },
    });

    let nodes = data.collection?.products.edges.map(edge => edge.node) ?? [];

    if (!nodes.length) {
        const FALLBACK_QUERY = `
      query All($first: Int!) {
        products(first: $first, sortKey: UPDATED_AT, reverse: true) {
          edges { node { ${PRODUCT_CARD_FIELDS} } }
        }
      }
    `;

        const fallback = await storefrontFetch<{
            products: { edges: { node: any }[] };
        }>({
            query: FALLBACK_QUERY,
            variables: { first },
        });

        nodes = fallback.products.edges.map(edge => edge.node);
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
    const PRODUCT_QUERY = `
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
        collections(first: 5) {
          edges {
            node {
              id
              handle
              title
            }
          }
        }
        moq: metafield(namespace: "b2b", key: "moq") { value }
        packSize: metafield(namespace: "b2b", key: "pack_size") { value }
        leadTime: metafield(namespace: "b2b", key: "lead_time") { value }
      }
    }
  `;

    type ProductResult = {
        product: {
            id: string;
            handle: string;
            title: string;
            descriptionHtml: string;
            images: { edges: { node: { url: string; altText: string | null } }[] };
            options: { name: string; values: string[] }[];
            variants: {
                edges: { node: {
                        id: string;
                        title: string;
                        availableForSale: boolean;
                        price: { amount: string; currencyCode: string };
                        selectedOptions: { name: string; value: string }[];
                        sku: string | null;
                    } }[];
            };
            collections: {
                edges: { node: {
                        id: string;
                        handle: string;
                        title: string;
                    } }[];
            };
            moq?: { value: string } | null;
            packSize?: { value: string } | null;
            leadTime?: { value: string } | null;
        } | null;
    };

    const data = await storefrontFetch<ProductResult>({
        query: PRODUCT_QUERY,
        variables: { handle },
    });

    return data.product;
}

export async function getAllProducts(first = 100) {
    const PRODUCTS_QUERY = `
    query AllProducts($first: Int!) {
      products(first: $first, sortKey: TITLE) {
        edges {
          node {
            ${PRODUCT_CARD_FIELDS}
          }
        }
      }
    }
  `;

    try {
        const data = await storefrontFetch<{
            products: { edges: { node: any }[] };
        }>({
            query: PRODUCTS_QUERY,
            variables: { first },
        });

        return data.products.edges.map(edge => edge.node) as Array<{
            id: string;
            handle: string;
            title: string;
            images: { edges: { node: { url: string; altText: string | null } }[] };
            priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
        }>;
    } catch (error) {
        console.error('getAllProducts failed:', error);
        return [];
    }
}

export async function getAllCollections(first = 30) {
    const COLLECTIONS_QUERY = `
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
    }
  `;

    try {
        const data = await storefrontFetch<{
            collections: { edges: { node: any }[] };
        }>({
            query: COLLECTIONS_QUERY,
            variables: { first },
        });

        return data.collections.edges
            .map(edge => {
                const hasProducts = !!edge.node.products?.edges?.length;
                return {
                    id: edge.node.id,
                    handle: edge.node.handle,
                    title: edge.node.title,
                    image: edge.node.image as { url: string; altText: string | null } | null,
                    hasProducts,
                };
            })
            .filter(collection => collection.hasProducts);
    } catch (error) {
        console.error('getAllCollections failed:', error);
        return [];
    }
}

export async function getCollectionByHandle(handle: string, first = 12, after?: string) {
    const COLLECTION_QUERY = `
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
    }
  `;

    type CollectionResult = {
        collection: {
            id: string;
            title: string;
            description: string | null;
            image?: { url: string; altText: string | null } | null;
            products: {
                edges: { cursor: string; node: any }[];
                pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
        } | null;
    };

    const data = await storefrontFetch<CollectionResult>({
        query: COLLECTION_QUERY,
        variables: { handle, first, after },
    });

    return data.collection;
}

export async function getProductsBasic(first = 60, queryStr?: string) {
    const PRODUCTS_QUERY = /* GraphQL */ `
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

    const variables = {
        first,
        query: queryStr && queryStr.trim() ? queryStr.trim() : null,
    };

    const data = await storefrontFetch<{
        products: { edges: { node: any }[] };
    }>({
        query: PRODUCTS_QUERY,
        variables,
        apiVersion: LEGACY_API_VERSION,
    });

    return data.products.edges.map(edge => edge.node) as Array<{
        id: string;
        title: string;
        handle: string;
        productType?: string | null;
        featuredImage?: { url: string; altText?: string | null } | null;
    }>;
}
