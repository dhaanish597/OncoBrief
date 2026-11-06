import { test, expect } from '@playwright/test';
import { loginAsClinician } from './helpers';

const MOBILE_ROUTES = [
  '/workspace',
  '/workspace?view=opd',
  '/workspace?view=timeline',
  '/patients',
  '/appointments',
  '/my-tasks',
  '/tumor-board',
  '/analytics',
  '/admin',
  '/about',
];

test.describe('TASK-020: 375px Mobile Viewport Zero-Overflow Verification Gate (E2E-015)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('enforces scrollWidth <= 375 across workspace, patient, and Milestone A/B routes at 375px viewport width', async ({
    page,
  }) => {
    await loginAsClinician(page);
    for (const route of MOBILE_ROUTES) {
      await page.goto(route);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(
        scrollWidth,
        `Route ${route} overflowed 375px viewport with scrollWidth=${scrollWidth}`,
      ).toBeLessThanOrEqual(375);
    }

    // Also verify patient sub-routes if a patient is present
    await page.goto('/patients');
    const firstPatientLink = page.locator('tbody a[href*="/patients/"]').first();
    if ((await firstPatientLink.count()) > 0) {
      const href = await firstPatientLink.getAttribute('href');
      const match = href?.match(/\/patients\/([a-f0-9-]+)/);
      const patientId = match?.[1];
      if (patientId) {
        for (const tab of ['overview', 'evidence', 'sources', 'record-map', 'tasks', 'packet', 'continuity']) {
          const patientRoute = `/patients/${patientId}/${tab}`;
          await page.goto(patientRoute);
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(
            sw,
            `Patient route ${patientRoute} overflowed 375px viewport with scrollWidth=${sw}`,
          ).toBeLessThanOrEqual(375);
        }
      }
    }
  });
});
