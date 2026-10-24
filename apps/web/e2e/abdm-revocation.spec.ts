import { expect, test } from '@playwright/test';
import { getMigratorPool, closePools } from '@oncobrief/db';

test.afterAll(async () => { await closePools(); });

test('revocation after an encrypted import restricts access without deleting ledger history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email').fill('dr.rao@rci.demo');
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await page.getByRole('link', { name: /DEMO-001/ }).first().click();
  await page.getByRole('link', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: /EHR \/ ABDM/i }).click();
  await expect(page.getByTestId('abdm-simulation-explanation')).toContainText('no ABDM account');
  await page.getByRole('button', { name: /Request Patient Consent/ }).click();
  await expect(page.getByText('Consent request submitted. See the recorded consent status below before pulling records.', { exact: true })).toBeVisible();
  await page.reload();
  const artifact = page.getByTestId('abdm-artifact').first();
  await expect(artifact).toContainText('GRANTED');
  const consentId = await artifact.locator('input[name="consentId"]').first().inputValue();
  await Promise.all([page.waitForResponse(response => response.request().method() === 'POST' && response.url() === page.url()),
    artifact.getByRole('button', { name: 'pull records', exact: true }).click()]);
  await page.reload();
  await expect(page.getByTestId('abdm-transfer').first()).toContainText('TRANSFERRED');
  const db = getMigratorPool();
  const transferred = (await db.query(`SELECT tr.id, tr.ingested_document_ids FROM abdm_hi_transfer tr
    JOIN abdm_consent_artifact ca ON ca.id=tr.consent_artifact_id WHERE ca.abdm_consent_id=$1
    ORDER BY tr.created_at DESC LIMIT 1`, [consentId])).rows[0];
  const docId = transferred.ingested_document_ids[0];
  const factIds = (await db.query('SELECT id FROM evidence_fact WHERE document_id=$1', [docId])).rows.map(r => r.id);
  expect(factIds.length).toBeGreaterThan(0);
  await Promise.all([page.waitForResponse(response => response.request().method() === 'POST' && response.url() === page.url()),
    artifact.getByRole('button', { name: 'revoke access & remove raw source', exact: true }).click()]);
  await page.reload();
  await expect(artifact).toContainText('REVOKED');
  await expect(page.getByTestId('abdm-transfer').first()).toContainText('PURGED');
  const sourcesUrl = page.url();
  const response = await page.request.get(`${sourcesUrl}/${docId}`);
  expect(response.status()).toBe(404);
  expect((await page.request.get(`/api/v1/evidence/${factIds[0]}`)).status()).toBe(404);
  expect((await db.query('SELECT count(*)::int AS n FROM evidence_fact WHERE document_id=$1', [docId])).rows[0].n).toBe(factIds.length);
  expect((await db.query('SELECT status,ephemeral_private_key_enc FROM abdm_hi_transfer WHERE id=$1', [transferred.id])).rows[0]).toMatchObject({ status: 'PURGED', ephemeral_private_key_enc: null });
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Sources/ })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: '/tmp/oncobrief-revocation-fixed.png', fullPage: true });
});
