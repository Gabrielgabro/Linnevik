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

export async function setCustomerVatMetafield(customerId: string, vatNumber: string) {
    if (!SHOPIFY_ADMIN_TOKEN) {
        throw new Error('SHOPIFY_ADMIN_API_TOKEN is not configured. Cannot set customer VAT number.');
    }

    const MUTATION = `
    mutation SetCustomerVAT($ownerId: ID!, $value: String!) {
      metafieldsSet(metafields: [{
        namespace: "custom"
        key: "vat_number"
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
            variables: { ownerId: customerId, value: vatNumber },
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
