/**
 * Validate or import the generated Shopify staging report into Neon.
 *
 * Dry-run (default): npm run catalog:import
 * Apply after every SKU is in latest_import/products_import_sku.csv:
 *   npm run catalog:import -- --apply
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(here, '../../catalog/shopify/staging/catalog-staging-report.json');
const apply = process.argv.includes('--apply');

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const variants = report.variants ?? [];
const errors = [];
const generated = variants.filter(variant => variant.skuSource === 'generated');
const unmatched = variants.filter(variant => !variant.matchStatus?.startsWith('matched_'));
const duplicateSkus = Object.entries(
  variants.reduce((counts, variant) => {
    counts[variant.proposedSku] = (counts[variant.proposedSku] ?? 0) + 1;
    return counts;
  }, {})
).filter(([, count]) => count > 1);

if (!variants.length) errors.push('The staging report contains no variants.');
if (unmatched.length) errors.push(`${unmatched.length} variants are not matched to Shopify.`);
if (duplicateSkus.length) errors.push(`${duplicateSkus.length} proposed SKUs are duplicated.`);
if (variants.some(variant => !variant.productId || !variant.variantId)) {
  errors.push('One or more rows are missing Shopify IDs.');
}
if (variants.some(variant => !Number.isInteger(Math.round(Number(variant.price) * 100)))) {
  errors.push('One or more prices cannot be represented in minor units.');
}

const summary = {
  mode: apply ? 'apply' : 'dry-run',
  products: new Set(variants.map(variant => variant.productId)).size,
  variants: variants.length,
  approvedSkus: variants.length - generated.length,
  generatedSkusAwaitingApproval: generated.length,
  errors,
};
console.log(JSON.stringify(summary, null, 2));

if (errors.length) process.exit(1);
if (!apply) {
  console.log('Dry-run only. No database changes were made.');
  process.exit(0);
}
if (generated.length) {
  console.error('Refusing to import generated SKU proposals. Add all approved SKUs to catalog/shopify/latest_import/products_import_sku.csv, then regenerate the staging report.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(here, '../.env.local'));
  } catch {
    // DATABASE_URL may already be supplied by the caller.
  }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for --apply.');

const sql = neon(process.env.DATABASE_URL);
const syncedAt = new Date(report.generatedAt);
const productRows = [...new Map(variants.map(variant => [variant.productId, variant])).values()];

for (const product of productRows) {
  await sql`
    INSERT INTO products (shopify_product_id, handle, title, source_synced_at, updated_at)
    VALUES (${product.productId}, ${product.handle}, ${product.productTitle}, ${syncedAt}, now())
    ON CONFLICT (shopify_product_id) DO UPDATE SET
      handle = excluded.handle,
      title = excluded.title,
      source_synced_at = excluded.source_synced_at,
      updated_at = now()
  `;
}

for (const variant of variants) {
  const options = [
    [variant.option1Name, variant.option1Value],
    [variant.option2Name, variant.option2Value],
    [variant.option3Name, variant.option3Value],
  ].filter(([, value]) => value).map(([name, value]) => ({ name, value }));
  const priceMinor = Math.round(Number(variant.price) * 100);
  const lookupKey = `linnevik_${variant.proposedSku.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

  await sql`
    INSERT INTO product_variants (
      product_id, shopify_variant_id, sku, option_values, price_minor, currency,
      inventory_quantity, available_for_sale, stripe_lookup_key, source_synced_at, updated_at
    )
    SELECT id, ${variant.variantId}, ${variant.proposedSku}, ${JSON.stringify(options)}::jsonb,
      ${priceMinor}, ${variant.currency.toLowerCase()}, ${variant.inventoryQuantity},
      ${variant.availableForSale}, ${lookupKey}, ${syncedAt}, now()
    FROM products WHERE shopify_product_id = ${variant.productId}
    ON CONFLICT (shopify_variant_id) DO UPDATE SET
      product_id = excluded.product_id,
      sku = excluded.sku,
      option_values = excluded.option_values,
      price_minor = excluded.price_minor,
      currency = excluded.currency,
      inventory_quantity = excluded.inventory_quantity,
      available_for_sale = excluded.available_for_sale,
      stripe_lookup_key = excluded.stripe_lookup_key,
      source_synced_at = excluded.source_synced_at,
      updated_at = now()
  `;
}

console.log(`Imported ${productRows.length} products and ${variants.length} variants.`);
