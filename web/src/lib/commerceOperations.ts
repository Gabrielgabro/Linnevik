import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  clientContacts,
  clients,
  customers,
  discountCodes,
  shippingRules,
  type CustomerRow,
  type ClientRow,
  type DiscountCodeRow,
  type ShippingRuleRow,
} from '@/lib/db/schema';
import { discountAmount, normalizeDiscountCode, shippingAmount } from '@/lib/commerceRules';
import { commerceCustomerNo } from '@/lib/commerceCustomer';
import { getStripe } from '@/lib/stripe';

export type AppliedDiscount = {
  id: number;
  code: string;
  title: string;
  kind: 'percentage' | 'fixed_amount' | 'free_shipping';
  amountMinor: number;
  freeShipping: boolean;
  stripeCouponId: string | null;
};

export type DiscountRejection =
  | 'INVALID'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'CURRENCY'
  | 'MINIMUM'
  | 'LIMIT_REACHED'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'SIGN_IN_REQUIRED';

/**
 * Expected buyer-facing rejection, rather than an operational checkout fault.
 * The reason travels as a code so the cart can say it in the buyer's language;
 * the message is the English fallback and the log line.
 */
export class DiscountError extends Error {
  constructor(message: string, public readonly reason: DiscountRejection = 'INVALID') {
    super(message);
    this.name = 'DiscountError';
  }
}

export async function resolveDiscount(input: {
  code?: string | null;
  subtotalMinor: number;
  currency: string;
  email?: string | null;
}): Promise<AppliedDiscount | null> {
  const code = normalizeDiscountCode(input.code ?? '');
  if (!code) return null;
  const [row] = await getDb()
    .select()
    .from(discountCodes)
    .where(sql`upper(${discountCodes.code}) = ${code}`)
    .limit(1);
  if (!row || !row.active) throw new DiscountError('Discount code is invalid or inactive.', 'INVALID');
  const now = new Date();
  if (row.startsAt && row.startsAt > now) throw new DiscountError('Discount code is not active yet.', 'NOT_STARTED');
  if (row.endsAt && row.endsAt <= now) throw new DiscountError('Discount code has expired.', 'EXPIRED');
  if (row.currency.toLowerCase() !== input.currency.toLowerCase()) {
    throw new DiscountError('Discount code does not support this currency.', 'CURRENCY');
  }
  if (input.subtotalMinor < row.minimumSubtotalMinor) {
    throw new DiscountError('Order does not meet the discount minimum.', 'MINIMUM');
  }
  // A cheap up-front rejection so an unusable code is reported while the buyer
  // is still looking at the cart. It is *not* the enforcement point: both
  // limits are settled again in `claimDiscountCapacity` once the order that
  // claims the code exists and can be ordered against its competitors.
  if (row.usageLimit !== null) {
    const claimed = await countDiscountClaims(row.id, null);
    if (claimed >= row.usageLimit) throw new DiscountError('Discount code usage limit has been reached.', 'LIMIT_REACHED');
  }
  if (row.usageLimitPerCustomer !== null) {
    // Enforcing a per-customer cap requires knowing the customer. Card
    // checkout only learns the e-mail from Stripe *after* payment, so for an
    // anonymous buyer this limit was silently skipped and the code became
    // unlimited. Fail closed and ask them to sign in instead.
    if (!input.email) {
      throw new DiscountError('Sign in to use this discount code.', 'SIGN_IN_REQUIRED');
    }
    const claimed = await countDiscountClaims(row.id, input.email);
    if (claimed >= row.usageLimitPerCustomer) {
      throw new DiscountError('Discount code usage limit for this customer has been reached.', 'CUSTOMER_LIMIT_REACHED');
    }
  }
  return {
    id: row.id,
    code: normalizeDiscountCode(row.code),
    title: row.title,
    kind: row.kind as AppliedDiscount['kind'],
    amountMinor: discountAmount(row as Parameters<typeof discountAmount>[0], input.subtotalMinor),
    freeShipping: row.kind === 'free_shipping',
    stripeCouponId: row.stripeCouponId,
  };
}

/**
 * How many times a code is spoken for: redemptions already recorded by the
 * webhook, plus orders that hold the code and may still be paid. A pending
 * order counts because its buyer is standing at Stripe with that price.
 */
