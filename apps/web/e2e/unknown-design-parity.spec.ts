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

test.describe('Unknown.png Design Parity — Screen 2, 3 & 5', () => {
  test('Screen 2: Upload / Import Records multi-tab hub & queue', async ({ page }) => {
    await login(page);

    // Open DEMO-001 Sources page
    await page.getByRole('link', { name: /DEMO-001/ }).first().click();
    await page.getByTestId('tab-sources').click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources/);

    const uploadCard = page.getByTestId('upload-import-card');
    await expect(uploadCard).toBeVisible();

    // 1. Verify header badge and title
    await expect(uploadCard.getByText('Upload / Import Records')).toBeVisible();
    await expect(uploadCard.getByText(/Multiple file types and import options/i)).toBeVisible();

    // 2. Verify 3 intake tabs
    await expect(uploadCard.getByRole('button', { name: 'Upload Files' })).toBeVisible();
    await expect(uploadCard.getByRole('button', { name: 'Import from EHR / ABDM' })).toBeVisible();
    await expect(uploadCard.getByRole('button', { name: 'Link to Existing' })).toBeVisible();

    // 3. Verify dropzone and format pills
    await expect(uploadCard.getByText('Drag and drop files here')).toBeVisible();
    await expect(uploadCard.getByText(/Supports PDF, images, DICOM, audio, FHIR, VCF/i)).toBeVisible();
    await expect(uploadCard.getByText('PDF', { exact: true })).toBeVisible();
    await expect(uploadCard.getByText('Images', { exact: true })).toBeVisible();
    await expect(uploadCard.getByText('DICOM', { exact: true })).toBeVisible();
    await expect(uploadCard.getByText('Audio', { exact: true })).toBeVisible();
    await expect(uploadCard.getByText('FHIR', { exact: true })).toBeVisible();

    // 4. Verify fake intake queue is removed
    await expect(uploadCard.getByText('Intake Queue & Recent Records')).not.toBeVisible();
    await expect(uploadCard.getByText('Discharge_Summary.pdf')).not.toBeVisible();

    // 5. Test Secondary Tabs
    await uploadCard.getByRole('button', { name: 'Import from EHR / ABDM' }).click();
    await expect(uploadCard.getByText(/ABDM Health Information Exchange/i)).toBeVisible();

    await uploadCard.getByRole('button', { name: 'Link to Existing' }).click();
    await expect(uploadCard.getByText(/Link Duplicate or Unattached Scans/i)).toBeVisible();

    // Switch back to Upload Files
    await uploadCard.getByRole('button', { name: 'Upload Files' }).click();

    // Capture screenshot of Screen 2
    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-screen2-upload-import.png',
      fullPage: true,
    });
  });

  test('Screen 3: Processing Pipeline Status card, 6-step checklist, active execution & 5s auto-close', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: /DEMO-001/ }).first().click();
    await page.getByTestId('tab-sources').click();

    const processingCard = page.getByTestId('processing-status-card');

    // 1. Initially processing card is not visible
    await expect(processingCard).not.toBeVisible();

    // 2. Attach a real document and press "Upload and ingest" to trigger the processing pipeline states
    const fixturePdf = path.resolve(
      __dirname,
      '../../../packages/adapters/src/__tests__/fixtures/02_CBC_with_Differential_02_Jun_2026_DEMO.pdf',
    );
    await page.locator('input[name="file"]').setInputFiles(fixturePdf);

    const uploadBtn = page.getByRole('button', { name: 'Upload and ingest', exact: true });
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    // 3. Processing card becomes visible immediately
    await expect(processingCard).toBeVisible();

    // 4. Header and active file
    await expect(processingCard.getByText('Processing Status')).toBeVisible();
    await expect(processingCard.getByText(/See real-time pipeline progress/i)).toBeVisible();

    // 5. 6-stage pipeline checklist
    await expect(processingCard.getByText('File validation & security scan')).toBeVisible();
    await expect(processingCard.getByText('Format normalization')).toBeVisible();
    await expect(processingCard.getByText('Document classification')).toBeVisible();
    await expect(processingCard.getByText('OCR & table extraction')).toBeVisible();
    await expect(processingCard.getByText('Structured data extraction')).toBeVisible();
    await expect(processingCard.getByText('Save to evidence ledger')).toBeVisible();

    // 6. Detected Content panel
    await expect(processingCard.getByText('Detected Content')).toBeVisible();
    await expect(processingCard.getByText('Pages:')).toBeVisible();
    await expect(processingCard.getByText('Language:')).toBeVisible();
    await expect(processingCard.getByText('Tables:')).toBeVisible();
    await expect(processingCard.getByText('Text Blocks:')).toBeVisible();

    // 7. Models Used panel
    await expect(processingCard.getByText('Models Used')).toBeVisible();
    await expect(processingCard.getByText('Sarvam Vision (OCR)')).toBeVisible();
    await expect(processingCard.getByText('Custom Table Parser')).toBeVisible();
    await expect(processingCard.getByText('Document Classifier')).toBeVisible();
    await expect(processingCard.getByText('Active').first()).toBeVisible();

    // Capture screenshot of Screen 3 during execution
    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-screen3-processing-status.png',
      fullPage: true,
    });

    // 8. Wait for all 6 steps to complete and the completion banner to appear
    await expect(processingCard.getByText(/All 6 pipeline stages completed successfully/i)).toBeVisible({
      timeout: 10_000,
    });

    // 9. Within 5 seconds + smooth animation duration, verify it smoothly closes
    await expect(processingCard).not.toBeVisible({ timeout: 8_000 });
  });

  test('Screen 5: Multi-Source Longitudinal Timeline with modality nodes & source links', async ({ page }) => {
    await login(page);

    await page.getByRole('link', { name: /DEMO-001/ }).first().click();
    await expect(page).toHaveURL(/\/patients\/.+\/evidence/);

    const timelineView = page.getByTestId('timeline-node-view');
    await expect(timelineView).toBeVisible();

    // 1. Header and navigation bar matching Screen 5
    await expect(timelineView.getByText('Patient Timeline (Multi-Source View)')).toBeVisible();
    await expect(timelineView.getByText(/Unified longitudinal view of all records/i)).toBeVisible();
    await expect(timelineView.getByText('Timeline').first()).toBeVisible();
    await expect(timelineView.getByText(/Documents \(/i)).toBeVisible();
    await expect(timelineView.getByText(/Pending Tasks \(/i)).toBeVisible();

    // 2. Modality category nodes
    const rows = timelineView.getByTestId('evidence-row');
    await expect(rows.first()).toBeVisible();

    // 3. View Source buttons
    const viewSourceLinks = timelineView.getByRole('link', { name: /view source/i });
    await expect(viewSourceLinks.first()).toBeVisible();

    // 4. Test View Source navigation
    await viewSourceLinks.first().click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources\/.+/);

    // Return to Evidence
    await page.getByTestId('tab-evidence').click();

    // 5. Test dual-mode toggle to Ledger Details
    await page.getByRole('link', { name: /Ledger Details/i }).click();
    await expect(page.getByRole('table', { name: /evidence/i }).or(page.getByTestId('evidence-row').first())).toBeVisible();

    // Switch back to Timeline View
    await page.getByRole('link', { name: /Timeline View/i }).click();
    await expect(page.getByTestId('timeline-node-view')).toBeVisible();

    // 6. Verify human approval action works smoothly in Timeline View without uuid error
    const verifyBtn = page.getByTestId('timeline-node-view').getByTestId('verify-evidence').first();
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // Confirm no runtime error occurs and the row updates
    await expect(page.getByText(/invalid input syntax for type uuid/i)).not.toBeVisible();
    await expect(page.getByTestId('timeline-node-view').getByText('Verified').first()).toBeVisible();

    // Capture screenshot of Screen 5
    await page.screenshot({
      path: '/Users/dhaanish/.gemini/antigravity-cli/brain/5e508f7e-8bf8-43fc-aad7-5963d6af656c/screenshots/screenshot-screen5-longitudinal-timeline.png',
      fullPage: true,
    });
  });
});
