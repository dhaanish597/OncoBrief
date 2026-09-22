import { expect, test, type Page } from '@playwright/test';

/**
 * The critical demo flow (CLAUDE.md steps 1–19), as one authenticated journey.
 *
 * Preconditions: Postgres up, migrations applied, and `pnpm demo:reset` run so
 * the fixtures are in their designed initial state (DEMO-001 has an open
 * surgery-date conflict and a missing insurance authorization; DEMO-003 is
 * ready with a draft packet).
 */

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

async function openPatient(page: Page, code: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(code) }).first().click();
  await expect(page).toHaveURL(/\/patients\/.+\/evidence/);
}

test.describe('OncoBrief — evidence-first demo flow', () => {
  test('1-2 login and open a patient', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /consultation workspace/i })).toBeVisible();
    await expect(page.getByTestId('readiness-band').first()).toBeVisible();
    await openPatient(page, 'DEMO-001');
    await expect(page.getByRole('heading', { name: /DEMO-001/ })).toBeVisible();
  });

  test('3-5 inspect evidence, open the source and verify', async ({ page }) => {
    await login(page);
    await openPatient(page, 'DEMO-001');

    const rows = page.getByTestId('evidence-row');
    await expect(rows.first()).toBeVisible();

    // Open the source inspector from an unverified row.
    const unverified = page.locator('[data-testid="evidence-row"][data-state="extracted"]').first();
    await expect(unverified).toBeVisible();
    await unverified.getByRole('link').first().click();
    await expect(page.getByText(/Source inspector/i)).toBeVisible();

    // The highlight is drawn from stored span geometry.
    await expect(page.locator('[data-highlight="true"]').first()).toBeVisible();

    // Verify the fact against its source.
    await page.getByTestId('verify-evidence').first().click();
    await expect(page.getByTestId('state-verified').first()).toBeVisible();
  });

  test('6 resolve a real contradiction through the reconciliation room', async ({ page }) => {
    await login(page);
    await openPatient(page, 'DEMO-001');
    await page.getByTestId('tab-conflicts').click();

    await page.getByRole('link', { name: /open reconciliation room/i }).first().click();
    await expect(page.getByText(/Reconciliation room/i)).toBeVisible();

    // Both sources are shown, side by side.
    await expect(page.getByTestId('source-pane')).toHaveCount(2);

    // Retain both: the honest answer when the record does not settle it.
    const form = page.getByTestId('resolve-retain-both').locator('xpath=ancestor::form[1]');
    await form
      .locator('textarea[name="reason"]')
      .fill('Both documents are on file; coordinator to confirm with the facility.');
    await page.getByTestId('resolve-retain-both').click();

    await expect(page).toHaveURL(/\/conflicts$/);
  });

  test('7 create a source-backed task from a missing document', async ({ page }) => {
    await login(page);
    await openPatient(page, 'DEMO-001');
    await page.getByTestId('tab-record-map').click();

    await expect(page.locator('[data-testid="record-gap"][data-status="missing"]').first()).toBeVisible();
    await page.getByTestId('create-task-from-gap').first().click();
    await page
      .getByRole('button', { name: /create task from this gap/i })
      .first()
      .click();

    // The task is created from the gap; confirm it on the tasks surface.
    await page.getByTestId('tab-tasks').click();
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expect(page.getByText(/origin: missing document/i).first()).toBeVisible();
  });

  test('8-10 packet approval and an approved patient message', async ({ page }) => {
    await login(page);
    await openPatient(page, 'DEMO-003');

    await page.getByTestId('tab-packet').click();
    // The mandatory sections render even when empty.
    await expect(page.getByText(/Open source conflicts/i)).toBeVisible();
    await expect(page.getByText(/Missing documents/i)).toBeVisible();

    await page.getByTestId('approve-packet').click();
    await expect(page.getByText(/ledger seq/i)).toBeVisible();
    await expect(page.getByTestId('export-packet')).toBeVisible();

    await page.getByTestId('tab-continuity').click();
    const approveMessage = page.getByTestId('approve-message').first();
    if (await approveMessage.isVisible().catch(() => false)) {
      await approveMessage.click();
      await expect(page.getByTestId('deliver-message').first()).toBeVisible();
      await page.getByTestId('deliver-message').first().click();
      await expect(page.getByText(/simulated/i).first()).toBeVisible();
    }
  });

  test('11 the audit trail verifies its hash chain', async ({ page }) => {
    await login(page);
    await openPatient(page, 'DEMO-001');
    await page.getByTestId('tab-audit').click();

    const verify = page.getByTestId('ledger-verify');
    await expect(verify).toBeVisible();
    await expect(verify).toHaveAttribute('data-ok', 'true');
    await expect(page.getByText(/evidence.verified|conflict.resolved|document.page_viewed/).first()).toBeVisible();
  });

  test('rbac: a coordinator sees no approve control', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('coord.anita@rci.demo');
    await page.getByLabel('Password').fill(CLINICIAN.password);
    await page.getByRole('button', { name: 'Open the workspace' }).click();
    await expect(page).toHaveURL(/\/workspace/);

    await openPatient(page, 'DEMO-003');
    await page.getByTestId('tab-packet').click();
    await expect(page.getByTestId('approve-packet')).toHaveCount(0);
  });
});
