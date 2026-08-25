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
  const result = await getDb().execute(sql`
    select p.handle, p.title,
           coalesce(
             (select string_agg(v.sku, ',' order by v.sku)
                from product_variants v where v.product_id = p.id and v.active),
             ''
           ) as skus
      from products p
     where p.id = ${productId}
     limit 1
  `);
  const row = result.rows[0] as { handle: string; title: string; skus: string } | undefined;
  if (!row) throw new Error('Produkten finns inte.');

  const stripe = getStripe();
  const id = stripeProductIdFor(row.handle);
  const payload = {
    name: row.title,
    shippable: true,
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
  } catch {
    await stripe.products.create({ id, ...payload });
    created = true;
  }

  await getDb().execute(sql`
    update products set stripe_product_id = ${id}, updated_at = now()
    where id = ${productId}
  `);

  return { stripeProductId: id, created };
}
