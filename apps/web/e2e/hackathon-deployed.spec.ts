import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

test.describe('restricted synthetic hackathon deployment', () => {
  test.skip(process.env.HACKATHON_EVALUATION !== '1', 'Explicit deployed synthetic evaluation only.');
  test.setTimeout(120_000);

  async function login(page: Page, code = 'DEMO-001', email = 'dr.rao@rci.demo') {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('oncobrief-demo');
    await page.getByRole('button', { name: 'Open the workspace' }).click();
    await expect(page).toHaveURL(/\/workspace/);
    await page.getByRole('link', { name: new RegExp(code) }).first().click();
    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+\//);
    return new URL(page.url()).pathname.split('/')[2]!;
  }

  test('denies outsiders on pages, APIs and static paths', async () => {
    // Native fetch has no Playwright project HTTP credentials.
    for (const path of ['/', '/login', '/workspace', '/api/v1/health', '/_next/static/probe.js']) {
      const response = await fetch(`${process.env.E2E_BASE_URL}${path}`);
      expect(response.status, path).toBe(401);
      expect(await response.text()).not.toContain('dr.rao');
    }
  });

  test('uploads to S3 through synchronous ingestion and verifies source-backed evidence', async ({ page }) => {
    const patientId = await login(page);
    await page.goto(`/patients/${patientId}/sources`);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const source = pdf.addPage();
    source.drawText('Synthetic hackathon evaluation only\nLaboratory Report\nReport date: 2026-11-05\nHemoglobin: 11.2 g/dL\nFollow-up appointment: 2026-11-12', { x: 50, y: 740, size: 12, font, lineHeight: 20 });
    const filename = `synthetic-evaluation-${Date.now()}.pdf`;
    let directReservation = false;
    page.on('request', request => { if (request.url().includes('/documents/upload-url')) directReservation = true; });
    await page.getByLabel('Select record file to upload and ingest').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await page.getByRole('button', { name: 'Upload and ingest', exact: true }).click();
    const sourceLink = page.getByRole('link', { name: filename, exact: true });
    await expect(sourceLink).toBeVisible({ timeout: 90_000 });
    expect(directReservation).toBe(false);
    await sourceLink.click();
    await expect(page.getByText(/Source inspector/i)).toBeVisible();
    await expect(page.locator('[data-highlight="true"]').first()).toBeVisible();
    await page.getByTestId('verify-evidence').first().click();
    await expect(page.getByTestId('state-verified').first()).toBeVisible();
  });

  test('keeps contradiction resolution and source-backed task creation human controlled', async ({ page }) => {
    await login(page);
    await page.getByTestId('tab-conflicts').click();
    await page.getByRole('link', { name: /open reconciliation room/i }).first().click();
    await expect(page.getByTestId('source-pane').first()).toBeVisible();
    expect(await page.getByTestId('source-pane').count()).toBeGreaterThanOrEqual(2);
    const form = page.getByTestId('resolve-retain-both').locator('xpath=ancestor::form[1]');
    await form.locator('textarea[name="reason"]').fill('Synthetic evaluator review: preserve both source values for facility confirmation.');
    await page.getByTestId('resolve-retain-both').click();
    await expect(page).toHaveURL(/\/conflicts$/);
    await page.getByTestId('tab-record-map').click();
    await page.getByTestId('create-task-from-gap').first().click();
    await page.getByRole('button', { name: /create task from this gap/i }).first().click();
    await page.getByTestId('tab-tasks').click();
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expect(page.getByText(/origin: missing document/i).first()).toBeVisible();
  });

  test('approves a packet and preserves simulated continuity and auditor checks', async ({ page }) => {
    const patientId = await login(page, 'DEMO-003');
    await page.getByTestId('tab-packet').click();
    await page.getByRole('button', { name: 'assemble draft', exact: true }).click();
    await page.getByTestId('approve-packet').click();
    await expect(page.getByTestId('export-packet')).toBeVisible();
    await page.context().clearCookies();
    await login(page, 'DEMO-003', 'coord.anita@rci.demo');
    await page.getByTestId('tab-continuity').click();
    await expect(page.getByTestId('approve-message')).toHaveCount(0);
    await page.getByTestId('compose-message').click();
    await page.context().clearCookies();
    await login(page, 'DEMO-003');
    await page.getByTestId('tab-continuity').click();
    await page.getByTestId('approve-message').first().click();
    await page.getByTestId('deliver-message').first().click();
    await expect(page.getByText(/outbox:.*simulated delivery/i).first()).toBeVisible();
    expect((await page.goto(`/patients/${patientId}/audit`))?.status()).toBe(403);
    await page.context().clearCookies();
    await login(page, 'DEMO-003', 'auditor.k@rci.demo');
    await page.goto(`/patients/${patientId}/audit`);
    await expect(page.getByTestId('ledger-verify')).toHaveAttribute('data-ok', 'true');
  });
});
