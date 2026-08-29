import { neon } from '@neondatabase/serverless';
import 'dotenv/config';
const sql = neon(process.env.DATABASE_URL_UNPOOLED);
async function run() {
  const images = await sql`SELECT id, product_id, alt_text FROM product_images WHERE alt_text IS NOT NULL`;
  console.log("Images:");
  for (const img of images) {
    if (img.alt_text.length > 50) {
      console.log(`- ${img.product_id}: ${img.alt_text}`);
    }
  }
}
run();
