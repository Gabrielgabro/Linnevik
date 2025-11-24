import { cookies } from 'next/headers';
import { getCustomer } from '@/lib/shopify';
import { DEFAULT_LANGUAGE, toShopifyLanguage } from '@/lib/languageConfig';

const TOKEN_COOKIE_NAMES = ['shopify_customer_token', 'customer_access_token'];

export async function getCurrentCustomerFromCookies(): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    vatNumber?: string;
} | null> {
    const cookieStore = await cookies();
    const token = TOKEN_COOKIE_NAMES.map(name => cookieStore.get(name)?.value).find(Boolean);

    if (!token) {
        return null;
    }

    try {
        const customer = await getCustomer(token, toShopifyLanguage(DEFAULT_LANGUAGE));
        return customer
            ? {
                id: customer.id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                vatNumber: customer.vatNumber?.value || undefined,
            }
            : null;
    } catch (error) {
        console.error('[customerAccount] Failed to load current customer', error);
        return null;
    }
}

export type CustomerOrder = {
    id: string;
    number: number;
    processedAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: { amount: string; currencyCode: string };
    lineItems: {
        edges: {
            node: {
                title: string;
                quantity: number;
                image: { url: string; altText: string | null } | null;
                variant: { price: { amount: string; currencyCode: string } } | null;
            };
        }[];
    };
};

export async function getCustomerOrders(limit = 10): Promise<CustomerOrder[]> {
    const cookieStore = await cookies();
    const token = TOKEN_COOKIE_NAMES.map(name => cookieStore.get(name)?.value).find(Boolean);

    if (!token) {
        return [];
    }

    try {
        const customer = await getCustomer(token, toShopifyLanguage(DEFAULT_LANGUAGE));
        const orders = customer?.orders?.edges ?? [];

        return orders.slice(0, limit).map(({ node }) => ({
            id: node.id,
            number: node.orderNumber,
            processedAt: node.processedAt,
            financialStatus: node.financialStatus,
            fulfillmentStatus: node.fulfillmentStatus,
            totalPrice: node.totalPrice,
            lineItems: {
                edges: node.lineItems.edges.map(item => ({
                    node: {
                        title: item.node.title,
                        quantity: item.node.quantity,
                        image: item.node.variant?.image || null,
                        variant: item.node.variant
                            ? {
                                price: item.node.variant.price,
                              }
                            : null,
                    },
                })),
            },
        }));
    } catch (error) {
        console.error('[customerAccount] Failed to load orders', error);
        return [];
    }
}
