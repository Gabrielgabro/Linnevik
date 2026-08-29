import { neon } from '@neondatabase/serverless';
import 'dotenv/config';
const sql = neon(process.env.DATABASE_URL_UNPOOLED);
async function run() {
  const variants = await sql`SELECT id, product_id, option_values FROM product_variants WHERE option_values::text LIKE '%Doftprofil%' OR option_values::text LIKE '%Morgonlinne%' OR option_values::text LIKE '%Havskant%'`;
  console.log("Variants:", JSON.stringify(variants, null, 2));

  // Let's also check handles to see which ones are Swedish and need English URLs (or how handles are translated)
  // Wait, Drizzle doesn't support translated handles natively, maybe we just need to update `handle_en` on products?
  // Let's check products table schema for handle_en.
  const prodSchema = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'products'`;
  console.log("Product columns:", prodSchema.map(r => r.column_name).join(', '));
}
run();
