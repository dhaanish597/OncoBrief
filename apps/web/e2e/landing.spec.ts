import { expect, test } from '@playwright/test';

/**
 * The public landing page at `/`, and the routing contract it depends on.
 *
 * This is the one surface that must render with **no session at all**, so every
 * test here starts from an anonymous context — the opposite precondition to
 * `demo-flow.spec.ts`. Tests 1–6 need no database; test 7 signs in and therefore
 * requires Postgres up, migrations applied and `pnpm demo:reset` run.
 *
 * See docs/decisions/0016-landing-page-integration.md
 */

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

test.describe('OncoBrief — public landing page', () => {
  test('1 renders at / without a session', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/OncoBrief/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The consult');
    await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible();

    // The landing's visual scope is confined to its `.landing` wrapper, so no
    // workspace element inherits the landing's fonts or element resets.
    await expect(page.locator('.landing')).toHaveCount(1);
  });

  test('2 states the non-clinical boundary', async ({ page }) => {
    await page.goto('/');

    // Hero strip: the boundary stated before any feature claim.
    await expect(page.getByText('Assistive · Not diagnostic').first()).toBeVisible();

    // The safety principles, in the product's own words.
    await expect(
      page.getByText(/does not diagnose, stage, recommend or decide treatment/i).first(),
    ).toBeVisible();

    // Footer: assistive software, and the illustrative data is labelled.
    await expect(
      page.getByText(/Not a medical device for diagnosis or treatment decisions/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/Sample data shown is fictional/i).first()).toBeVisible();
  });

  test('3 the primary call to action reaches the workspace gate', async ({ page }) => {
    await page.goto('/');

    const cta = page.getByRole('link', { name: /open workspace/i });
    await expect(cta).toHaveAttribute('href', '/workspace');

    // Anonymous: /workspace's own session guard forwards the visitor to /login,
    // so `/` stays statically prerenderable and needs no session check.
    await cta.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('4 /workspace still requires a session', async ({ page }) => {
    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('5 no workspace chrome leaks onto /', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /what this is/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Workspace$/ })).toHaveCount(0);
  });
});

test.describe('OncoBrief — landing and workspace round trip', () => {
  test('6 login offers the way back to the overview', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: /back to overview/i }).click();
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The consult');
  });

  test('7 a signed-in visitor reaches the workspace from the landing', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(CLINICIAN.email);
    await page.getByLabel('Password').fill(CLINICIAN.password);
    await page.getByRole('button', { name: 'Open the workspace' }).click();
    await expect(page).toHaveURL(/\/workspace/);

    // The landing is public regardless of session; the call to action now
    // resolves straight through instead of bouncing via /login.
    await page.goto('/');
    await expect(page.locator('.landing')).toHaveCount(1);
    await page.getByRole('link', { name: /open workspace/i }).click();
    await expect(page).toHaveURL(/\/workspace/);
  });
});

/**
 * The integration's whole risk is silent restyling: the landing and the
 * workspace share one Tailwind build, and a global utility class collides
 * document-wide regardless of route. This pins the token reconciliation, so
 * changing a shared token by accident fails here rather than on judging day.
 *
 * Both surfaces are reachable anonymously, so this needs no fixtures.
 */
test.describe('OncoBrief — the two visual languages stay separate', () => {
  test('8 the landing is scoped and the workspace tokens are untouched', async ({ page }) => {
    await page.goto('/');
    const landing = await page.evaluate(() => {
      const wrapper = document.querySelector('.landing')!;
      return {
        bg: getComputedStyle(wrapper).backgroundColor,
        headline: getComputedStyle(document.querySelector('h1')!).fontFamily,
        mono: getComputedStyle(document.querySelector('.landing .font-mono')!).fontFamily,
      };
    });

    await page.goto('/login');
    const workspace = await page.evaluate(() => ({
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      mono: getComputedStyle(document.querySelector('.mono')!).fontFamily,
      landingWrappers: document.querySelectorAll('.landing').length,
    }));

    // The landing keeps its own language…
    expect(landing.bg).toBe('rgb(243, 238, 228)'); // ivory
    expect(landing.headline).toContain('Instrument Serif');
    expect(landing.mono).toContain('Geist Mono');

    // …which does not reach the workspace. `--font-mono` is the dangerous one:
    // `.mono` reads it directly and appears on nearly every workspace screen.
    expect(workspace.landingWrappers).toBe(0);
    expect(workspace.bodyBg).toBe('rgb(247, 244, 238)'); // workspace paper, not ivory
    expect(workspace.bodyColor).toBe('rgb(27, 26, 23)'); // workspace ink
    expect(workspace.mono).toContain('ui-monospace');
    expect(workspace.mono).not.toContain('Geist Mono');
  });
});