async function countDiscountClaims(
  discountCodeId: number,
  email: string | null,
  excludeOrderId?: number
): Promise<number> {
  const normalized = email?.trim().toLowerCase() ?? null;
  const result = await getDb().execute(sql`
    select count(*)::int as count from (
      select r.order_id as id
      from discount_redemptions r
      where r.discount_code_id = ${discountCodeId}
        and (${normalized}::text is null or lower(r.email) = ${normalized})
      union
      select o.id
      from orders o
      where o.discount_code_id = ${discountCodeId}
        and o.payment_status = 'pending'
        and o.status = 'pending'
        and (${normalized}::text is null or lower(o.email) = ${normalized})
    ) claims
    where ${excludeOrderId ?? null}::int is null or claims.id <> ${excludeOrderId ?? null}
  `);
  return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0);
}

/**
 * Settle a limited discount code against everyone else claiming it.
 *
 * The pre-check in `resolveDiscount` runs before the claiming order exists, so
 * any number of concurrent checkouts read the same pre-redemption count and
 * all pass it — a "first 50 customers" code went out to as many buyers as
 * happened to start checkout in the same window. Re-counting here, after the
 * order row exists, makes every claim visible to every rival. Ties break on
 * order id: a claim is good if fewer than `limit` *older* claims exist, so of
 * two simultaneous claimants exactly one wins rather than both aborting.
 */
export async function claimDiscountCapacity(input: {
  orderId: number;
  discountCodeId: number;
  email: string | null;
}): Promise<void> {
  const [row] = await getDb()
    .select({
      usageLimit: discountCodes.usageLimit,
      usageLimitPerCustomer: discountCodes.usageLimitPerCustomer,
    })
    .from(discountCodes)
    .where(eq(discountCodes.id, input.discountCodeId))
    .limit(1);
  if (!row) throw new DiscountError('Discount code is invalid or inactive.');

  if (row.usageLimit !== null) {
    const earlier = await countEarlierDiscountClaims(input.discountCodeId, null, input.orderId);
    if (earlier >= row.usageLimit) {
      throw new DiscountError('Discount code usage limit has been reached.', 'LIMIT_REACHED');
    }
  }
  if (row.usageLimitPerCustomer !== null) {
    if (!input.email) throw new DiscountError('Sign in to use this discount code.', 'SIGN_IN_REQUIRED');
    const earlier = await countEarlierDiscountClaims(
      input.discountCodeId,
      input.email,
      input.orderId
    );
    if (earlier >= row.usageLimitPerCustomer) {
      throw new DiscountError('Discount code usage limit for this customer has been reached.', 'CUSTOMER_LIMIT_REACHED');
    }
  }
}

/** Claims that outrank `orderId`. See `claimDiscountCapacity`. */
async function countEarlierDiscountClaims(
  discountCodeId: number,
  email: string | null,
  orderId: number
): Promise<number> {
  const normalized = email?.trim().toLowerCase() ?? null;
  const result = await getDb().execute(sql`
    select count(*)::int as count from (
      select r.order_id as id
      from discount_redemptions r
      where r.discount_code_id = ${discountCodeId}
        and (${normalized}::text is null or lower(r.email) = ${normalized})
      union
      select o.id
      from orders o
      where o.discount_code_id = ${discountCodeId}
        and o.payment_status = 'pending'
        and o.status = 'pending'
        and (${normalized}::text is null or lower(o.email) = ${normalized})
    ) claims
    where claims.id < ${orderId}
  `);
  return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0);
}

/**
 * A stored Stripe customer id can outlive the customer it points at: deleted
 * from the Stripe dashboard, or written while the app ran on a test key and
 * read back under a live one. Handing a dead id to Checkout fails with a
 * non-retryable error, which would lock that account out of paying at all —
 * so verify it first, and forget it once it is gone.
 */
export async function usableStripeCustomerId(input: {
  customerId: number;
  stripeCustomerId: string | null;
}): Promise<string | null> {
  if (!input.stripeCustomerId) return null;
  try {
    const customer = await getStripe().customers.retrieve(input.stripeCustomerId);
    if (!('deleted' in customer) || !customer.deleted) return input.stripeCustomerId;
  } catch (error) {
    // Only a definite "it isn't there" clears the link. A transient Stripe
    // fault must not quietly detach a buyer from their payment history.
    if ((error as { code?: unknown }).code !== 'resource_missing') throw error;
  }
  await getDb()
    .update(customers)
    .set({ stripeCustomerId: null, updatedAt: new Date() })
    .where(eq(customers.id, input.customerId));
  return null;
}

