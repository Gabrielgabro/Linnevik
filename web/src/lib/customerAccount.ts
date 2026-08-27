import { cookies } from 'next/headers';
import { sql, eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orders, orderItems } from '@/lib/db/schema';
import { readCustomerSessionValue, CUSTOMER_SESSION_COOKIE } from '@/lib/customerSession';

type CustomerAddress = Record<string, string | null>;

type CurrentCustomer = {
    id: string;
    source: 'owned';
    email: string;
    firstName: string | null;
    lastName: string | null;
    vatNumber?: string;
    company: string | null;
    billingAddress: CustomerAddress | null;
};

/**
 * The owned magic-link session is the only customer authentication source.
 */
async function getCurrentCustomerFromMagicLinkSession(): Promise<CurrentCustomer | null> {
    const cookieStore = await cookies();
    const customerId = await readCustomerSessionValue(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
    if (!customerId) return null;

    try {
        const db = getDb();
        const result = await db.execute(sql`
            select email, first_name, last_name, tax_id, company, default_billing_address
            from customers where id = ${customerId} limit 1
        `);
        const row = result.rows[0] as
            | {
                  email: string;
                  first_name: string | null;
                  last_name: string | null;
                  tax_id: string | null;
                  company: string | null;
                  default_billing_address: CustomerAddress | null;
              }
            | undefined;
        if (!row) return null;

        return {
            id: String(customerId),
            source: 'owned',
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            vatNumber: row.tax_id || undefined,
            company: row.company,
            billingAddress: row.default_billing_address,
        };
    } catch (error) {
        console.error('[customerAccount] Failed to load magic-link customer', error);
        return null;
    }
}

export async function getCurrentCustomerFromCookies(): Promise<CurrentCustomer | null> {
    return getCurrentCustomerFromMagicLinkSession();
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
 * egna `orders`-tabellen. Resultatet behåller det kontrakt som AccountClient
 * redan använder, vilket håller databasformen utanför UI-komponenten.
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

    return [];
}
