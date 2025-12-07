const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ADMIN_API_VERSION = '2024-07';

if (!SHOPIFY_DOMAIN) {
    throw new Error('SHOPIFY_STORE_DOMAIN environment variable is required');
}

if (!SHOPIFY_ADMIN_TOKEN) {
    console.error('[shopifyAdmin] SHOPIFY_ADMIN_API_TOKEN is not set. Customer metafield operations will fail.');
}

type MetafieldSetResult = {
    metafieldsSet: {
        userErrors: { field: string[]; message: string }[];
    };
};

type CustomerDeleteResult = {
    customerDelete: {
        deletedCustomerId: string | null;
        userErrors: { field: string[]; message: string }[];
    };
};

type CustomerByIdResult = {
    customer: {
        id: string;
        email: string;
        metafields?: {
            edges: Array<{
                node: {
                    id: string;
                    key: string;
                    namespace: string;
                    type: string;
                    value: string;
                };
            }>;
        };
    } | null;
};

type CustomerLookupResult = {
    customers: {
        edges: Array<{
            node: {
                id: string;
                email: string;
                metafields?: {
                    edges: Array<{
                        node: {
                            id: string;
                            key: string;
                            namespace: string;
                            type: string;
                            value: string;
                        };
                    }>;
                };
            };
        }>;
    };
};

export type CustomerVatInfo = {
    id: string;
    email: string;
    vatNumber?: string;
    vatProvided?: boolean;
};

export async function findCustomerByEmail(email: string): Promise<CustomerVatInfo | null> {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot find customer.');
    }

    const QUERY = `
    query FindCustomer($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            email
            metafields(first: 10, namespace: "custom") {
              edges {
                node { id key namespace type value }
              }
            }
          }
        }
      }
    }
  `;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
            query: QUERY,
            variables: { query: `email:${email}` },
        }),
    });

    if (!response.ok) {
        throw new Error(`Admin fetch failed: ${response.status}`);
    }

    const json: { data?: CustomerLookupResult; errors?: { message: string }[] } = await response.json();

    if (json.errors?.length) {
        throw new Error(json.errors.map(err => err.message).join(', '));
    }

    const node = json.data?.customers.edges?.[0]?.node;
    if (!node) {
        return null;
    }

    const vatNumber = node.metafields?.edges?.find(edge => edge.node.key === 'vat_number')?.node.value;
    const vatProvidedRaw = node.metafields?.edges?.find(edge => edge.node.key === 'vat_provided')?.node.value;
    const vatProvided = vatProvidedRaw ? vatProvidedRaw.toLowerCase() === 'true' : undefined;

    return {
        id: node.id,
        email: node.email,
        vatNumber: vatNumber || undefined,
        vatProvided,
    };
}

