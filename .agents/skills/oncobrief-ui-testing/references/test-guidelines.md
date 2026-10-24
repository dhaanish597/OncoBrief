# UI Testing & Assertion Reference Guide

This document provides Playwright and Vitest code snippets for testing OncoBrief clinical charts, tooltips, keyboard navigation, and deduplication assertions.

---

## 1. Playwright E2E Snippet: Chart Interaction & Tooltip

```typescript
import { test, expect } from '@playwright/test';

test.describe('ObservationChart Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate and navigate to clinical context page
    await page.goto('/login');
    await page.getByLabel('Email').fill('dr.rao@rci.demo');
    await page.getByLabel('Password').fill('oncobrief-demo');
    await page.getByRole('button', { name: 'Open the workspace' }).click();
    await page.goto('/patients/DEMO-001/clinical-context');
  });

  test('hover on chart point reveals complete provenance tooltip', async ({ page }) => {
    // Select an analyte in the Universal Value Explorer
    await page.getByRole('button', { name: /haemoglobin/i }).click();

    // Locate the first data point in the SVG chart
    const point = page.locator('svg circle[stroke]').first();
    await expect(point).toBeVisible();

    // Hover over the point
    await point.hover();

    // Assert tooltip contains all 8 required elements
    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/\d{4}-\d{2}-\d{2}/); // Date
    await expect(tooltip).toContainText(/g\/dL|mg\/dL|U\/L|\/uL/); // Unit
    await expect(tooltip).toContainText(/Ref Range|Max Ref|Min Ref/i); // Ref range
    await expect(tooltip).toContainText(/\.pdf/i); // Source filename
    await expect(tooltip).toContainText(/Page \d+|p\d+/i); // Page number
    await expect(tooltip.locator('[data-testid^="state-"]')).toBeVisible(); // StateBadge
  });

  test('clicking chart point opens traceable source report', async ({ page }) => {
    const point = page.locator('svg circle[stroke]').first();
    await point.click();

    // Assert provenance card is displayed
    const provCard = page.locator('text=Observation Traceability');
    await expect(provCard).toBeVisible();

    // Click link to source report
    const sourceLink = page.getByRole('link', { name: /Open Original Report/i });
    await expect(sourceLink).toBeVisible();
    await sourceLink.click();

    // Assert URL navigated to sources with fact ID
    await expect(page).toHaveURL(/\/patients\/DEMO-001\/sources\/.+\?fact=.+/);
  });
});
```

---

## 2. Playwright E2E Snippet: Duplicate Removal Assertion

```typescript
test('verifies top Patient Overview card is present and duplicates are removed', async ({ page }) => {
  await page.goto('/patients/DEMO-001/clinical-context');

  // 1. Top card MUST be visible
  await expect(page.getByRole('heading', { name: /Patient Overview & Documented Baseline/i })).toBeVisible();

  // 2. Duplicate Baseline/Vitals category filter MUST NOT exist in Explorer
  const vitalsChip = page.getByRole('button', { name: /^Baseline \/ Vitals$/i });
  await expect(vitalsChip).toHaveCount(0);

  // 3. Duplicate Patient Baseline accordion MUST NOT exist in Clinical Categories
  const baselineAccordion = page.getByRole('button', { name: /^Patient baseline$/i });
  await expect(baselineAccordion).toHaveCount(0);

  // 4. Other clinical category cards MUST still be present
  await expect(page.getByRole('button', { name: /Pathology and biomarkers/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Latest documented treatment/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Recent laboratory results/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick Insights/i })).toBeVisible();
});
```

---

## 3. Keyboard & Accessibility Assertion

```typescript
test('keyboard tab focus and enter activation on chart points', async ({ page }) => {
  await page.goto('/patients/DEMO-001/clinical-context');

  // Focus the chart point via Tab or element focus
  const point = page.locator('svg [role="graphics-symbol"], svg [role="button"]').first();
  await point.focus();

  // Assert focused state has visible indicator
  await expect(point).toBeFocused();

  // Assert ARIA label describes point data
  const ariaLabel = await point.getAttribute('aria-label');
  expect(ariaLabel).toBeTruthy();
  expect(ariaLabel).toMatch(/haemoglobin|result|date/i);

  // Press Enter to trigger selection
  await page.keyboard.press('Enter');
  await expect(page.locator('text=Observation Traceability')).toBeVisible();
});
```
