import { cookies } from 'next/headers';
import { sql, eq, desc, inArray } from 'drizzle-orm';
import { getCustomer } from '@/lib/shopify';
import { DEFAULT_LANGUAGE, toShopifyLanguage } from '@/lib/languageConfig';
import { getDb } from '@/lib/db';
import { orders, orderItems } from '@/lib/db/schema';
import { readCustomerSessionValue, CUSTOMER_SESSION_COOKIE } from '@/lib/customerSession';

const TOKEN_COOKIE_NAMES = ['shopify_customer_token', 'customer_access_token'];

type CurrentCustomer = {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    vatNumber?: string;
};

/**
 * Kunden kan vara inloggad på två oberoende sätt just nu: Shopifys
 * lösenordsflöde (kakorna i TOKEN_COOKIE_NAMES) eller den nya
 * e-postlänken (linnevik_customer, lib/customerSession.ts). Länken kollas
 * först eftersom /login bara erbjuder den vägen numera — Shopify-kakan finns
 * kvar bara för kunder som loggade in innan omställningen och vars kaka
 * ännu inte gått ut.
 */
async function getCurrentCustomerFromMagicLinkSession(): Promise<CurrentCustomer | null> {
    const cookieStore = await cookies();
    const customerId = await readCustomerSessionValue(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
    if (!customerId) return null;

    try {
        const db = getDb();
        const result = await db.execute(sql`
            select email, first_name, last_name, tax_id from customers where id = ${customerId} limit 1
        `);
        const row = result.rows[0] as
            | { email: string; first_name: string | null; last_name: string | null; tax_id: string | null }
            | undefined;
        if (!row) return null;

        return {
            id: String(customerId),
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            vatNumber: row.tax_id || undefined,
        };
    } catch (error) {
        console.error('[customerAccount] Failed to load magic-link customer', error);
        return null;
    }
}

export async function getCurrentCustomerFromCookies(): Promise<CurrentCustomer | null> {
    const magicLinkCustomer = await getCurrentCustomerFromMagicLinkSession();
    if (magicLinkCustomer) return magicLinkCustomer;

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

/**
 * Ordrar för en kund som loggat in via e-postlänken — läses direkt ur den
 * egna `orders`-tabellen i stället för Shopifys GraphQL-API. Formas till
 * samma `CustomerOrder`-form som Shopify-vägen så att AccountClient inte
 * behöver bry sig om vilket system kunden hör hemma i.
 */
async function getOwnedCustomerOrders(customerId: number, limit: number): Promise<CustomerOrder[]> {
    const db = getDb();
    const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.customerId, customerId))
        .orderBy(desc(orders.createdAt))
        .limit(limit);
    if (orderRows.length === 0) return [];

    const itemRows = await db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderRows.map(order => order.id)));

    return orderRows.map(order => {
        const currency = order.currency.toUpperCase();
        return {
            id: String(order.id),
            number: order.id,
            processedAt: order.createdAt.toISOString(),
            financialStatus: order.paymentStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            totalPrice: { amount: (order.totalMinor / 100).toFixed(2), currencyCode: currency },
            lineItems: {
                edges: itemRows
                    .filter(item => item.orderId === order.id)
                    .map(item => ({
                        node: {
                            title: item.title,
                            quantity: item.quantity,
                            image: null,
                            variant: { price: { amount: (item.unitAmountMinor / 100).toFixed(2), currencyCode: currency } },
                        },
                    })),
            },
        };
    });
}

export async function getCustomerOrders(limit = 10): Promise<CustomerOrder[]> {
    const cookieStore = await cookies();
    const magicLinkCustomerId = await readCustomerSessionValue(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
    if (magicLinkCustomerId) {
        try {
            return await getOwnedCustomerOrders(magicLinkCustomerId, limit);
        } catch (error) {
            console.error('[customerAccount] Failed to load owned orders', error);
            return [];
        }
    }

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
