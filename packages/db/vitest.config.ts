import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DEMO_DATABASE_NAME: 'oncobrief',
      ONCOBRIEF_DEMO_MODE: 'true',
    },
    include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    // Integration tests share one database; serialise to keep fixtures stable.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
