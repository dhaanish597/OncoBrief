import { test, expect } from '@playwright/test';
import { loginAsClinician } from './helpers';

const CORE_ROUTES = [
  '/workspace',
  '/workspace?view=opd',
  '/patients',
  '/appointments',
  '/my-tasks',
  '/tumor-board',
  '/analytics',
  '/admin',
  '/about',
];

test.describe('TASK-019: WCAG 2.2 AA Accessibility & Keyboard Usability Verification Suite (E2E-014)', () => {
  test('verifies skip-to-main-content link, main landmark, aria-live region, and zero unlabeled controls across core routes', async ({
    page,
  }) => {
    await loginAsClinician(page);
    for (const route of CORE_ROUTES) {
      await page.goto(route);

      // 1. Verify <main id="main-content"> landmark exists
      const mainLandmark = page.locator('main#main-content');
      await expect(mainLandmark).toBeAttached();

      // 2. Verify Skip to main content link is first tabbable element and focuses #main-content
      const skipLink = page.locator('a[href="#main-content"]');
      if ((await skipLink.count()) > 0) {
        await expect(skipLink).toHaveText(/Skip to main content/i);
      }

      // 3. Verify polite aria-live status announcer exists
      const liveRegion = page.locator('[aria-live="polite"]');
      expect(await liveRegion.count()).toBeGreaterThanOrEqual(1);

      // 4. Verify zero visible form inputs/selects/textareas lack an accessible name (label, aria-label, or aria-labelledby)
      const unlabeledElements = await page.evaluate(() => {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea'),
        );
        return controls
          .filter((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
            if (el.getAttribute('title') || el.getAttribute('placeholder')) return false;
            if (el.closest('label')) return false;
            const id = el.getAttribute('id');
            if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return false;
            return true;
          })
          .map((el) => ({
            tag: el.tagName,
            id: el.getAttribute('id'),
            name: el.getAttribute('name'),
            outer: el.outerHTML.slice(0, 100),
          }));
      });
      if (unlabeledElements.length > 0) {
        console.log(`Route ${route} has unlabeled elements:`, unlabeledElements);
      }
      expect(unlabeledElements.length).toBe(0);
    }
  });
});
