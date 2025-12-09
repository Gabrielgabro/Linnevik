import { DEFAULT_LANGUAGE, toShopifyLanguage, type ShopifyLanguage } from './languageConfig';
import { cookies } from 'next/headers';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;
const DEFAULT_API_VERSION = '2024-07';
const LEGACY_API_VERSION = '2024-04';

export type FetchArgs = {
  query: string;
  variables?: Record<string, unknown>;
  apiVersion?: string;
  language?: ShopifyLanguage;
  country?: string; // ISO 2-letter country code, e.g. "SE", "US"
};

export async function storefrontFetch<T>({
  query,
  variables,
  apiVersion = DEFAULT_API_VERSION,
  language = toShopifyLanguage(DEFAULT_LANGUAGE),
  country,
}: FetchArgs): Promise<T> {
  const endpoint = `https://${SHOPIFY_DOMAIN}/api/${apiVersion}/graphql.json`;

  // Resolve country from cookie if not provided
  let resolvedCountry = country;
  try {
    if (!resolvedCountry) {
      const cookieStore = await cookies();
      resolvedCountry = cookieStore.get('SHOP_COUNTRY')?.value || 'SE';
    }
  } catch {
    // noop for environments where cookies() is not available
    resolvedCountry = resolvedCountry || 'SE';
  }

  // Add language and country to variables if not already present
  const finalVariables = {
    ...variables,
    language,
    country: resolvedCountry,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables: finalVariables }),
    next: { revalidate: 3600 }, // Revalidate every hour (ISR)
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

export async function getFeaturedProducts(first = 6, language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)) {
  const FEATURED_QUERY = `
    query Featured($handle: String!, $first: Int!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
      query All($first: Int!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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

export async function getProductByHandle(handle: string, language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)) {
  const PRODUCT_QUERY = `
    query Product($handle: String!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
        tags
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
        edges: {
          node: {
            id: string;
            title: string;
            availableForSale: boolean;
            price: { amount: string; currencyCode: string };
            selectedOptions: { name: string; value: string }[];
            sku: string | null;
          }
        }[];
      };
      collections: {
        edges: {
          node: {
            id: string;
            handle: string;
            title: string;
          }
        }[];
      };
      moq?: { value: string } | null;
      packSize?: { value: string } | null;
      leadTime?: { value: string } | null;
      tags?: string[];
    } | null;
  };

  const data = await storefrontFetch<ProductResult>({
    query: PRODUCT_QUERY,
    variables: { handle },
    language,
  });

  return data.product;
}

export async function getAllProducts(first = 100, language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)) {
  const PRODUCTS_QUERY = `
    query AllProducts($first: Int!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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

export async function getAllCollections(first = 30, language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)) {
  const COLLECTIONS_QUERY = `
    query AllCollections($first: Int!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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

export async function getCollectionByHandle(handle: string, first = 12, after?: string, language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)) {
  const COLLECTION_QUERY = `
    query Collection($handle: String!, $first: Int!, $after: String, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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

// Simple cache for products by language (5 minute TTL)
const productsCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getProductsBasic(first = 60, queryStr?: string, language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)) {
  // CRITICAL INSIGHT: Shopify's search query parameter ONLY searches the store's default language
  // regardless of @inContext. This means if your store's default is Swedish:
  // - Searching "glass" with @inContext(EN) will NOT find products with English title "glass"
  // - You must search using the DEFAULT language terms (Swedish)
  //
  // SOLUTION: Fetch ALL products in the requested language, then filter client-side
  // This works because @inContext DOES translate the returned data

  const PRODUCTS_QUERY = /* GraphQL */ `
    query Products($first: Int!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
      products(first: $first, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            productType
            tags
            featuredImage { url altText }
          }
        }
      }
    }
  `;

  // Check cache first
  const cacheKey = `${language}_${first}`;
  const cached = productsCache.get(cacheKey);
  const now = Date.now();

  let products: any[];

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    // Use cached data
    products = cached.data;
  } else {
    // Fetch ALL products in the requested language
    const data = await storefrontFetch<{
      products: { edges: { node: any }[] };
    }>({
      query: PRODUCTS_QUERY,
      variables: { first },
      apiVersion: LEGACY_API_VERSION,
      language,
    });

    products = data.products.edges.map(edge => edge.node);

    // Cache the results
    productsCache.set(cacheKey, { data: products, timestamp: now });
  }

  // If search query provided, filter client-side
  if (queryStr && queryStr.trim()) {
    const searchTerm = queryStr.trim().toLowerCase();
    products = products.filter(product => {
      // Search in title (most important)
      if (product.title?.toLowerCase().includes(searchTerm)) return true;

      // Search in product type
      if (product.productType?.toLowerCase().includes(searchTerm)) return true;

      // Search in tags
      if (product.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm))) return true;

      return false;
    });
  }

  return products as Array<{
    id: string;
    title: string;
    handle: string;
    productType?: string | null;
    tags?: string[];
    featuredImage?: { url: string; altText?: string | null } | null;
  }>;
}

// Cart functions
export async function createCart(language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE), country?: string) {
  const CREATE_CART_MUTATION = `
    mutation CreateCart($input: CartInput!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await storefrontFetch<any>({
    query: CREATE_CART_MUTATION,
    variables: {
      input: country ? { buyerIdentity: { countryCode: country } } : {}
    },
    language,
    country,
  });

  if (data.cartCreate.userErrors?.length) {
    const message = data.cartCreate.userErrors.map((e: any) => e.message).join(', ');
    console.error('cartCreate error:', message);
    throw new Error(message);
  }

  return data.cartCreate.cart;
}

