import { defineConfig, devices } from '@playwright/test';

/**
 * The demo *is* the test suite (architecture §23.3): a regression that breaks
 * the pitch fails here on the commit that causes it, rather than being found on
 * judging day.
 *
 * The spec mutates the ledger, so run `pnpm demo:reset` first.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: 'pnpm start',
        url: 'http://localhost:3000/login',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
