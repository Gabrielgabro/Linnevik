/**
 * Applies pending numbered migrations from drizzle/*.sql in order, tracked
 * in a `_migrations` table so each file runs exactly once. Runs as part of
 * `npm run build`, so a Vercel deploy can never again ship code against a
 * database that's missing the migration it depends on.
 *
 * prod-setup.sql is the one-time initial setup script, not part of the
 * numbered sequence, and is intentionally excluded.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, '../.env.local'));
} catch {
  // CI and production provide DATABASE_URL directly.
}

if (!process.env.DATABASE_URL) {
  console.log('migrate: no DATABASE_URL, skipping');
  process.exit(0);
}

const sql = neon(process.env.DATABASE_URL);
const dir = resolve(here, '../drizzle');
const files = readdirSync(dir)
  .filter(name => /^\d{4}_.*\.sql$/.test(name))
  .sort();

/**
 * The Neon HTTP driver runs one statement per request, so a multi-statement
 * migration file has to be split on ';'. A naive split breaks DO $$ ... $$
 * blocks (their body contains ';'), so this tracks single-quote strings,
 * dollar-quoted strings, and '--' comments to only split at top level.
 */
function splitStatements(text) {
  const statements = [];
  let start = 0;
  let i = 0;
  let inSingleQuote = false;
  let inLineComment = false;
  let dollarTag = null; // e.g. '$$' or '$tag$' while inside a dollar-quoted block

  while (i < text.length) {
    const c = text[i];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }
    if (inSingleQuote) {
      if (c === "'") inSingleQuote = false;
      i += 1;
      continue;
    }
    if (c === '-' && text[i + 1] === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      inSingleQuote = true;
      i += 1;
      continue;
    }
    if (c === '$') {
      const match = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
        continue;
      }
    }
    if (c === ';') {
      const statement = text.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
    i += 1;
  }
  const rest = text.slice(start).trim();
  if (rest) statements.push(rest);
  return statements;
}

await sql`CREATE TABLE IF NOT EXISTS "_migrations" (
  "name" text PRIMARY KEY,
  "applied_at" timestamptz NOT NULL DEFAULT now()
)`;

const applied = new Set((await sql`SELECT "name" FROM "_migrations"`).map(r => r.name));

for (const file of files) {
  if (applied.has(file)) continue;
  const statements = splitStatements(readFileSync(resolve(dir, file), 'utf8'));
  console.log(`migrate: applying ${file} (${statements.length} statements)`);
  for (const statement of statements) {
    await sql.query(statement);
  }
  await sql`INSERT INTO "_migrations" ("name") VALUES (${file})`;
}

console.log('migrate: up to date');
