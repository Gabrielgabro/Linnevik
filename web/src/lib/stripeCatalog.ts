/**
 * Kopplingen mellan en produkt hos oss och en produkt i Stripe.
 *
 * Fanns förr bara som `scripts/push-stripe-catalog.mjs`, körd från en terminal
 * och medvetet begränsad till handles i landed-cost-underlaget. En produkt
 * skapad i /admin kunde därför aldrig kopplas därifrån: listan flaggade rött
 * för "Saknar Stripe" utan att erbjuda något sätt att åtgärda det.
 *
 * Samma regler som skriptet, med flit:
 *
 * - **Deterministiskt id** (`linnevik_<handle>`), så att en omkörning kopplar
 *   om till samma Stripe-produkt i stället för att skapa en till.
 * - **Inga Stripe-priser.** Beloppen är dynamiska och räknas per kund i vår
 *   backend; de skickas som `price_data` när kassan skapas. Ett Stripe-pris går
 *   inte att ändra i belopp, så varje omprissättning hade lämnat ett dött
 *   prisobjekt efter sig och låtit Neon och Stripe glida isär.
 * - **shippable**, eftersom det är fysiska varor och Stripe ska kräva adress.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

/** Stripes id får bara innehålla tecken som tål att stå i en URL. */
export function stripeProductIdFor(handle: string): string {
  return `linnevik_${handle.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

export type LinkResult = {
  stripeProductId: string;
  created: boolean;
};

/**
 * Skapar eller uppdaterar Stripe-produkten och skriver tillbaka id:t.
 *
 * Idempotent: körs den två gånger uppdateras samma produkt. `retrieve` följt av
 * `update` i stället för bara `create` — Stripe svarar med ett fel på ett id
 * som redan finns, och det felet säger inget begripligt för den som klickat på
 * en knapp.
 */
export async function linkProductToStripe(productId: number): Promise<LinkResult> {
  return linkWhere(sql`p.id = ${productId}`);
}

/** Som `linkProductToStripe`, men för den som bara har handtaget — kassan. */
export async function linkProductToStripeByHandle(handle: string): Promise<LinkResult> {
  return linkWhere(sql`p.handle = ${handle}`);
}

/**
 * Stripe svarar `resource_missing` när id:t inte finns *i det läge nyckeln
 * tillhör*. En produkt skapad med testnyckeln finns alltså inte för
 * live-nyckeln — det var så kassan gick sönder vid bytet till skarpt läge.
 */
function isMissing(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: unknown }).code === 'resource_missing'
  );
}

async function linkWhere(condition: ReturnType<typeof sql>): Promise<LinkResult> {
  const result = await getDb().execute(sql`
    select p.id, p.handle, p.title,
           coalesce(
             (select string_agg(v.sku, ',' order by v.sku)
                from product_variants v where v.product_id = p.id and v.active),
             ''
           ) as skus
      from products p
     where ${condition}
     limit 1
  `);
  const row = result.rows[0] as
    | { id: number | string; handle: string; title: string; skus: string }
    | undefined;
  if (!row) throw new Error('Produkten finns inte.');

  const stripe = getStripe();
  const id = stripeProductIdFor(row.handle);
  const payload = {
    name: row.title,
    shippable: true,
    // En arkiverad Stripe-produkt går inte att sälja i kassan.
    active: true,
    metadata: {
      linnevik_handle: row.handle,
      // Stripes metadatafält rymmer 500 tecken. En produkt med många varianter
      // får hellre en kapad lista än ett avvisat anrop.
      linnevik_skus: row.skus.slice(0, 480),
    },
  };

  let created = false;
  try {
    await stripe.products.retrieve(id);
    await stripe.products.update(id, payload);
  } catch (error) {
    // Bara "finns inte" leder till create. Ett nätverksfel eller en ogiltig
    // nyckel ska synas som det felet, inte som ett obegripligt create-fel.
    if (!isMissing(error)) throw error;
    await stripe.products.create({ id, ...payload });
    created = true;
  }

  await getDb().execute(sql`
    update products set stripe_product_id = ${id}, updated_at = now()
    where id = ${Number(row.id)} and stripe_product_id is distinct from ${id}
  `);
  return { stripeProductId: id, created };
}

/**
 * Ser till att varje produkt i kassan finns i Stripe innan sessionen skapas,
 * och skapar den som saknas. Returnerar handtag → Stripe-id.
 *
 * Utan det här räckte det att katalogen kopplats i testläge för att varje
 * skarpt köp skulle stoppas av Stripe med "No such product".
 *
 * Kontrolleras vid varje köp, utan minne mellan anropen: en produkt som
 * arkiveras eller raderas i Stripes kontrollpanel ska fångas här, inte i
 * Stripes svar på sessionen. Det kostar ett parallellt anrop per vara.
 */
export async function ensureStripeProducts(handles: string[]): Promise<Map<string, string>> {
  const stripe = getStripe();
  const ids = new Map<string, string>();
  await Promise.all(
    [...new Set(handles)].map(async handle => {
      const id = stripeProductIdFor(handle);
      try {
        const product = await stripe.products.retrieve(id);
        if (!product.active) await linkProductToStripeByHandle(handle);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await linkProductToStripeByHandle(handle);
      }
      ids.set(handle, id);
    })
  );
  return ids;
}

export type LinkAllResult = {
  total: number;
  created: number;
  updated: number;
  failed: Array<{ handle: string; error: string }>;
};

/** Kopplar hela den aktiva katalogen. Omkörningsbar. */
export async function linkAllProductsToStripe(): Promise<LinkAllResult> {
  const result = await getDb().execute(sql`
    select id, handle from products where active order by handle
  `);
  const rows = result.rows as Array<{ id: number | string; handle: string }>;
  const summary: LinkAllResult = { total: rows.length, created: 0, updated: 0, failed: [] };
  for (const row of rows) {
    try {
      const linked = await linkProductToStripe(Number(row.id));
      if (linked.created) summary.created += 1;
      else summary.updated += 1;
    } catch (error) {
      summary.failed.push({
        handle: row.handle,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
