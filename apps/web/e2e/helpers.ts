import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'oncobrief-demo';

export async function loginAs(
  page: Page,
  email: string,
  password = DEMO_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

export async function loginAsClinician(page: Page): Promise<void> {
  await loginAs(page, 'dr.rao@rci.demo');
}

export async function loginAsCoordinator(page: Page): Promise<void> {
  await loginAs(page, 'coord.anita@rci.demo');
}

export async function loginAsRecordsOfficer(page: Page): Promise<void> {
  await loginAs(page, 'records.deepak@rci.demo');
}

export async function loginAsOrgAdmin(page: Page): Promise<void> {
  await loginAs(page, 'admin.sys@rci.demo');
}

export async function loginAsReceptionist(page: Page): Promise<void> {
  await loginAs(page, 'reception.priya@rci.demo');
}

export async function openFirstPatient(page: Page): Promise<string> {
  await page.goto('/patients');
  const patientLink = page.locator('tbody a[href*="/patients/"]').first();
  await expect(patientLink).toBeVisible();
  const href = await patientLink.getAttribute('href');
  const match = href?.match(/\/patients\/([a-f0-9-]+)/);
  if (!match) throw new Error(`Could not find patient ID in href: ${href}`);
  const patientId = match[1]!;
  await page.goto(`/patients/${patientId}/overview`);
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}`));
  return patientId;
}
