/**
 * Build a read-only Shopify catalog staging report.
 *
 * Sources:
 *   - the cleaned Shopify CSV export (canonical descriptions/options)
 *   - the original export (matching bridge for edited option values)
 *   - the live Storefront API (Shopify product/variant IDs)
 *   - the existing partial SKU import (preserved SKU proposals)
 *
 * This script never writes to Shopify or the database.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../..');
const exportDirectory = resolve(repositoryRoot, 'catalog/shopify/latest_export');
const importDirectory = resolve(repositoryRoot, 'catalog/shopify/latest_import');
const outputDirectory = resolve(repositoryRoot, 'catalog/shopify/staging');
const originalExportPath = resolve(exportDirectory, 'products_export_1.csv');
const cleanedExportPath = resolve(exportDirectory, 'products_export_1_order_descriptions.csv');
const existingSkuPath = resolve(importDirectory, 'products_import_sku.csv');

if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_STOREFRONT_TOKEN) {
  try {
    process.loadEnvFile(resolve(here, '../.env.local'));
  } catch {
    // Environment variables may already be supplied by the caller.
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows.filter(candidate => candidate.some(value => value !== ''));
  return body.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function optionValues(row) {
  return [row['Option1 Value'], row['Option2 Value'], row['Option3 Value']]
    .filter(value => value && value.trim() && normalize(value) !== 'default title');
}

function optionKey(handle, values) {
  return [normalize(handle), ...values.map(normalize)].join('|');
}

function skuToken(value) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/GASDUN/g, 'GAS')
    .replace(/ANDDUN/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '');
  return normalized || 'STD';
}

function handleToken(handle) {
  return handle.split('-').filter(Boolean).map(part => skuToken(part).slice(0, 3)).join('-');
}

function generatedSku(handle, values) {
  return ['LIN', handleToken(handle), ...values.map(skuToken)].join('-').slice(0, 64);
}

function variantRows(rows) {
  return rows.filter(row => row['Variant Price']?.trim());
}

async function fetchLiveCatalog() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  if (!domain || !token) throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN are required.');

  const query = `query CatalogStage($cursor: String) {
    products(first: 100, after: $cursor, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title
        variants(first: 100) {
          nodes {
            id title sku availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
    }
  }`;
  const products = [];
  let cursor = null;

  do {
    const response = await fetch(`https://${domain}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors) {
      throw new Error(`Shopify catalog query failed (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`);
    }
    products.push(...payload.data.products.nodes);
    cursor = payload.data.products.pageInfo.hasNextPage
      ? payload.data.products.pageInfo.endCursor
      : null;
  } while (cursor);

  return products;
}

const originalRows = variantRows(parseCsv(readFileSync(originalExportPath, 'utf8')));
const cleanedRows = variantRows(parseCsv(readFileSync(cleanedExportPath, 'utf8')));
if (originalRows.length !== cleanedRows.length) {
  throw new Error(`Export row mismatch: original has ${originalRows.length} variants, cleaned has ${cleanedRows.length}.`);
}

const existingSkuRows = parseCsv(readFileSync(existingSkuPath, 'utf8'));
const existingSkus = new Map(existingSkuRows.map(row => [
  optionKey(row.Handle, optionValues(row)),
  row['Variant SKU']?.trim(),
]));
const liveProducts = await fetchLiveCatalog();
const liveByHandle = new Map(liveProducts.map(product => [normalize(product.handle), product]));
const exportPositionByHandle = new Map();
const usedSkus = new Set();
const stagedVariants = [];

for (let index = 0; index < cleanedRows.length; index++) {
  const clean = cleanedRows[index];
  const original = originalRows[index];
  if (clean.Handle !== original.Handle) {
    throw new Error(`Export alignment failed at variant row ${index + 2}.`);
  }

  const product = liveByHandle.get(normalize(clean.Handle));
  const originalOptions = optionValues(original);
  const cleanedOptions = optionValues(clean);
  const productPosition = exportPositionByHandle.get(clean.Handle) ?? 0;
  exportPositionByHandle.set(clean.Handle, productPosition + 1);
  const matches = product?.variants.nodes.filter(variant =>
    optionKey(clean.Handle, variant.selectedOptions.map(option => option.value).filter(value => normalize(value) !== 'default title')) === optionKey(clean.Handle, originalOptions)
  ) ?? [];
  const productExportCount = cleanedRows.filter(row => row.Handle === clean.Handle).length;
  const positionMatch = matches.length === 0 && product?.variants.nodes.length === productExportCount
    ? product.variants.nodes[productPosition]
    : null;
  const preservedSku = existingSkus.get(optionKey(clean.Handle, cleanedOptions))
    || existingSkus.get(optionKey(clean.Handle, originalOptions));
  let proposedSku = preservedSku || generatedSku(clean.Handle, cleanedOptions);
  const initialProposal = proposedSku;
  let suffix = 2;
  while (usedSkus.has(proposedSku)) proposedSku = `${initialProposal}-${suffix++}`;
  usedSkus.add(proposedSku);

  const liveVariant = matches.length === 1 ? matches[0] : positionMatch;
  const issues = [];
  if (!product) issues.push('product_missing_live');
  else if (matches.length === 0 && !positionMatch) issues.push('variant_missing_live');
  else if (positionMatch) issues.push('option_values_differ_live');
  else if (matches.length > 1) issues.push('variant_match_ambiguous');
  if (liveVariant?.sku?.trim() && liveVariant.sku.trim() !== proposedSku) issues.push('live_sku_differs');
  if (liveVariant && (Number(liveVariant.price.amount) !== Number(clean['Variant Price']) || liveVariant.price.currencyCode !== 'SEK')) {
    issues.push('live_price_differs');
  }
  if (!preservedSku) issues.push('sku_needs_review');

  stagedVariants.push({
    handle: clean.Handle,
    productTitle: clean.Title || product?.title || '',
    productId: product?.id ?? null,
    variantId: liveVariant?.id ?? null,
    option1Name: clean['Option1 Name'] || '',
    option1Value: clean['Option1 Value'] || '',
    option2Name: clean['Option2 Name'] || '',
    option2Value: clean['Option2 Value'] || '',
    option3Name: clean['Option3 Name'] || '',
    option3Value: clean['Option3 Value'] || '',
    liveOptions: liveVariant?.selectedOptions ?? [],
    price: clean['Variant Price'],
    currency: liveVariant?.price.currencyCode ?? 'SEK',
    inventoryQuantity: Number(clean['Variant Inventory Qty']),
    availableForSale: liveVariant?.availableForSale ?? null,
    currentShopifySku: liveVariant?.sku?.trim() || null,
    proposedSku,
    skuSource: preservedSku ? 'existing_import' : 'generated',
    matchStatus: matches.length === 1 ? 'matched_exact' : positionMatch ? 'matched_position' : matches.length > 1 ? 'ambiguous' : 'missing',
    issues,
  });
}

const stagedKeys = new Set(stagedVariants.filter(row => row.variantId).map(row => row.variantId));
const liveOnly = liveProducts.flatMap(product => product.variants.nodes
  .filter(variant => !stagedKeys.has(variant.id))
  .map(variant => ({ handle: product.handle, productTitle: product.title, variantId: variant.id, title: variant.title })));
const issueCounts = {};
for (const row of stagedVariants) {
  for (const issue of row.issues) issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  sources: {
    canonicalExport: 'catalog/shopify/latest_export/products_export_1_order_descriptions.csv',
    matchingExport: 'catalog/shopify/latest_export/products_export_1.csv',
    existingSkuImport: 'catalog/shopify/latest_import/products_import_sku.csv',
    liveApi: 'Shopify Storefront API 2025-01',
  },
  summary: {
    exportedProducts: new Set(cleanedRows.map(row => row.Handle)).size,
    exportedVariants: stagedVariants.length,
    liveProducts: liveProducts.length,
    liveVariants: liveProducts.reduce((total, product) => total + product.variants.nodes.length, 0),
    matchedVariants: stagedVariants.filter(row => row.matchStatus.startsWith('matched_')).length,
    preservedSkus: stagedVariants.filter(row => row.skuSource === 'existing_import').length,
    generatedSkuProposals: stagedVariants.filter(row => row.skuSource === 'generated').length,
    liveOnlyVariants: liveOnly.length,
    issueCounts,
  },
  variants: stagedVariants,
  liveOnly,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'catalog-staging-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const csvHeaders = [
  'Handle', 'Product Title', 'Shopify Product ID', 'Shopify Variant ID',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
  'Live Options',
  'Price', 'Currency', 'Inventory Quantity', 'Available For Sale', 'Current Shopify SKU',
  'Proposed SKU', 'SKU Source', 'Match Status', 'Issues',
];
const csvRows = stagedVariants.map(row => [
  row.handle, row.productTitle, row.productId, row.variantId,
  row.option1Name, row.option1Value, row.option2Name, row.option2Value, row.option3Name, row.option3Value,
  row.liveOptions.map(option => `${option.name}: ${option.value}`).join(' | '),
  row.price, row.currency, row.inventoryQuantity, row.availableForSale, row.currentShopifySku,
  row.proposedSku, row.skuSource, row.matchStatus, row.issues.join('|'),
]);
writeFileSync(resolve(outputDirectory, 'catalog-staging-report.csv'),
  `${[csvHeaders, ...csvRows].map(row => row.map(csvEscape).join(',')).join('\n')}\n`);

console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${resolve(outputDirectory, 'catalog-staging-report.json')}`);
console.log(`Wrote ${resolve(outputDirectory, 'catalog-staging-report.csv')}`);

if (report.summary.matchedVariants !== report.summary.exportedVariants || liveOnly.length) process.exitCode = 1;