export async function getCart(
  cartId: string,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE),
  country?: string
) {
  const GET_CART_QUERY = `
    query GetCart($cartId: ID!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
    language,
    country,
  });

  return data.cart;
}

export async function addToCart(
  cartId: string,
  variantId: string,
  quantity: number,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE),
  country?: string
) {
  const ADD_TO_CART_MUTATION = `
    mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
        userErrors {
          field
          message
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
    language,
    country,
  });

  if (data.cartLinesAdd.userErrors?.length) {
    const message = data.cartLinesAdd.userErrors.map((e: any) => e.message).join(', ');
    console.error('cartLinesAdd error:', message);
    throw new Error(message);
  }

  return data.cartLinesAdd.cart;
}

export async function updateCartLine(
  cartId: string,
  lineId: string,
  quantity: number,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE),
  country?: string
) {
  const UPDATE_CART_MUTATION = `
    mutation UpdateCart($cartId: ID!, $lines: [CartLineUpdateInput!]!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
    language,
    country,
  });

  return data.cartLinesUpdate.cart;
}

export async function removeFromCart(
  cartId: string,
  lineIds: string[],
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE),
  country?: string
) {
  const REMOVE_FROM_CART_MUTATION = `
    mutation RemoveFromCart($cartId: ID!, $lineIds: [ID!]!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
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
    language,
    country,
  });

  return data.cartLinesRemove.cart;
}

export async function updateCartBuyerIdentity(
  cartId: string,
  countryCode: string,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)
) {
  const UPDATE_BUYER_IDENTITY_MUTATION = `
    mutation UpdateBuyerIdentity($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!, $language: LanguageCode!, $country: CountryCode) @inContext(language: $language, country: $country) {
      cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
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
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await storefrontFetch<{
    cartBuyerIdentityUpdate: {
      cart: any;
      userErrors: { field: string[]; message: string }[];
    };
  }>({
    query: UPDATE_BUYER_IDENTITY_MUTATION,
    variables: {
      cartId,
      buyerIdentity: { countryCode },
    },
    language,
    country: countryCode,
  });

  if (data.cartBuyerIdentityUpdate.userErrors?.length) {
    const message = data.cartBuyerIdentityUpdate.userErrors
      .map((e) => e.message)
      .join(', ');
    console.error('cartBuyerIdentityUpdate error:', message);
  }

  return data.cartBuyerIdentityUpdate.cart;
}

export type CustomerAccessToken = {
  accessToken: string;
  expiresAt: string;
};

export async function createCustomerAccessToken(
  email: string,
  password: string,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)
): Promise<CustomerAccessToken> {
  const MUTATION = `
    mutation CreateCustomerToken($input: CustomerAccessTokenCreateInput!, $language: LanguageCode!) @inContext(language: $language) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  type MutationResult = {
    customerAccessTokenCreate: {
      customerAccessToken: CustomerAccessToken | null;
      customerUserErrors: { code: string | null; field: string[] | null; message: string }[];
    };
  };

  const data = await storefrontFetch<MutationResult>({
    query: MUTATION,
    variables: {
      input: { email, password },
    },
    language,
  });

  const { customerAccessToken, customerUserErrors } = data.customerAccessTokenCreate;

  if (customerUserErrors?.length) {
    throw new Error(customerUserErrors.map(err => err.message).join(', '));
  }

  if (!customerAccessToken) {
    throw new Error('Login failed. Please try again.');
  }

  return customerAccessToken;
}

