/**
 * Katalogen som en fil.
 *
 * Det fanns inget sätt att få ut katalogen alls — varken för en leverantör,
 * en prislista, eller som en läsbar kopia utanför databasen. En rad per
 * variant, eftersom det är varianten som har pris, lager och SKU.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function catalogCsv(): Promise<string> {
  const result = await getDb().execute(sql`
    select p.handle, p.title, p.title_en, p.status, p.supplier,
           coalesce(c.title_sv, '') as kategori,
           v.sku, v.option_values, v.price_minor, v.currency,
           v.inventory_quantity, v.inventory_reserved, v.inventory_tracked,
           v.minimum_order_quantity, v.order_increment,
           v.active, v.available_for_sale, p.stripe_product_id
      from products p
      join product_variants v on v.product_id = p.id
      left join product_collections pc on pc.product_id = p.id and pc.is_primary
      left join collections c on c.id = pc.collection_id
     order by p.title asc, v.position asc, v.sku asc
  `);

  const header = [
    'handle', 'produkt', 'produkt_en', 'status', 'leverantor', 'kategori',
    'sku', 'variant', 'pris', 'valuta', 'lager', 'reserverat', 'lagerstyrd',
    'minsta_antal', 'bestallningssteg', 'aktiv', 'saljbar', 'stripe_produkt',
  ].join(';');

  const rows = (result.rows as Array<Record<string, unknown>>).map(row => {
    const options = (row.option_values ?? []) as Array<{ name: string; value: string }>;
    return [
      row.handle,
      row.title,
      row.title_en,
      row.status,
      row.supplier,
      row.kategori,
      row.sku,
      // Samma namn som kunden ser i väljaren och i korgen.
      options.map(option => option.value).filter(Boolean).join(' / '),
      (Number(row.price_minor ?? 0) / 100).toFixed(2).replace('.', ','),
      String(row.currency ?? '').toUpperCase(),
      row.inventory_quantity,
      row.inventory_reserved,
      row.inventory_tracked ? 'ja' : 'nej',
      row.minimum_order_quantity,
      row.order_increment,
      row.active ? 'ja' : 'nej',
      row.available_for_sale ? 'ja' : 'nej',
      row.stripe_product_id,
    ].map(cell).join(';');
  });

  return [header, ...rows].join('\r\n');
}
