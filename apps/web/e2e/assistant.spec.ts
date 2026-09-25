import { expect, test, type Page } from '@playwright/test';

/**
 * Ask OncoBrief UI flows that are deterministic and do not need the LLM:
 * navigation guidance, the unsupported-question refusal, suggested questions
 * and the responsive layout. The provider-backed evidence paths are covered by
 * the orchestrator unit tests.
 *
 * Preconditions: Postgres up, migrations applied, `pnpm demo:reset` run, and a
 * production build available (`pnpm build`).
 */

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function loginAndOpenPatient(page: Page, code = 'DEMO-001'): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
  await page.getByRole('link', { name: new RegExp(code) }).first().click();
  await expect(page).toHaveURL(/\/patients\/.+\/evidence/);
}

test.describe('Ask OncoBrief — launcher and guidance', () => {
  test('the floating launcher appears globally and opens the panel', async ({ page }) => {
    await loginAndOpenPatient(page);

    const launcher = page.getByTestId('assistant-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByTestId('assistant-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByText('Evidence-grounded assistant')).toBeVisible();
    await expect(page.getByTestId('assistant-input')).toBeVisible();
    await expect(page.getByTestId('assistant-mic')).toBeVisible();
  });

  test('shows suggested questions on an empty conversation', async ({ page }) => {
    await loginAndOpenPatient(page);
    await page.getByTestId('assistant-launcher').click();
    await expect(page.getByTestId('assistant-suggestion').first()).toBeVisible();
  });

  test('offers a navigation confirmation and routes on "Go there"', async ({ page }) => {
    await loginAndOpenPatient(page);
    await page.getByTestId('assistant-launcher').click();

    await page.getByTestId('assistant-input').fill('Take me to Sources');
    await page.getByTestId('assistant-send').click();

    const goThere = page.getByTestId('assistant-go');
    await expect(goThere).toBeVisible();
    await goThere.click();

    await expect(page).toHaveURL(/\/patients\/.+\/sources/);
  });

  test('cancel dismisses the navigation confirmation without routing', async ({ page }) => {
    await loginAndOpenPatient(page);
    const urlBefore = page.url();
    await page.getByTestId('assistant-launcher').click();

    await page.getByTestId('assistant-input').fill('Take me to Sources');
    await page.getByTestId('assistant-send').click();

    await page.getByTestId('assistant-cancel').click();
    await expect(page.getByTestId('assistant-go')).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);
  });

  test('refuses an unsupported medical question without medical advice', async ({ page }) => {
    await loginAndOpenPatient(page);
    await page.getByTestId('assistant-launcher').click();

    await page.getByTestId('assistant-input').fill('What treatment should this patient receive?');
    await page.getByTestId('assistant-send').click();

    await expect(page.getByTestId('assistant-message-assistant').last()).toContainText(
      /limited to information contained in the authorised OncoBrief record/i,
    );
  });

  test('closing the panel returns to the floating launcher', async ({ page }) => {
    await loginAndOpenPatient(page);
    await page.getByTestId('assistant-launcher').click();
    await expect(page.getByTestId('assistant-panel')).toBeVisible();
    await page.getByTestId('assistant-close').click();
    await expect(page.getByTestId('assistant-panel')).toHaveCount(0);
    await expect(page.getByTestId('assistant-launcher')).toBeVisible();
  });
});

test.describe('Ask OncoBrief — responsive', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('uses a near full-screen panel on a mobile viewport', async ({ page }) => {
    await loginAndOpenPatient(page);
    await page.getByTestId('assistant-launcher').click();

    const panel = page.getByTestId('assistant-panel');
    await expect(panel).toBeVisible();

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    // Near full width and at least ~90% of the viewport height.
    expect(box!.width).toBeGreaterThan(380);
    expect(box!.height).toBeGreaterThan(700);
  });
});
