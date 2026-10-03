import { expect, test, type Page } from '@playwright/test';

/**
 * Deployment smoke — the same architectural claims as `demo-flow.spec.ts`, run
 * against a **deployed** instance whose dataset differs from the local fixtures
 * (the AWS environment seeds `DEMO-ONCO-001`, not `DEMO-001/002/003`).
 *
 * It is opt-in: the local suite is unaffected unless `E2E_DEPLOYED_CODE` names
 * the deployed patient, e.g.
 *
 *   E2E_SKIP_SERVER=1 \
 *   E2E_BASE_URL=https://<cloudfront-host> \
 *   E2E_DEPLOYED_CODE=DEMO-ONCO-001 \
 *   pnpm --filter @oncobrief/web exec playwright test deployed.spec.ts
 */

const CODE = process.env['E2E_DEPLOYED_CODE'];
const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

async function openPatient(page: Page): Promise<void> {
  await page.getByRole('link', { name: new RegExp(CODE!) }).first().click();
  await expect(page).toHaveURL(/\/patients\/.+\/evidence/);
}

test.describe('OncoBrief — deployed instance', () => {
  test.skip(!CODE, 'Set E2E_DEPLOYED_CODE to run this suite against a deployed instance.');

  test('login, workspace and the demo patient load', async ({ page }) => {
    await login(page);
    await expect(page).toHaveTitle(/OncoBrief/);
    await expect(page.getByRole('heading', { name: /consultation workspace/i })).toBeVisible();
    await openPatient(page);
    await expect(page.getByRole('heading', { name: new RegExp(CODE!) })).toBeVisible();
    await expect(page.getByTestId('evidence-row').first()).toBeVisible();
  });

  test('a fact carries inspectable provenance', async ({ page }) => {
    await login(page);
    await openPatient(page);
    await page.getByRole('button', { name: /Show provenance/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/extraction/i)).toBeVisible();
    await expect(dialog.getByText(/page \d/i)).toBeVisible();
  });

  test('source inspector draws stored geometry and human verify works', async ({ page }) => {
    await login(page);
    await openPatient(page);
    const unverified = page.locator('[data-testid="evidence-row"][data-state="extracted"]').first();
    await expect(unverified).toBeVisible();
    await unverified.getByRole('link').first().click();
    await expect(page.getByText(/Source inspector/i)).toBeVisible();
    await expect(page.locator('[data-highlight="true"]').first()).toBeVisible();
    await page.getByTestId('verify-evidence').first().click();
    await expect(page.getByTestId('state-verified').first()).toBeVisible();
  });

  test('reconciliation keeps both values for a human', async ({ page }) => {
    await login(page);
    await openPatient(page);
    await page.getByTestId('tab-conflicts').click();
    await page.getByRole('link', { name: /open reconciliation room/i }).first().click();
    await expect(page.getByText(/Reconciliation room/i).first()).toBeVisible();
    await expect(page.getByTestId('source-pane')).toHaveCount(2);
  });

  test('sources inventory shows documents and duplicate candidates', async ({ page }) => {
    await login(page);
    await openPatient(page);
    await page.getByRole('link', { name: /^Sources$/ }).click();
    await expect(page.getByText(/duplicate — confirm/i).first()).toBeVisible();
  });
});
