import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Databastesterna kräver en Neon-gren och körs med `npm run test:db`.
    exclude: ['tests/db/**', 'node_modules/**'],
    restoreMocks: true,
  },
});
