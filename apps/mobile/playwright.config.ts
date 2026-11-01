import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8087',
    headless: true,
    viewport: { width: 393, height: 852 },
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: [
    {
      command: 'node tools/serve-preview.cjs 8087',
      url: 'http://127.0.0.1:8087',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @oncobrief/web exec node --import tsx tools/serve-portal.ts 3000',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
