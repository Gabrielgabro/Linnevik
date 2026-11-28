import { defineConfig } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

/**
 * Flödestester genom webbläsaren, från klick till databas (plan.md, lager C).
 *
 * De körs mot en server som redan är igång och som använder en egen
 * databasgren, aldrig produktionen. Ange grenens adress i E2E_DATABASE_URL
 * och serverns i E2E_BASE_URL (standard http://localhost:3100).
 */
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    locale: 'sv-SE',
    trace: 'retain-on-failure',
  },
});
