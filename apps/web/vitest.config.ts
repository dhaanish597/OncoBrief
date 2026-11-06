import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one database; serialise to keep fixtures stable.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