export async function resolveShipping(input: {
  subtotalMinor: number;
  discountMinor?: number;
  currency: string;
  countryCode?: string;
  freeShipping?: boolean;
}): Promise<(ShippingRuleRow & { amountMinor: number }) | null> {
  const country = (input.countryCode ?? 'SE').toUpperCase();
  const subtotal = input.subtotalMinor - (input.discountMinor ?? 0);
  const rows = await getDb()
    .select()
    .from(shippingRules)
    .where(
      and(
        eq(shippingRules.active, true),
        eq(shippingRules.currency, input.currency.toLowerCase()),
        sql`${country} = any(${shippingRules.countryCodes})`,
        sql`${shippingRules.minimumSubtotalMinor} <= ${subtotal}`,
        or(isNull(shippingRules.maximumSubtotalMinor), sql`${shippingRules.maximumSubtotalMinor} >= ${subtotal}`)
      )
    )
    .orderBy(asc(shippingRules.priority), asc(shippingRules.id))
    .limit(1);
  const row = rows[0];
  return row
    ? { ...row, amountMinor: shippingAmount(row, subtotal, input.freeShipping) }
    : null;
}

export async function ensureStripeCoupon(discount: AppliedDiscount): Promise<string | null> {
  if (discount.kind === 'free_shipping') return null;
  if (discount.stripeCouponId) return discount.stripeCouponId;
  const row = await getDb().query.discountCodes.findFirst({
    where: eq(discountCodes.id, discount.id),
  });
  if (!row) throw new Error('Discount code no longer exists.');
  const coupon = await getStripe().coupons.create(
    {
      name: `${row.title} (${normalizeDiscountCode(row.code)})`,
      duration: 'forever',
      ...(row.kind === 'percentage'
        ? { percent_off: row.value }
        : { amount_off: row.value, currency: row.currency }),
      metadata: { linnevik_discount_id: String(row.id) },
    },
    { idempotencyKey: `linnevik_discount_${row.id}_${row.updatedAt.getTime()}` }
  );
  await getDb()
    .update(discountCodes)
    .set({ stripeCouponId: coupon.id, updatedAt: new Date() })
    .where(eq(discountCodes.id, row.id));
  return coupon.id;
}

