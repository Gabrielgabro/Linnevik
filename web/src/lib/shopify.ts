const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;
const DEFAULT_API_VERSION = '2024-07';
const LEGACY_API_VERSION = '2024-04';

type FetchArgs = {
    query: string;
    variables?: Record<string, unknown>;
    apiVersion?: string;
    language?: 'SV' | 'EN';
};

async function storefrontFetch<T>({
                                      query,
                                      variables,
                                      apiVersion = DEFAULT_API_VERSION,
                                      language = 'SV',
                                  }: FetchArgs): Promise<T> {
    const endpoint = `https://${SHOPIFY_DOMAIN}/api/${apiVersion}/graphql.json`;

    // Add language to variables if not already present
    const finalVariables = {
        ...variables,
        language,
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN,
        },
        body: JSON.stringify({ query, variables: finalVariables }),
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

export async function getFeaturedProducts(first = 6, language: 'SV' | 'EN' = 'SV') {
    const FEATURED_QUERY = `
    query Featured($handle: String!, $first: Int!, $language: LanguageCode!) @inContext(language: $language) {
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
        language,
    });

    let nodes = data.collection?.products.edges.map(edge => edge.node) ?? [];

    if (!nodes.length) {
        const FALLBACK_QUERY = `
      query All($first: Int!, $language: LanguageCode!) @inContext(language: $language) {
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
            language,
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

export async function getProductByHandle(handle: string, language: 'SV' | 'EN' = 'SV') {
    const PRODUCT_QUERY = `
    query Product($handle: String!, $language: LanguageCode!) @inContext(language: $language) {
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
        language,
    });

    return data.product;
}

export async function getAllProducts(first = 100, language: 'SV' | 'EN' = 'SV') {
    const PRODUCTS_QUERY = `
    query AllProducts($first: Int!, $language: LanguageCode!) @inContext(language: $language) {
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
            language,
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

export async function getAllCollections(first = 30, language: 'SV' | 'EN' = 'SV') {
    const COLLECTIONS_QUERY = `
    query AllCollections($first: Int!, $language: LanguageCode!) @inContext(language: $language) {
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
            language,
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

export async function getCollectionByHandle(handle: string, first = 12, after?: string, language: 'SV' | 'EN' = 'SV') {
    const COLLECTION_QUERY = `
    query Collection($handle: String!, $first: Int!, $after: String, $language: LanguageCode!) @inContext(language: $language) {
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
        language,
    });

    return data.collection;
}

export async function getProductsBasic(first = 60, queryStr?: string, language: 'SV' | 'EN' = 'SV') {
    const PRODUCTS_QUERY = /* GraphQL */ `
    query Products($first: Int!, $query: String, $language: LanguageCode!) @inContext(language: $language) {
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
        language,
    });

    return data.products.edges.map(edge => edge.node) as Array<{
        id: string;
        title: string;
        handle: string;
        productType?: string | null;
        featuredImage?: { url: string; altText?: string | null } | null;
    }>;
}

// Cart functions
export async function createCart() {
    const CREATE_CART_MUTATION = `
    mutation CreateCart($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product {
                      id
                      title
                      handle
                      featuredImage { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

    const data = await storefrontFetch<any>({
        query: CREATE_CART_MUTATION,
        variables: { input: {} },
    });

    return data.cartCreate.cart;
}

export async function getCart(cartId: string) {
    const GET_CART_QUERY = `
    query GetCart($cartId: ID!) {
      cart(id: $cartId) {
        id
        checkoutUrl
        totalQuantity
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
        lines(first: 100) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price { amount currencyCode }
                  product {
                    id
                    title
                    handle
                    featuredImage { url altText }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

    const data = await storefrontFetch<any>({
        query: GET_CART_QUERY,
        variables: { cartId },
    });

    return data.cart;
}

export async function addToCart(cartId: string, variantId: string, quantity: number) {
    const ADD_TO_CART_MUTATION = `
    mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product {
                      id
                      title
                      handle
                      featuredImage { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

    const data = await storefrontFetch<any>({
        query: ADD_TO_CART_MUTATION,
        variables: {
            cartId,
            lines: [{ merchandiseId: variantId, quantity }],
        },
    });

    return data.cartLinesAdd.cart;
}

export async function updateCartLine(cartId: string, lineId: string, quantity: number) {
    const UPDATE_CART_MUTATION = `
    mutation UpdateCart($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product {
                      id
                      title
                      handle
                      featuredImage { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

    const data = await storefrontFetch<any>({
        query: UPDATE_CART_MUTATION,
        variables: {
            cartId,
            lines: [{ id: lineId, quantity }],
        },
    });

    return data.cartLinesUpdate.cart;
}

export async function removeFromCart(cartId: string, lineIds: string[]) {
    const REMOVE_FROM_CART_MUTATION = `
    mutation RemoveFromCart($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
          }
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product {
                      id
                      title
                      handle
                      featuredImage { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

    const data = await storefrontFetch<any>({
        query: REMOVE_FROM_CART_MUTATION,
        variables: { cartId, lineIds },
    });

    return data.cartLinesRemove.cart;
}
