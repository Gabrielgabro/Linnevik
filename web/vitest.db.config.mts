import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Databastesterna: `npm run test:db`. Se tests/db/globalSetup.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/globalSetup.ts'],
    setupFiles: ['tests/db/setup.ts'],
    // En gren delas av alla filer. En i taget, så att de inte stör varandra.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    restoreMocks: true,
  },
});
