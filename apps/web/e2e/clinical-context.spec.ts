import { expect, test, type Page } from '@playwright/test';

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

async function openClinicalContext(page: Page): Promise<void> {
  await page.getByRole('link', { name: /DEMO-001/ }).first().click();
  await page.getByRole('link', { name: 'Clinical context', exact: true }).click();
  await expect(page).toHaveURL(/\/patients\/[^/]+\/clinical-context/);
}

test.describe('OncoBrief — Clinical Context & Oncology Charts', () => {
  test('verifies baseline deduplication and Times New Roman hierarchy', async ({ page }) => {
    await login(page);

    // Navigate to DEMO-001 Clinical Context
    await openClinicalContext(page);

    // 1. Scoped Times New Roman container
    const scopeContainer = page.locator('.clinical-context-scope');
    await expect(scopeContainer).toBeVisible();

    // 2. Main Page Heading
    const heading = page.locator('h1.cc-main-heading');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/Clinical Context/i);

    // 3. Top Patient Overview & Documented Baseline card is PRESERVED
    const overviewCard = page.getByRole('heading', { name: /Patient Overview & Documented Baseline/i });
    await expect(overviewCard).toBeVisible();

    // 4. Duplicate Patient Baseline accordion is REMOVED from Documented Clinical Categories
    const duplicateAccordion = page.getByRole('button', { name: /^Patient baseline$/i });
    await expect(duplicateAccordion).toHaveCount(0);

    // 5. The other 4 clinical category cards are PRESERVED
    await expect(page.getByRole('button', { name: /Pathology and biomarkers/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Latest documented treatment/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Recent laboratory results/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Quick Insights/i })).toBeVisible();

    // 6. Duplicate Baseline / Vitals filter chip is REMOVED from Universal Value Explorer
    const duplicateFilterChip = page.getByRole('button', { name: /^Baseline \/ Vitals$/i });
    await expect(duplicateFilterChip).toHaveCount(0);

    // 7. Retained category filter chips in Explorer
    await expect(page.getByRole('button', { name: /^All Tests$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Haematology$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Biochemistry$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Tumour Markers$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pathology \/ IHC$/i })).toBeVisible();
  });

  test('verifies interactive oncology chart tooltip and click-to-source navigation', async ({ page }) => {
    await login(page);
    await openClinicalContext(page);

    // Locate the trend chart SVG
    const svgChart = page.locator('svg[aria-label*="Chronological trend chart"]').first();
    await expect(svgChart).toBeVisible();

    // Locate the first data point
    const point = svgChart.locator('g[role="button"]').first();
    await expect(point).toBeVisible();

    // Hover over point to trigger mandatory interactive tooltip
    await point.hover();

    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible();

    // Assert key evidence provenance fields are present in tooltip
    await expect(tooltip).toContainText(/\.pdf/i); // Source filename
    await expect(tooltip.locator('[data-testid^="state-"]')).toBeVisible(); // StateBadge

    // Click point to open traceable source card
    await point.click();
    const traceCard = page.getByRole('heading', { name: 'Observation Traceability' });
    await expect(traceCard).toBeVisible();

    // Click source report link
    const sourceReportLink = page.getByRole('link', { name: /Open Original Report/i }).first();
    await expect(sourceReportLink).toBeVisible();
    await sourceReportLink.click();
    await expect(page).toHaveURL(/\/sources\/[^?]+\?fact=.+&page=\d+/);
    await expect(page.locator('[data-highlight="true"]').first()).toBeVisible();
  });

  test('verifies multi-marker comparison mode and treatment timeline', async ({ page }) => {
    await login(page);
    await openClinicalContext(page);

    // Switch to Multi-Marker Comparison Mode
    const compareBtn = page.getByRole('button', { name: /Multi-Marker Comparison/i });
    await expect(compareBtn).toBeVisible();
    await compareBtn.click();

    // Assert multi-marker container is visible
    await expect(page.getByText(/Multi-Marker Longitudinal Comparison/i)).toBeVisible();

    // Assert Treatment Timeline is visible
    await expect(page.getByText(/Chronological Treatment Milestones/i)).toBeVisible();
  });
});

test('clinical context supports keyboard selection and responsive layouts without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  await login(page);
  await openClinicalContext(page);
  const point = page.locator('svg[aria-label*="Chronological trend chart"] g[role="button"]').first();
  await point.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await point.press('Enter');
  await expect(point).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Observation Traceability' })).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.clinical-context-scope')).toBeVisible();
    await page.screenshot({ path: `/tmp/oncobrief-merge-review/clinical-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('touch users can select a chart point and inspect its source', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 900 } });
  const page = await context.newPage();
  await login(page);
  await openClinicalContext(page);
  const point = page.locator('svg[aria-label*="Chronological trend chart"] g[role="button"]').first();
  await point.tap();
  await expect(page.getByRole('heading', { name: 'Observation Traceability' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Original Report/ }).last()).toBeVisible();
  await context.close();
});
