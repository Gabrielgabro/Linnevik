import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL_UNPOOLED);

async function run() {
  console.log("Collections:");
  const collections = await sql`SELECT handle, title_sv, title_en FROM collections WHERE title_sv ILIKE '%featured%' OR title_en ILIKE '%featured%'`;
  console.log(collections);

  console.log("\nProducts:");
  const products = await sql`SELECT id, handle, title_en, title FROM products`;
  console.log(products.slice(0, 5));

  console.log("\nVariants:");
  const variants = await sql`SELECT id, product_id, option_values FROM product_variants`;
  console.log(variants.filter(v => JSON.stringify(v.option_values).includes("Doftprofil")).slice(0, 2));

  console.log("\nImages:");
  const images = await sql`SELECT id, product_id, alt_text FROM product_images WHERE alt_text IS NOT NULL`;
  console.log(images.filter(i => i.alt_text && i.alt_text.includes("prompt")).slice(0, 5));
}
run();