export async function upsertCustomerFromCheckout(input: {
  email: string;
  stripeCustomerId?: string | null;
  name?: string | null;
  phone?: string | null;
  customerNo?: string | null;
  shippingAddress?: Record<string, string | null> | null;
  billingAddress?: Record<string, string | null> | null;
  taxId?: { type: string; value: string } | null;
}): Promise<number> {
  const email = input.email.trim().toLowerCase();
  const names = (input.name ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = names.shift() ?? null;
  const lastName = names.join(' ') || null;
  const client = await ensureClientForCommerceCustomer({
    email,
    customerNo: input.customerNo,
    firstName,
    lastName,
    phone: input.phone,
    status: 'active',
  });
  const result = await getDb().execute(sql`
    insert into customers (
      client_id, email, stripe_customer_id, customer_no, first_name, last_name, company, phone,
      default_shipping_address, default_billing_address, tax_id, tax_id_type
    ) values (
      ${client.id}, ${email}, ${input.stripeCustomerId ?? null}, ${client.customerNo},
      ${firstName}, ${lastName}, ${client.name}, ${input.phone ?? null},
      ${JSON.stringify(input.shippingAddress ?? null)}::jsonb,
      ${JSON.stringify(input.billingAddress ?? null)}::jsonb,
      ${input.taxId?.value ?? null}, ${input.taxId?.type ?? null}
    )
    on conflict (lower(email)) do update set
      client_id = excluded.client_id,
      stripe_customer_id = coalesce(excluded.stripe_customer_id, customers.stripe_customer_id),
      customer_no = excluded.customer_no,
      first_name = coalesce(excluded.first_name, customers.first_name),
      last_name = coalesce(excluded.last_name, customers.last_name),
      company = excluded.company,
      phone = coalesce(excluded.phone, customers.phone),
      default_shipping_address = coalesce(excluded.default_shipping_address, customers.default_shipping_address),
      default_billing_address = coalesce(excluded.default_billing_address, customers.default_billing_address),
      -- Ett VAT-nummer kunden angav i kassan skriver över ett tomt fält, men
      -- raderar aldrig ett vi redan har från registreringen.
      tax_id = coalesce(excluded.tax_id, customers.tax_id),
      tax_id_type = coalesce(excluded.tax_id_type, customers.tax_id_type),
      updated_at = now()
    returning id
  `);
  return Number((result.rows[0] as { id: number }).id);
}

export type RegisterCustomerResult =
  | { status: 'created'; id: number }
  | { status: 'exists' };

/**
 * Skapar kundraden direkt i Postgres. Det här är hela registreringen — det
 * finns inget Shopify-konto att skapa längre (se handleRegister). VAT/org-
 * numret sparas i tax_id på kunden i stället för en Shopify-metafield, så att
 * det finns ett enda ägande system för kunddata.
 *
 * Misslyckas tyst mot dubbletter (unique-indexet på lower(email)) i stället
 * för att kasta. Anroparen ger samma neutrala svar för nya och befintliga konton.
 */
export async function registerCustomer(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  taxId?: string | null;
}): Promise<RegisterCustomerResult> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await getDb()
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(${customers.email}) = ${email}`)
    .limit(1);
  if (existing) return { status: 'exists' };

  const client = await ensureClientForCommerceCustomer({
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    status: 'active',
  });
  const result = await getDb().execute(sql`
    insert into customers (client_id, email, customer_no, first_name, last_name, company, tax_id)
    values (
      ${client.id}, ${email}, ${client.customerNo}, ${input.firstName ?? null},
      ${input.lastName ?? null}, ${client.name}, ${input.taxId ?? null}
    )
    on conflict (lower(email)) do nothing
    returning id
  `);
  const row = result.rows[0] as { id: number } | undefined;
  return row ? { status: 'created', id: Number(row.id) } : { status: 'exists' };
}

export type CustomerInput = Partial<
  Omit<CustomerRow, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>
> & {
  email?: string;
};

export async function listCustomers(limit = 200): Promise<CustomerRow[]> {
  return getDb().select().from(customers).orderBy(desc(customers.updatedAt)).limit(limit);
}

export async function createCustomer(
  clientId: number,
  input: CustomerInput & { email: string }
): Promise<CustomerRow> {
  const client = await ensureClientForCommerceCustomer({
    preferredClientId: clientId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    status: input.status,
  });
  const [row] = await getDb()
    .insert(customers)
    .values({
      ...input,
      clientId: client.id,
      customerNo: client.customerNo,
      company: client.name,
      email: input.email.trim().toLowerCase(),
    })
    .returning();
  return row;
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<CustomerRow | null> {
  const db = getDb();
  const [before] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!before) return null;
  const [row] = await getDb()
    .update(customers)
    .set({ ...input, email: input.email?.trim().toLowerCase(), updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  if (!row) return null;

  const [contact] = await db
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.clientId, row.clientId),
        or(
          sql`lower(${clientContacts.email}) = ${before.email.toLowerCase()}`,
          sql`lower(${clientContacts.email}) = ${row.email.toLowerCase()}`
        )
      )
    )
    .limit(1);
  if (contact) {
    await db
      .update(clientContacts)
      .set({
        email: row.email,
        firstName: input.firstName?.trim() || contact.firstName,
        lastName: input.lastName === undefined ? contact.lastName : input.lastName,
        phone: input.phone === undefined ? contact.phone : input.phone,
        updatedAt: new Date(),
      })
      .where(eq(clientContacts.id, contact.id));
  } else {
    await db.insert(clientContacts).values({
      clientId: row.clientId,
      firstName: row.firstName?.trim() || row.email.split('@')[0],
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      status: row.status === 'active' ? 'Vunnen' : 'Ej kontaktad',
    });
  }
  return row;
}

type CommerceClientIdentity = {
  preferredClientId?: number;
  email: string;
  customerNo?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  status?: string | null;
};

/**
 * Kopplar webbkontot till Kunder. Kundnummer vinner över mejl, eftersom flera
 * personer kan beställa för samma företag. Saknas en träff skapas en stabil
 * WEB-post som sedan kan kompletteras i admin utan att orderkopplingen bryts.
 */
async function ensureClientForCommerceCustomer(
  input: CommerceClientIdentity
): Promise<ClientRow> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  let client: ClientRow | undefined;

  if (input.preferredClientId) {
    [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, input.preferredClientId))
      .limit(1);
  }
  if (!client && input.customerNo) {
    [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.customerNo, input.customerNo.trim()))
      .limit(1);
  }
  if (!client) {
    const [match] = await db
      .select({ client: clients })
      .from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(sql`lower(${clientContacts.email}) = ${email}`)
      .limit(1);
    client = match?.client;
  }

  if (!client) {
    // Hashen används bara till ett deterministiskt internt kundnummer, inte
    // till säkerhet. Samma mejl kan därför inte skapa två CRM-poster vid samtidiga anrop.
    const customerNo = commerceCustomerNo(email);
    const name =
      [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || email;
    [client] = await db
      .insert(clients)
      .values({
        customerNo,
        name,
        status: input.status === 'active' ? 'Aktiv kund' : 'Vilande',
      })
      .onConflictDoNothing({ target: clients.customerNo })
      .returning();
    if (!client) {
      [client] = await db.select().from(clients).where(eq(clients.customerNo, customerNo)).limit(1);
    }
  }

  if (!client) throw new Error('Kunde inte koppla webbkontot till kundregistret.');

  // There is no case-insensitive unique constraint on contacts. Serialize the
  // existence check and insert for this exact company/address so two parallel
  // registrations cannot create duplicate CRM contacts.
  const contactLockKey = `client-contact:${client.id}:${email}`;
  await db.execute(sql`
    with contact_lock as materialized (
      select pg_advisory_xact_lock(hashtextextended(${contactLockKey}, 0))
    )
    insert into client_contacts (
      client_id, first_name, last_name, email, phone, status
    )
    select
      ${client.id}, ${input.firstName?.trim() || email.split('@')[0]},
      ${input.lastName?.trim() || null}, ${email}, ${input.phone?.trim() || null},
      ${input.status === 'active' ? 'Vunnen' : 'Ej kontaktad'}
    from contact_lock
    where not exists (
      select 1 from client_contacts
      where client_id = ${client.id} and lower(email) = ${email}
    )
  `);

  return client;
}

export type DiscountInput = Partial<Omit<DiscountCodeRow, 'id' | 'createdAt' | 'updatedAt'>> & {
  code?: string;
  title?: string;
};

export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
  return getDb().select().from(discountCodes).orderBy(desc(discountCodes.updatedAt));
}

export async function createDiscountCode(
  input: DiscountInput & { code: string; title: string; kind: string }
): Promise<DiscountCodeRow> {
  const [row] = await getDb()
    .insert(discountCodes)
    .values({ ...input, code: normalizeDiscountCode(input.code), kind: input.kind })
    .returning();
  return row;
}

export async function updateDiscountCode(id: number, input: DiscountInput): Promise<DiscountCodeRow | null> {
  const invalidateCoupon =
    input.kind !== undefined || input.value !== undefined || input.currency !== undefined || input.title !== undefined;
  const [row] = await getDb()
    .update(discountCodes)
    .set({
      ...input,
      code: input.code ? normalizeDiscountCode(input.code) : undefined,
      stripeCouponId: invalidateCoupon ? null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(discountCodes.id, id))
    .returning();
  return row ?? null;
}

export type ShippingInput = Partial<Omit<ShippingRuleRow, 'id' | 'createdAt' | 'updatedAt'>> & {
  name?: string;
};

export async function listShippingRules(): Promise<ShippingRuleRow[]> {
  return getDb().select().from(shippingRules).orderBy(asc(shippingRules.priority), asc(shippingRules.id));
}

export async function createShippingRule(input: ShippingInput & { name: string }): Promise<ShippingRuleRow> {
  const [row] = await getDb().insert(shippingRules).values(input).returning();
  return row;
}

export async function updateShippingRule(id: number, input: ShippingInput): Promise<ShippingRuleRow | null> {
  const [row] = await getDb()
    .update(shippingRules)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(shippingRules.id, id))
    .returning();
  return row ?? null;
}
