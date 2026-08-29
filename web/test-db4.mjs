import { neon } from '@neondatabase/serverless';
import 'dotenv/config';
const sql = neon(process.env.DATABASE_URL_UNPOOLED);
async function run() {
  const varSchema = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'product_variants'`;
  console.log("Variant columns:", varSchema.map(r => r.column_name).join(', '));
}
run();
