import { defineConfig } from 'drizzle-kit';

// drizzle-kit körs utanför Next, som annars är den som läser .env.local.
// Utan det här ser CLI:t ingen DATABASE_URL.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Ingen .env.local — då får variabeln komma från miljön i stället.
  }
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
