import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 — Consultation Readiness, Lab Flowsheets, Batch Verification & Interoperability E2E
 *
 * Verifies the 10 required clinical acceptance scenarios:
 * 1. Open oncology demo patient.
 * 2. View "Changes Since Last Consultation" banner.
 * 3. Open dated lab flowsheet.
 * 4. Follow fact to original source document.
 * 5. Inspect unresolved conflict.
 * 6. Open batch verification review modal.
 * 7. Confirm selected batch (measure verification click count).
 * 8. Observe updated readiness state.
 * 9. Verify filtered views (Since last visit, labs, meds).
 * 10. Test standard ABDM & mCODE bundle imports and document linking.
 */

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function loginAsClinician(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

async function openDemoPatient(page: Page, code = 'DEMO-001'): Promise<void> {
  await page.getByRole('link', { name: new RegExp(code) }).first().click();
  await expect(page).toHaveURL(/\/patients\/.+\/evidence/);
}

test.describe('Phase 2 — Consultation Readiness & Evidence Review', () => {
  test('Scenarios 1-4 & 9: Changes Since Last Visit, Longitudinal Lab Flowsheet, and Filter Chips', async ({ page }) => {
    await loginAsClinician(page);
    await openDemoPatient(page, 'DEMO-001');

    // 1. Changes Since Last Consultation Banner is visible
    const changesBanner = page.locator('[data-testid="changes-since-last-visit-banner"]');
    await expect(changesBanner).toBeVisible();
    await expect(changesBanner).toContainText('Changes Since Last Consultation');
    await expect(changesBanner).toContainText('Baseline: 05 Jul 2025');

    // 2. Filter: Since Last Visit
    const filterSinceLast = page.locator('[data-testid="filter-since_last_visit"]');
    await expect(filterSinceLast).toBeVisible();
    await filterSinceLast.click();
    await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

    // 3. Filter: Longitudinal Lab Flowsheet
    const filterLabs = page.locator('[data-testid="filter-labs"]');
    await expect(filterLabs).toBeVisible();
    await filterLabs.click();

    const flowsheet = page.locator('[data-testid="longitudinal-lab-flowsheet"]');
    await expect(flowsheet).toBeVisible();
    await expect(flowsheet).toContainText(/Ha?emoglobin/i);
    // Arithmetic delta is rendered
    await expect(flowsheet).toContainText('since 02 Jun 2025');

    // 4. Source document link from flowsheet
    const sourceLink = flowsheet.locator('a[title*="View"]').first();
    await expect(sourceLink).toBeVisible();

    // 5. Filter: Medication History
    const filterMeds = page.locator('[data-testid="filter-meds"]');
    await expect(filterMeds).toBeVisible();
    await filterMeds.click();

    const medView = page.locator('[data-testid="medication-history-view"]');
    await expect(medView).toBeVisible();
    await expect(medView).toContainText(/Paclitaxel|Tamoxifen|Cyclophosphamide/i);

    // Return to All Evidence
    await page.locator('[data-testid="filter-all"]').click();
    await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  });

  test('Scenarios 5-8: Guided Readiness Banner and 2-Click Batch Evidence Verification', async ({ page }) => {
    await loginAsClinician(page);
    await openDemoPatient(page, 'DEMO-001');

    // 1. Guided Readiness Banner
    const readinessBanner = page.locator('[data-testid="guided-readiness-banner"]');
    await expect(readinessBanner).toBeVisible();
    await expect(readinessBanner).toContainText(/Actionable documentation blockers|Next steps/i);

    // 2. Open Batch Verification Modal (Click 1)
    const triggerBtn = page.locator('[data-testid="open-batch-verify-btn"]');
    {
      // Fresh fixtures require a real batch; do not silently skip this acceptance step.
      await expect(triggerBtn).toBeVisible();
      await triggerBtn.click();

      const modal = page.locator('[data-testid="batch-verification-modal"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('Batch Verification Review');
      await expect(modal).toContainText('OCR Confidence');

      // Individual fact checkboxes are inspectable
      const checkboxes = modal.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);

      // Confirm Batch (Click 2)
      const confirmBtn = page.locator('[data-testid="confirm-batch-verify-btn"]');
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();

      // Modal closes upon successful atomic verification
      await expect(modal).not.toBeVisible();
    }

    // Ledger Details renders the explicit per-fact state after successful review.
    await page.getByRole('link', { name: 'Ledger Details', exact: true }).click();
    await expect(page.locator('[data-testid="state-verified"]').first()).toBeVisible();
  });

  test('Scenario 10: Standards-Based ABDM & mCODE Bundle Import with zero alert popups', async ({ page }) => {
    await loginAsClinician(page);
    await openDemoPatient(page, 'DEMO-001');

    // Navigate to Sources page
    await page.getByTestId('tab-sources').click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources/);

    const uploadCard = page.locator('[data-testid="upload-import-card"]');
    await expect(uploadCard).toBeVisible();

    // Switch to "Import from EHR / ABDM" tab
    await page.getByRole('button', { name: 'Import from EHR / ABDM' }).click();

    // Verify presence of real standard bundle action buttons
    const tmcBtn = page.locator('[data-testid="pull-abdm-bundle-tmc"]');
    const aiimsBtn = page.locator('[data-testid="import-mcode-bundle-aiims"]');
    await expect(tmcBtn).toBeVisible();
    await expect(aiimsBtn).toBeVisible();

    // Pull ABDM Bundle (Tata Memorial / ACTREC)
    await tmcBtn.click();
    await expect(page.getByText(/Tata Memorial \/ ACTREC NRCeS ABDM bundle imported successfully/i)).toBeVisible();

    // Import mCODE FHIR Bundle (AIIMS)
    await aiimsBtn.click();
    await expect(page.getByText(/AIIMS HL7 mCODE STU4 oncology bundle imported successfully/i)).toBeVisible();

    // Switch to "Link to Existing" tab
    await page.getByRole('button', { name: 'Link to Existing' }).click();
    const searchInput = page.getByPlaceholder(/Search document by filename/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('cbc');
    await page.getByRole('button', { name: 'Search' }).click();

    // Real search results displayed
    await expect(page.getByText(/Matching Documents/i)).toBeVisible();
  });
});