export async function updateCustomerVatMetafield(
  customerAccessToken: string,
  vatNumber: string,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)
) {
  const MUTATION = `
    mutation customerUpdate($customer: CustomerUpdateInput!, $customerAccessToken: String!, $language: LanguageCode!) @inContext(language: $language) {
      customerUpdate(customer: $customer, customerAccessToken: $customerAccessToken) {
        customer { id }
        customerUserErrors { code field message }
      }
    }
  `;

  const data = await storefrontFetch<{
    customerUpdate: {
      customer: { id: string } | null;
      customerUserErrors: { code: string | null; field: string[] | null; message: string }[];
    };
  }>({
    query: MUTATION,
    variables: {
      customerAccessToken,
      customer: {
        metafields: [
          {
            namespace: 'custom',
            key: 'vat_number',
            type: 'single_line_text_field',
            value: vatNumber,
          },
        ],
      },
      language,
    },
  });

  const { customerUserErrors } = data.customerUpdate;
  if (customerUserErrors?.length) {
    throw new Error(customerUserErrors.map(err => err.message).join(', '));
  }
}

export type CustomerCreateInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  acceptsMarketing?: boolean;
};

export async function createCustomerAccount(
  input: CustomerCreateInput,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)
): Promise<string> {
  const MUTATION = `
    mutation customerCreate($input: CustomerCreateInput!, $language: LanguageCode!) @inContext(language: $language) {
      customerCreate(input: $input) {
        customer { id }
        customerUserErrors { code field message }
      }
    }
  `;

  const data = await storefrontFetch<{
    customerCreate: {
      customer: { id: string } | null;
      customerUserErrors: { code: string | null; field: string[] | null; message: string }[];
    };
  }>({
    query: MUTATION,
    variables: { input, language },
  });

  const { customer, customerUserErrors } = data.customerCreate;

  if (customerUserErrors?.length) {
    throw new Error(customerUserErrors.map(err => err.message).join(', '));
  }

  return customer?.id || '';
}

export async function customerActivate(
  id: string,
  activationToken: string,
  password: string,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)
): Promise<{ customerAccessToken: CustomerAccessToken; userErrors: any[] }> {
  const MUTATION = `
    mutation customerActivate($id: ID!, $input: CustomerActivateInput!, $language: LanguageCode!) @inContext(language: $language) {
      customerActivate(id: $id, input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  const data = await storefrontFetch<{
    customerActivate: {
      customerAccessToken: CustomerAccessToken | null;
      customerUserErrors: { code: string | null; field: string[] | null; message: string }[];
    }
  }>({
    query: MUTATION,
    variables: {
      id,
      input: { activationToken, password },
      language,
    },
  });

  return {
    customerAccessToken: data.customerActivate.customerAccessToken!,
    userErrors: data.customerActivate.customerUserErrors,
  };
}


export async function getCustomer(
  customerAccessToken: string,
  language: ShopifyLanguage = toShopifyLanguage(DEFAULT_LANGUAGE)
) {
  const QUERY = `
    query GetCustomer($customerAccessToken: String!, $language: LanguageCode!) @inContext(language: $language) {
      customer(customerAccessToken: $customerAccessToken) {
        id
        firstName
        lastName
        email
        phone
        vatNumber: metafield(namespace: "custom", key: "vat_number") {
          value
        }
        orders(first: 10, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              orderNumber
              processedAt
              financialStatus
              fulfillmentStatus
              totalPrice { amount currencyCode }
              lineItems(first: 5) {
                edges {
                  node {
                    title
                    quantity
                    variant {
                      image { url altText }
                      price { amount currencyCode }
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

  const data = await storefrontFetch<{
    customer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      phone: string | null;
      vatNumber: { value: string } | null;
      orders: {
        edges: {
          node: {
            id: string;
            orderNumber: number;
            processedAt: string;
            financialStatus: string;
            fulfillmentStatus: string;
            totalPrice: { amount: string; currencyCode: string };
            lineItems: {
              edges: {
                node: {
                  title: string;
                  quantity: number;
                  variant: {
                    image: { url: string; altText: string | null } | null;
                    price: { amount: string; currencyCode: string };
                  } | null;
                };
              }[];
            };
          };
        }[];
      };
    } | null;
  }>({
    query: QUERY,
    variables: { customerAccessToken },
    language,
  });

  return data.customer;
}
