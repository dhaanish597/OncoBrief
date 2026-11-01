import { test, expect, type Page } from '@playwright/test';

async function enterApp(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore your care', exact: true }).click();
  await page.getByRole('button', { name: 'Open my demo workspace', exact: true }).click();
  await expect(page.getByText('Your care, connected.', { exact: true })).toBeVisible();
}

test.describe('OncoBrief Patient Mobile — Standalone E2E Suites', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean state per test
    await page.goto('/');
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
      } catch {}
    });
  });

  test('Scenario 1: First-launch Onboarding Consent Gate (REQ-MOB-035)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Navigating to '/' should show the landing screen with Explore button
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Explore your care', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'About signing in', exact: true })).toBeVisible();

    // Clicking Explore your care navigates to /onboarding
    await page.getByRole('button', { name: 'Explore your care', exact: true }).click();
    await expect(page.getByText('A space to make sense\nof the paperwork.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open my demo workspace', exact: true })).toBeVisible();

    // Accepting consent navigates to /(tabs)
    await page.getByRole('button', { name: 'Open my demo workspace', exact: true }).click();
    await expect(page.getByText('Your care, connected.', { exact: true })).toBeVisible();

    // Verify main tabs render cleanly
    for (const [tab, heading] of [
      ['Records', 'Medical records'],
      ['Journey', 'Care journey'],
      ['Insights', 'Care insights'],
      ['You', 'Your profile & privacy'],
      ['Home', 'Your care, connected.'],
    ]) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.getByText(heading, { exact: true })).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });

  test('Scenario 2: Tamil Language Toggle & UTF-8 Integrity (REQ-MOB-029, REQ-MOB-031)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    // Toggle language on landing screen
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByText('உங்கள் பராமரிப்புப் பயணம்,', { exact: false })).toBeVisible();

    // Onboarding in Tamil
    await page.getByRole('button', { name: 'பராமரிப்பைப் பாருங்கள்', exact: true }).click();
    await page.getByRole('button', { name: 'மாதிரிப் பணியிடத்தைத் திறக்கவும்', exact: true }).click();

    // Verify Tamil tab headers and labels render without Cyrillic Mojibake
    await page.getByRole('tab', { name: 'பதிவுகள்', exact: true }).click();
    await expect(page.getByText('மருத்துவப் பதிவுகள்', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'நீங்கள்', exact: true }).click();
    await expect(page.getByText('உங்கள் விவரங்களும் தனியுரிமையும்', { exact: true })).toBeVisible();

    // Horizontal overflow assertion on narrow viewport
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fitsViewport).toBe(true);
  });

  test('Scenario 3: Oncology Cohort Persona Context & Stage Ribbon (REQ-MOB-001..004)', async ({ page }) => {
    await enterApp(page);

    // DEMO-001 Meenakshi Sundaram stage ribbon & diagnosis
    await expect(page.getByText('Meenakshi Sundaram · SUN-448120', { exact: false })).toBeVisible();
    await expect(page.getByText('AC-T Chemotherapy (Cycle 3 of 4) · Adjuvant', { exact: false })).toBeVisible();
    await expect(page.getByText('Stage IIA (cT2N0M0) Invasive Ductal Carcinoma', { exact: false })).toBeVisible();
  });

  test('Scenario 4: Lab Verbatim Display & Zero Range Classification (REQ-MOB-005)', async ({ page }) => {
    await enterApp(page);

    // Open lab results
    await page.getByRole('button', { name: 'Lab results', exact: true }).click();
    await expect(page.getByText('Lab results', { exact: true })).toBeVisible();

    // Inspect Haemoglobin observations
    await expect(page.getByText('12.1 g/dL', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('12–15.5 g/dL', { exact: false }).first()).toBeVisible();

    // Strict Clinical-Safety Assertion: DOM text must NEVER contain range classification labels
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/below supplied interval/i);
    expect(bodyText).not.toMatch(/within supplied interval/i);
    expect(bodyText).not.toMatch(/above supplied interval/i);
  });

  test('Scenario 5: Consultation Preparation, Notes & Export Approval (REQ-MOB-024, REQ-MOB-026)', async ({ page }) => {
    await enterApp(page);

    // Open consultation preparation
    await page.getByRole('button', { name: 'Review preparation', exact: true }).click();
    await page.getByRole('button', { name: 'Questions', exact: true }).click();

    // Add a personal question
    await page.getByTestId('question-input').fill('What precautions should I take if temperature reaches 100.4F?');
    await page.getByRole('button', { name: 'Save question', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /temperature reaches 100.4F/ })).toBeVisible();

    // Write personal symptom notes
    await page.getByLabel('Personal notes', { exact: true }).fill('Experiencing mild fatigue on day 3');
    await page.getByRole('button', { name: 'Save notes', exact: true }).click();

    // Preview consultation pack
    await page.getByRole('button', { name: 'Preview consultation pack', exact: true }).click();
    await expect(page.getByText(/^ONCOBRIEF — SYNTHETIC CONSULTATION PACK/)).toContainText('Experiencing mild fatigue on day 3');

    // Export requires approval checkbox
    await expect(page.getByRole('button', { name: 'Export sample pack', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I approve exporting this synthetic pack', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export sample pack', exact: true })).toBeEnabled();

    // Download verification
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export sample pack', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('oncobrief-consultation-packet.txt');
  });

  test('Scenario 6: Transactional Import & Dual Verification Badges (REQ-MOB-016)', async ({ page }) => {
    await enterApp(page);

    // Navigate to import
    await page.getByRole('button', { name: 'Add a sample report', exact: true }).click();

    // Choose sample file is gated by consent checkbox
    await expect(page.getByRole('button', { name: 'Choose a sample file', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I am using fictional sample files only', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose a sample file', exact: true })).toBeEnabled();

    // Select synthetic PNG image
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose a sample file', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'synthetic-ultrasound.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'),
    });

    await page.getByRole('button', { name: 'Save sample copy', exact: true }).click();
    await expect(page.getByText('synthetic-ultrasound.png', { exact: true }).first()).toBeVisible();

    // Verify non-elevated dual badges
    await expect(page.getByText('Extraction unavailable · original only', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Original document', exact: true }).click();
    await expect(page.getByRole('img', { name: 'synthetic-ultrasound.png', exact: true })).toBeVisible();
  });

  test('Scenario 7: Browser Reload (F5) State Persistence (REQ-MOB-034 / BUG-MOB-08)', async ({ page }) => {
    await enterApp(page);

    // Navigate to preparation and write notes
    await page.getByRole('button', { name: 'Review preparation', exact: true }).click();
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await page.getByLabel('Personal notes', { exact: true }).fill('Persisted across browser refresh');
    await page.getByRole('button', { name: 'Save notes', exact: true }).click();

    // Reload page (F5)
    await page.reload();

    // State must survive reload
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await expect(page.getByLabel('Personal notes', { exact: true })).toHaveValue('Persisted across browser refresh');
  });

  test('Scenario 8: Consent Revocation & Full Data Wipe (REQ-MOB-035)', async ({ page }) => {
    await enterApp(page);

    // Navigate to You / Profile tab
    await page.getByRole('tab', { name: 'You', exact: true }).click();
    await page.getByRole('button', { name: 'Erase demo and restart', exact: true }).click();

    // Erase button is disabled until checkbox is checked
    await expect(page.getByRole('button', { name: 'Erase my demo changes', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Erase my demo changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Erase my demo changes', exact: true })).toBeEnabled();

    // Click erase
    await page.getByRole('button', { name: 'Erase my demo changes', exact: true }).click();

    // Should return to clean landing screen
    await expect(page.getByRole('button', { name: 'Explore your care', exact: true })).toBeVisible();
  });
});
