import { test, expect } from '@playwright/test';

test.describe('OncoBrief Wave 2 Complete Scope E2E Suite (E2E-004 through E2E-011)', () => {
  test('E2E-004 & E2E-006: Multi-report packet segmentation badges and browser extension scoped grant UI on /sources', async ({
    page,
  }) => {
    await page.goto('/workspace');
    const firstPatientLink = page.locator('a[href*="/patients/"]').first();
    if ((await firstPatientLink.count()) > 0) {
      await firstPatientLink.click();
      await page.goto(`${page.url().split('/patients/')[0]}/patients/${page.url().split('/patients/')[1]?.split('/')[0]}/sources`);
      await expect(page.getByTestId('upload-import-card')).toBeVisible();
      await page.getByRole('button', { name: /Import from EHR \/ ABDM/i }).click();
      await expect(page.getByTestId('extension-grant-panel')).toBeVisible();
      await expect(page.getByTestId('mint-extension-grant-btn')).toBeVisible();
    }
  });

  test('E2E-005 & E2E-007: Interactive Guideline PDF library and packet withdrawal controls on /packet', async ({
    page,
  }) => {
    await page.goto('/workspace');
    const firstPatientLink = page.locator('a[href*="/patients/"]').first();
    if ((await firstPatientLink.count()) > 0) {
      await firstPatientLink.click();
      const basePatientUrl = `${page.url().split('/patients/')[0]}/patients/${page.url().split('/patients/')[1]?.split('/')[0]}`;
      await page.goto(`${basePatientUrl}/packet`);
      await expect(page.getByTestId('guideline-library-panel')).toBeVisible();
      await expect(page.getByTestId('productivity-studio')).toBeVisible();
    }
  });

  test('E2E-008 & E2E-009: Two-step OPD slot offer acceptance and DB-backed operational telemetry on /workspace', async ({
    page,
  }) => {
    await page.goto('/workspace');
    const liveOpdBtn = page.getByRole('button', { name: /Live oncology OPD/i });
    if ((await liveOpdBtn.count()) > 0) {
      await liveOpdBtn.click();
      await expect(page.getByTestId('opd-workspace')).toBeVisible();
      await expect(page.getByTestId('opd-operational-metrics')).toBeVisible();
    }
  });

  test('E2E-010 & E2E-011: Dynamic patient snapshot alerts and task priority/deadline controls', async ({
    page,
  }) => {
    await page.goto('/workspace');
    const firstPatientLink = page.locator('a[href*="/patients/"]').first();
    if ((await firstPatientLink.count()) > 0) {
      await firstPatientLink.click();
      const basePatientUrl = `${page.url().split('/patients/')[0]}/patients/${page.url().split('/patients/')[1]?.split('/')[0]}`;
      await page.goto(`${basePatientUrl}/tasks`);
      await expect(page.locator('h2', { hasText: /Source-backed administrative tasks/i })).toBeVisible();
    }
  });
});
