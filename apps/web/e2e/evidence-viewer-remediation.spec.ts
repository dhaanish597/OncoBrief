import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

test.describe('Evidence Viewer & Website Remediation', () => {
  test('P0: Upload 02_CBC_with_Differential_02_Jun_2026_DEMO.pdf and verify genuine text rendering without cross-association', async ({
    page,
  }) => {
    await login(page);

    // Navigate to DEMO-001 Sources page
    await page.getByRole('link', { name: /DEMO-001/ }).first().click();
    await page.getByTestId('tab-sources').click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources/);

    // Locate the test PDF
    const fixturePdf = path.resolve(
      __dirname,
      '../../../packages/adapters/src/__tests__/fixtures/02_CBC_with_Differential_02_Jun_2026_DEMO.pdf',
    );

    // Select file in DocumentUploadForm
    const fileInput = page.locator('input[name="file"]');
    await fileInput.setInputFiles(fixturePdf);

    // Submit upload form
    const submitBtn = page.getByRole('button', { name: 'Upload and ingest', exact: true });
    await submitBtn.click();

    // Verify upload completes and document appears in list
    const docLink = page.getByRole('link', { name: /02_CBC_with_Differential_02_Jun_2026_DEMO\.pdf/i }).first();
    await expect(docLink).toBeVisible({ timeout: 15_000 });

    // Open Source Inspector for this document
    await docLink.click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources\/.+/);

    // 1. Authoritative metadata checks
    await expect(page.getByRole('heading', { name: '02_CBC_with_Differential_02_Jun_2026_DEMO.pdf' })).toBeVisible();
    await expect(page.getByText(/5b8c3be7f550ba59/i)).toBeVisible();
    await expect(page.locator('dd', { hasText: 'ready' })).toBeVisible();

    // 2. Genuine extracted text inspection (Scan + BBox mode)
    const sourcePane = page.locator('[data-testid="source-pane"]');
    await expect(sourcePane.getByText('Sunita Sharma').first()).toBeVisible();
    await expect(sourcePane.getByText(/Central Diagnostic Laboratory/i).first()).toBeVisible();
    await expect(sourcePane.getByText(/02 June 2026/i).first()).toBeVisible();
    await expect(sourcePane.getByText(/Hemoglobin \(Hb\)\s+11\.4\s+g\/dL/i).first()).toBeVisible();
    await expect(sourcePane.getByText(/Total Leukocyte Count \(WLC\)\s+7,200\s+\/uL/i).first()).toBeVisible();
    await expect(sourcePane.getByText(/Platelet Count\s+240,000\s+\/uL/i).first()).toBeVisible();

    // 3. Negative check: Verify NO cross-associated patient content (e.g. Ramesh Kumar or other fixture text)
    await expect(page.getByText('Ramesh Kumar')).not.toBeVisible();

    // 4. Test View Mode toggles: Structured OCR
    const ocrBtn = page.getByRole('button', { name: /Structured OCR/i });
    await ocrBtn.click();
    await expect(sourcePane.getByText(/Hemoglobin \(Hb\)\s+11\.4\s+g\/dL/i).first()).toBeVisible();

    // 5. Test View Mode toggles: Original PDF
    const pdfBtn = page.getByRole('button', { name: /Original PDF/i });
    if (await pdfBtn.isVisible()) {
      await pdfBtn.click();
      await expect(page.locator('object[type="application/pdf"]')).toBeVisible();
    }

    // Switch back to overlay and capture screenshot
    await page.getByRole('button', { name: /Scan \+ BBox/i }).click();
    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-01-cbc-source-inspector.png',
      fullPage: true,
    });
  });

  test('P1: Appointment Letter Span Alignment — "Regional Cancer Institute" wraps span 0 without shifting over Date/MRN', async ({
    page,
  }) => {
    await login(page);

    // Navigate to DEMO-001 Sources page
    await page.getByRole('link', { name: /DEMO-001/ }).first().click();
    await page.getByTestId('tab-sources').click();

    // Open appointment-letter.pdf
    const apptLink = page.getByRole('link', { name: /appointment-letter\.pdf/i }).first();
    await expect(apptLink).toBeVisible();
    await apptLink.click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources\/.+/);

    // Wait for the SVG overlay in the source pane
    const svgOverlay = page.locator('[data-testid="source-pane"] svg');
    await expect(svgOverlay).toBeVisible();

    // Check active highlight box: by default it selects the first fact (Regional Cancer Institute)
    const activeBox = page.getByTestId('active-highlight-box');
    await expect(activeBox).toBeVisible();

    // Verify bounding box geometry strictly wraps line 0:
    // span 0 has y = 0.04 (scaled to 40 in 1000-unit coordinate space)
    // Date is at y = 0.15 (150), MRN is at y = 0.205 (205)
    const yVal = await activeBox.getAttribute('y');
    const xVal = await activeBox.getAttribute('x');
    expect(Number(yVal)).toBe(40);
    expect(Number(xVal)).toBe(50);

    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-02-appointment-letter-alignment.png',
      fullPage: true,
    });

    // Now go to Evidence tab, find the Date fact from appointment-letter.pdf, and click into Source Inspector
    await page.getByTestId('tab-evidence').click();
    await expect(page).toHaveURL(/\/patients\/.+\/evidence/);

    // Locate the appointment letter date link
    const dateRow = page.locator('[data-testid="evidence-row"]', { hasText: 'appointment-letter.pdf' })
      .filter({ hasText: '2025-07-30' })
      .first();
    await expect(dateRow).toBeVisible();
    await dateRow.getByRole('link', { name: /view/i }).click();

    // Verify in Source Inspector that the highlight moved from span 0 (y=40) to span 2 (y=150)
    await expect(page).toHaveURL(/\/patients\/.+\/sources\/.+/);
    const activeBoxDate = page.getByTestId('active-highlight-box');
    await expect(activeBoxDate).toBeVisible();
    const yValDate = await activeBoxDate.getAttribute('y');
    expect(Number(yValDate)).toBe(150); // Exact match for Date span at 0.15
  });

  test('P1: Mobile responsiveness & no horizontal overflow at 375px width', async ({ page }) => {
    // Set 375px mobile viewport (iPhone SE / standard mobile benchmark)
    await page.setViewportSize({ width: 375, height: 812 });

    await login(page);

    // Open DEMO-001 evidence tab
    await page.getByRole('link', { name: /DEMO-001/ }).first().click();

    // Check no horizontal scroll on body/page
    const isHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isHorizontalOverflow).toBe(false);

    // Open Sources tab and check Source Inspector
    await page.getByTestId('tab-sources').click();
    const apptLink = page.getByRole('link', { name: /appointment-letter\.pdf/i }).first();
    await apptLink.click();

    // Verify source pane is visible and responsive without horizontal overflow
    await expect(page.getByTestId('source-pane')).toBeVisible();

    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-03-mobile-375px-scan-bbox.png',
      fullPage: true,
    });

    const paneOverflow = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="source-pane"]');
      if (!pane) return false;
      return pane.scrollWidth > window.innerWidth;
    });
    expect(paneOverflow).toBe(false);

    // Switch to Structured OCR view and ensure text wraps cleanly
    await page.getByRole('button', { name: /Structured OCR/i }).click();
    await expect(page.getByTestId('source-pane').getByText('Regional Cancer Institute').first()).toBeVisible();

    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-04-mobile-375px-structured-ocr.png',
      fullPage: true,
    });

    const ocrOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(ocrOverflow).toBe(false);
  });

  test('P1: Complete Patient Workflow — Timeline, Reconciliation, and Gaps', async ({ page }) => {
    await login(page);

    // Open DEMO-001
    await page.getByRole('link', { name: /DEMO-001/ }).first().click();

    // 1. Evidence Journey (Timeline)
    await expect(page.getByTestId('tab-evidence')).toBeVisible();
    await expect(page.getByRole('heading', { name: /DEMO-001/ })).toBeVisible();
    await expect(page.getByTestId('readiness-band').first()).toBeVisible();

    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-05-longitudinal-timeline.png',
      fullPage: true,
    });

    // 2. Reconciliation Tab (Side-by-side conflict comparison)
    await page.getByTestId('tab-conflicts').click();
    await expect(page).toHaveURL(/\/patients\/.+\/conflicts/);
    await expect(page.getByRole('heading', { name: /Reconciliation queue/i })).toBeVisible();
    await expect(page.getByText(/sources disagree/i).first()).toBeVisible();

    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-06-reconciliation-conflicts.png',
      fullPage: true,
    });

    // 3. Record Map (Operational gaps)
    await page.getByTestId('tab-record-map').click();
    await expect(page).toHaveURL(/\/patients\/.+\/record-map/);
    await expect(page.getByRole('heading', { name: /Record map/i })).toBeVisible();

    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-07-record-map-readiness.png',
      fullPage: true,
    });
  });
});
