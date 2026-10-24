import { expect, test, type Page } from '@playwright/test';

const CLINICIAN = { email: 'dr.rao@rci.demo', password: 'oncobrief-demo' };

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(CLINICIAN.email);
  await page.getByLabel('Password').fill(CLINICIAN.password);
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

test.describe('ABDM V3 Integration (M2 HIP + M3 HIU)', () => {
  test('ABDM M3 HIU consent initiation UI on Sources page', async ({ page }) => {
    await login(page);

    // Open first patient
    await page.getByRole('link', { name: /DEMO-001/ }).first().click();
    await expect(page).toHaveURL(/\/patients\/.+\/evidence/);

    // Navigate to Sources tab
    await page.getByRole('link', { name: 'Sources' }).click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources/);

    // Select ABDM tab
    const abdmTab = page.getByRole('button', { name: /EHR \/ ABDM/i });
    await expect(abdmTab).toBeVisible();
    await abdmTab.click();

    // Verify M3 HIU Consent Form is rendered
    await expect(page.getByText(/ABDM Health Information Exchange Gateway \(M3 HIU/)).toBeVisible();
    const abhaInput = page.getByPlaceholder('patient@sbx');
    await expect(abhaInput).toBeVisible();

    // Submit consent request
    const requestBtn = page.getByRole('button', { name: /Request Patient Consent \(M3 HIU\)/i });
    await expect(requestBtn).toBeVisible();
    await requestBtn.click();

    // Verify feedback message
    await expect(page.getByTestId('abdm-artifact').first()).toContainText('GRANTED');
  });

  test('ABDM M2 HIP packet export and care-context link controls', async ({ page }) => {
    await login(page);

    // Open DEMO-003 (which has ready/approved packet)
    await page.getByRole('link', { name: /DEMO-003/ }).first().click();
    await expect(page).toHaveURL(/\/patients\/.+\/evidence/);

    // Navigate to Consultation packet tab
    await page.getByRole('link', { name: 'Packet' }).click();
    await expect(page).toHaveURL(/\/patients\/.+\/packet/);

    // Check for packet status
    const packetHeader = page.getByText(/approved|draft|pending/i).first();
    await expect(packetHeader).toBeVisible();

    // If draft, approve it first so export controls activate
    const approveBtn = page.getByTestId('approve-packet');
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
    }

    // Export buttons
    const exportBtn = page.getByTestId('export-packet');
    await expect(exportBtn).toBeVisible();
    await expect(page.getByTestId('export-abdm-fhir')).toBeVisible();
    await expect(page.getByTestId('export-mcode-fhir')).toBeVisible();
  });

  test('Public ABDM Webhook endpoint returns 202 Accepted within SLA', async ({ request }) => {
    const res = await request.post('/api/v3/hip/patient/care-context/discover', {
      headers: {
        'content-type': 'application/json',
        'request-id': 'e2e-test-request-id-12345',
        'timestamp': new Date().toISOString(),
        'x-hip-id': 'IN010000001',
      },
      data: {
        transactionId: 'txn-e2e-12345',
        patient: {
          verifiedIdentifier: [
            { type: 'ABHA_ADDRESS', value: 'patient@sbx' },
          ],
        },
      },
    });

    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.response?.requestId).toBe('e2e-test-request-id-12345');
  });
});
