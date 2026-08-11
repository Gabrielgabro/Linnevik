/**
 * Laddar kundregistret från src/data/clientsSeed.json in i databasen.
 * Filen är genererad ur sales/kunder_tvätteriet.xlsx.
 *
 *   node scripts/seed-clients.mjs
 *
 * Körs en gång vid uppstart, och går att köra om: befintliga kunder känns
 * igen på kundnumret och rörs inte. Skriptet ändrar alltså aldrig något
 * någon har redigerat i adminvyn — det lägger bara till det som saknas.
 */

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Ingen .env.local — variabeln får komma från miljön i stället.
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL saknas.');
  process.exit(1);
}

const clientSeed = JSON.parse(
  readFileSync(new URL('../src/data/clientsSeed.json', import.meta.url), 'utf8')
);
const sql = neon(process.env.DATABASE_URL);

let added = 0;
for (const client of clientSeed) {
  const rows = await sql`
    insert into clients (customer_no, name, reminder_fee, name_truncated, notes)
    values (${client.customerNo}, ${client.name}, ${client.reminderFee},
            ${client.nameTruncated}, ${client.notes})
    on conflict (customer_no) do nothing
    returning id`;
  if (rows.length) added++;
}

console.log(`${added} kunder tillagda, ${clientSeed.length - added} fanns redan.`);
