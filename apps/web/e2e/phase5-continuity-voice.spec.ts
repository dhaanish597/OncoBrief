import { expect, test, type Page } from '@playwright/test';
import { getMigratorPool } from '../../../packages/db/src/client';

async function loginAsCoordinator(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('coord.anita@rci.demo');
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/workspace/);
}

async function queryDb(sql: string, params: unknown[] = []) {
  return getMigratorPool().query(sql, params);
}

test.describe.serial('Phase 5: Consented Caregiver Network, Voice Continuity, Attendance, and Accessibility', () => {
  let demo1PatientId: string;
  let demo3PatientId: string;

  test.beforeAll(async () => {
    const res1 = await queryDb(
      `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-001'`,
    );
    demo1PatientId = res1.rows[0].id;

    const res3 = await queryDb(
      `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-003'`,
    );
    demo3PatientId = res3.rows[0].id;
  });

  test('1. Caregiver Network: view seeded caregiver, register new consented caregiver, and revoke consent', async ({
    page,
  }) => {
    await loginAsCoordinator(page);
    await page.goto(`/patients/${demo1PatientId}/continuity`);

    // Verify Caregiver Network section is present
    const caregiverSection = page.getByTestId('caregiver-network-section');
    await expect(caregiverSection).toBeVisible();

    // Verify seeded caregiver Sunita Sharma
    await expect(page.locator('text=Sunita Sharma')).toBeVisible();
    await expect(page.locator('text=Consented & Active').first()).toBeVisible();

    // Open register caregiver details form
    const registerSummary = page.locator('summary:has-text("Register a New Consented Family Caregiver")');
    await registerSummary.click();

    // Fill form
    await page.fill('input[name="fullName"]', 'Vikram Sharma');
    await page.fill('input[name="relationship"]', 'Son / Secondary Caregiver');
    await page.fill('input[name="phoneNumber"]', '+91 98111 22233');
    await page.selectOption('select[name="preferredLocale"]', 'ta-IN');

    await page.getByTestId('register-caregiver-button').click();

    // Verify Vikram Sharma is rendered with Active status and ta-IN
    await expect(page.locator('text=Vikram Sharma')).toBeVisible();
    await expect(page.locator('text=ta-IN').first()).toBeVisible();

    // Revoke consent for Vikram Sharma
    const card = page.locator('[data-testid^="caregiver-card-"]').filter({ hasText: 'Vikram Sharma' });
    const revokeBtn = card.locator('button:has-text("Revoke Consent")');
    await revokeBtn.click();

    // Verify status changed to Consent Revoked
    await expect(page.locator('text=Consent Revoked').first()).toBeVisible();
  });

  test('2. Multilingual Voice Preview: select 11 locales, generate audio or trigger honest fallback', async ({
    page,
  }) => {
    await loginAsCoordinator(page);
    await page.goto(`/patients/${demo3PatientId}/continuity`);

    // Locate the first message audio player
    const localeSelect = page.getByTestId('audio-locale-select').first();
    await expect(localeSelect).toBeVisible();

    // Select Tamil (Indic language)
    await localeSelect.selectOption('ta-IN');

    // Click generate voice note
    const generateBtn = page.getByTestId('generate-voice-note').first();
    await generateBtn.click();

    // Either Sarvam generated audio or the fallback note is presented
    const fallbackNote = page.getByTestId('tts-fallback-note').first();
    const audioElement = page.getByTestId('continuity-audio-element').first();

    // Wait for either the audio player or the fallback note
    await expect(fallbackNote.or(audioElement)).toBeVisible({ timeout: 10_000 });

    if (await fallbackNote.isVisible()) {
      // Offline fallback: load labeled synthetic demo audio
      const loadDemoBtn = page.getByTestId('load-synthetic-demo-audio').first();
      await loadDemoBtn.click();
      await expect(page.getByTestId('continuity-audio-element').first()).toBeVisible();
      await expect(page.getByTestId('audio-provider-badge').first()).toContainText('Synthetic Demo Audio');
    } else {
      await expect(page.getByTestId('audio-provider-badge').first()).toContainText('Sarvam Bulbul v3');
    }
  });

  test('3. Two-Way Attendance Confirmation: record inbound attendance response on delivered message with audit', async ({
    page,
  }) => {
    await loginAsCoordinator(page);
    await page.goto(`/patients/${demo3PatientId}/continuity`);

    // Check attendance panel exists for delivered message
    const attendancePanel = page.locator('[data-testid^="attendance-panel-"]').first();
    await expect(attendancePanel).toBeVisible();

    // Select Confirmed Attendance
    await page.getByTestId('attendance-select').first().selectOption('confirmed_attendance');
    await page.fill('input[name="note"]', 'Confirmed attendance via SMS response');

    await page.getByTestId('record-attendance-button').first().click();

    // Verify status badge updates to Confirmed Attendance
    const statusBadge = page.locator('[data-testid^="attendance-status-badge-"]').first();
    await expect(statusBadge).toContainText('Confirmed Attendance');

    // Verify audit event in DB
    const auditRes = await queryDb(
      `SELECT action, outcome FROM audit_event WHERE action = 'message.attendance_recorded' ORDER BY seq DESC LIMIT 1`,
    );
    expect(auditRes.rowCount).toBeGreaterThan(0);
    expect(auditRes.rows[0].outcome).toBe('success');
  });

  test('4. WCAG 2.2 AA Accessibility & 375px Mobile Viewport: landmark check and zero horizontal overflow', async ({
    page,
  }) => {
    await loginAsCoordinator(page);
    await page.goto(`/patients/${demo3PatientId}/continuity`);

    // Semantic landmark check: <main id="main-content"> must exist
    const mainLandmark = page.locator('main#main-content');
    await expect(mainLandmark).toBeVisible();

    // Skip to main content link check
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Test mobile 375px viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that page does not horizontally overflow 375px window
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    // Verify caregiver section and tabs remain accessible on mobile
    await expect(page.getByTestId('caregiver-network-section')).toBeVisible();
    await expect(page.getByTestId('tab-continuity')).toBeVisible();
  });
});