export async function setCustomerVatStatus(customerId: string, vatNumber: string | null, isProvided: boolean) {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot set customer VAT data.');
    }

    const metafields: Array<{ namespace: string; key: string; type: string; value: string; ownerId: string }> = [
        {
            namespace: 'custom',
            key: 'vat_provided',
            type: 'boolean',
            value: isProvided ? 'true' : 'false',
            ownerId: customerId,
        },
    ];

    if (vatNumber !== null) {
        metafields.push({
            namespace: 'custom',
            key: 'vat_number',
            type: 'single_line_text_field',
            value: vatNumber,
            ownerId: customerId,
        });
    }

    const MUTATION = `
    mutation SetCustomerVATStatus($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
            query: MUTATION,
            variables: { metafields },
        }),
    });

    if (!response.ok) {
        throw new Error(`Admin fetch failed: ${response.status}`);
    }

    const json: MetafieldSetResult & { errors?: { message: string }[] } = await response.json();

    if ((json as any).errors?.length) {
        throw new Error((json as any).errors.map((err: { message: string }) => err.message).join(', '));
    }

    const userErrors = json.metafieldsSet?.userErrors;
    if (userErrors?.length) {
        throw new Error(userErrors.map(err => err.message).join(', '));
    }
}

/**
 * Generic function to set customer metafield
 */
export async function setCustomerMetafield(
    customerId: string,
    key: string,
    value: string,
    namespace: string = 'custom'
) {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot set customer metafield.');
    }

    const MUTATION = `
    mutation SetCustomerMetafield($ownerId: ID!, $namespace: String!, $key: String!, $value: String!) {
      metafieldsSet(metafields: [{
        namespace: $namespace
        key: $key
        type: "single_line_text_field"
        value: $value
        ownerId: $ownerId
      }]) {
        userErrors { field message }
      }
    }
  `;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
            query: MUTATION,
            variables: { ownerId: customerId, namespace, key, value },
        }),
    });

    if (!response.ok) {
        throw new Error(`Admin fetch failed: ${response.status}`);
    }

    const json: { data?: MetafieldSetResult; errors?: { message: string }[] } = await response.json();

    if (json.errors?.length) {
        throw new Error(json.errors.map(err => err.message).join(', '));
    }

    const userErrors = json.data?.metafieldsSet.userErrors;
    if (userErrors?.length) {
        throw new Error(userErrors.map(err => err.message).join(', '));
    }
}

export async function setCustomerVatMetafield(customerId: string, vatNumber: string) {
    return setCustomerMetafield(customerId, 'vat_number', vatNumber, 'custom');
}

/**
 * Create customer account with Admin API
 * Customer will be created in DISABLED state
 * Use sendActivationEmail() after this to send activation email
 *
 * @param email - Customer email
 * @param firstName - Customer first name
 * @param lastName - Customer last name
 * @param locale - Customer locale (e.g., 'sv', 'en') - stored as tag for Shopify notifications
 */
export async function createCustomerAccount(
    email: string,
    firstName?: string,
    lastName?: string,
    locale?: string
): Promise<{ id: string }> {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot create customer.');
    }

    const MUTATION = `
    mutation CreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          state
          locale
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

    const input: any = {
        email,
        firstName,
        lastName,
        emailMarketingConsent: {
            marketingState: 'NOT_SUBSCRIBED',
            marketingOptInLevel: 'SINGLE_OPT_IN',
        },
        // Set customer locale for Shopify notifications (en, sv, etc.)
        locale: locale || undefined,
    };

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
            query: MUTATION,
            variables: { input },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Admin API failed: ${response.status} ${errorText}`);
    }

    const json: {
        data?: {
            customerCreate: {
                customer: { id: string; state: string } | null;
                userErrors: { field: string[]; message: string }[];
            };
        };
        errors?: { message: string }[];
    } = await response.json();

    if (json.errors?.length) {
        throw new Error(json.errors.map(err => err.message).join(', '));
    }

    const userErrors = json.data?.customerCreate.userErrors;
    if (userErrors?.length) {
        throw new Error(userErrors.map(err => err.message).join(', '));
    }

    const customer = json.data?.customerCreate.customer;
    if (!customer) {
        throw new Error('Customer creation failed.');
    }

    console.log('[shopifyAdmin] Customer created with state:', customer.state, 'locale:', (customer as any).locale);

    return {
        id: customer.id,
    };
}

/**
 * Send activation email to customer
 * Customer will receive Shopify's "Customer account activate" email in their preferred locale
 * They will set their password during activation
 *
 * Note: The email language is determined by the customer's locale field set during creation.
 * Shopify will automatically use the appropriate language template if configured in Shopify Admin.
 *
 * @param customerId - Customer GID
 * @param email - Customer email
 */
export async function sendActivationEmail(customerId: string, email: string): Promise<void> {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured.');
    }

    // Extract numeric ID from GID
    const customerIdNumber = customerId.replace('gid://shopify/Customer/', '');
    const url = `https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/customers/${customerIdNumber}/send_invite.json`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
            customer_invite: {
                to: email,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[shopifyAdmin] Failed to send activation email:', errorText);
        throw new Error(`Failed to send activation email: ${response.status}`);
    }

    console.log('[shopifyAdmin] Activation email sent successfully (language based on customer locale)');
}

export async function deleteCustomer(customerId: string) {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot delete customer.');
    }

    const MUTATION = `
    mutation DeleteCustomer($id: ID!) {
      customerDelete(input: { id: $id }) {
        deletedCustomerId
        userErrors { field message }
      }
    }
  `;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
            query: MUTATION,
            variables: { id: customerId },
        }),
    });

    if (!response.ok) {
        throw new Error(`Admin fetch failed: ${response.status}`);
    }

    const json: { data?: CustomerDeleteResult; errors?: { message: string }[] } = await response.json();

    if (json.errors?.length) {
        throw new Error(json.errors.map(err => err.message).join(', '));
    }

    const userErrors = json.data?.customerDelete.userErrors;
    if (userErrors?.length) {
        throw new Error(userErrors.map(err => err.message).join(', '));
    }

    const deletedId = json.data?.customerDelete.deletedCustomerId;
    if (!deletedId) {
        throw new Error('Customer deletion failed.');
    }
}

export async function getCustomerVatById(customerId: string): Promise<CustomerVatInfo | null> {
    if (!SHOPIFY_ADMIN_TOKEN) {
        console.error('[shopifyAdmin] SHOPIFY_ADMIN_API_TOKEN not configured');
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot load customer VAT.');
    }

    console.log('[shopifyAdmin] Fetching VAT for customer:', customerId);

    const QUERY = `
    query GetCustomer($id: ID!) {
      customer(id: $id) {
        id
        email
        metafields(first: 10, namespace: "custom") {
          edges { node { id key namespace type value } }
        }
      }
    }
  `;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({ query: QUERY, variables: { id: customerId } }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[shopifyAdmin] Admin fetch failed:', response.status, errorText);
        throw new Error(`Admin fetch failed: ${response.status}`);
    }

    const json: { data?: CustomerByIdResult; errors?: { message: string }[] } = await response.json();

    console.log('[shopifyAdmin] Response:', JSON.stringify(json, null, 2));

    if (json.errors?.length) {
        console.error('[shopifyAdmin] GraphQL errors:', json.errors);
        throw new Error(json.errors.map(err => err.message).join(', '));
    }

    const node = json.data?.customer;
    if (!node) {
        console.log('[shopifyAdmin] Customer not found');
        return null;
    }

    const vatNumber = node.metafields?.edges?.find(edge => edge.node.key === 'vat_number')?.node.value;
    const vatProvidedRaw = node.metafields?.edges?.find(edge => edge.node.key === 'vat_provided')?.node.value;
    const vatProvided = vatProvidedRaw ? vatProvidedRaw.toLowerCase() === 'true' : undefined;

    console.log('[shopifyAdmin] Found VAT number:', vatNumber);

    return {
        id: node.id,
        email: node.email,
        vatNumber: vatNumber || undefined,
        vatProvided,
    };
}
