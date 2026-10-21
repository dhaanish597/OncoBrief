import { expect, test, type Page } from '@playwright/test';

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };
const COORDINATOR = { email: 'coord.anita@rci.demo', password: 'oncobrief-demo' };

async function loginAs(page: Page, email: string, password = CLINICIAN.password): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

async function login(page: Page): Promise<void> {
  await loginAs(page, CLINICIAN.email, CLINICIAN.password);
}

test.describe('Phase 4 — Responsive Layout & Viewports', () => {
  const VIEWPORTS = [
    { name: 'mobile (375px)', width: 375, height: 667 },
    { name: 'tablet portrait (768px)', width: 768, height: 1024 },
    { name: 'tablet landscape / small desktop (1024px)', width: 1024, height: 768 },
    { name: 'desktop (1440px)', width: 1440, height: 900 },
  ];

  for (const vp of VIEWPORTS) {
    test(`workspace layout conforms without horizontal document overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);

      // Verify header and workspace load
      await expect(page.getByRole('heading', { name: /consultation workspace/i })).toBeVisible();

      // Ensure document body does not have horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      if (vp.width === 375) {
        await page.screenshot({ path: 'audit/screenshots/workspace-mobile-375px.png', fullPage: true });
      } else if (vp.width === 1440) {
        await page.screenshot({ path: 'audit/screenshots/workspace-desktop-1440px.png', fullPage: true });
      }
    });
  }
});

test.describe('Phase 4 — Reconciliation Room UX & Permissions', () => {
  test('conflicting members provide direct links to Source Inspector and clear outcomes', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /DEMO-002/i }).first().click();
    await page.getByTestId('tab-conflicts').click();

    await page.getByRole('link', { name: /open reconciliation room/i }).first().click();
    await expect(page.getByText(/Reconciliation room/i)).toBeVisible();

    // Check member cards and inspection links
    const members = page.getByTestId('conflict-member');
    await expect(members).toHaveCount(2);

    const inspectLinks = page.getByRole('link', { name: /inspect in source inspector/i });
    await expect(inspectLinks).toHaveCount(2);
    await expect(inspectLinks.first()).toHaveAttribute('href', /sources\/[0-9a-f-]+\?fact=/i);

    // Check all three outcome cards
    await expect(page.getByText(/Retain both as conflicting/i)).toBeVisible();
    await expect(page.getByText(/Mark one as superseded/i)).toBeVisible();
    await expect(page.getByText(/Correct the structured event/i)).toBeVisible();

    // Outcomes have reasons and testids
    await expect(page.getByTestId('resolve-retain-both')).toBeVisible();
    await expect(page.getByTestId('resolve-mark-superseded')).toBeVisible();
    await expect(page.getByTestId('resolve-corrected')).toBeVisible();

    // Capture screenshots
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'audit/screenshots/reconciliation-room-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.screenshot({ path: 'audit/screenshots/reconciliation-room-mobile.png', fullPage: true });
  });

  test('coordinator sees read-only banner explaining disabled resolution actions', async ({ page }) => {
    await loginAs(page, COORDINATOR.email, COORDINATOR.password);
    await page.getByRole('link', { name: /DEMO-002/i }).first().click();
    await page.getByTestId('tab-conflicts').click();

    await page.getByRole('link', { name: /open reconciliation room/i }).first().click();
    await expect(page.getByText(/Reconciliation room/i)).toBeVisible();

    // Expect read-only notice banner
    await expect(page.getByText(/Read-only review mode \(coordinator\)/i)).toBeVisible();
    await expect(page.getByText(/conflict:resolve/i)).toBeVisible();

    // Action buttons must be disabled for coordinator
    await expect(page.getByTestId('resolve-retain-both')).toBeDisabled();
    await expect(page.getByTestId('resolve-mark-superseded')).toBeDisabled();
    await expect(page.getByTestId('resolve-corrected')).toBeDisabled();
  });
});

test.describe('Phase 4 — Evidence Journey & Filtering', () => {
  test('evidence filters and historical visual distinctions function cleanly', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /DEMO-001/i }).first().click();
    await expect(page.getByRole('heading', { name: /evidence journey/i })).toBeVisible();

    // Filter chips exist
    await expect(page.getByRole('link', { name: /All facts/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Unverified/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Conflicting/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Verified/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Historical/i })).toBeVisible();

    // Filter by unverified
    await page.getByRole('link', { name: /Unverified/i }).click();
    await expect(page).toHaveURL(/filter=unverified/);
    const unverifiedRows = page.getByTestId('evidence-row');
    const count = await unverifiedRows.count();
    expect(count).toBeGreaterThan(0);

    // Return to all facts
    await page.getByRole('link', { name: /All facts/i }).click();

    // Screenshots
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'audit/screenshots/evidence-journey-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.screenshot({ path: 'audit/screenshots/evidence-journey-mobile.png', fullPage: true });
  });
});

test.describe('Phase 4 — Accessibility & Keyboard Interactions', () => {
  test('skip-to-content link exists and targets #main-content', async ({ page }) => {
    await login(page);
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  test('assistant panel responds to Escape key and maintains accessible dialog attributes', async ({ page }) => {
    await login(page);
    const launcher = page.getByTestId('assistant-launcher');
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute('aria-haspopup', 'dialog');

    // Open assistant
    await launcher.click();
    const panel = page.getByTestId('assistant-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(panel).toHaveAttribute('aria-modal', 'true');

    // Capture assistant screenshot
    await page.screenshot({ path: 'audit/screenshots/assistant-panel.png' });

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    await expect(launcher).toBeVisible();
  });

  test('reduced motion CSS rule is present in stylesheet', async ({ page }) => {
    await login(page);
    const hasReducedMotionRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-motion')) {
              return true;
            }
          }
        } catch {
          /* cross-origin sheet */
        }
      }
      return false;
    });
    expect(hasReducedMotionRule).toBe(true);
  });
});
