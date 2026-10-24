import { getMigratorPool, closePools } from '@oncobrief/db';
import { expect, test } from '@playwright/test';

test.afterAll(async () => { await closePools(); });

test('synthetic consent, encrypted retrieval, sources and unverified evidence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/login');
  await page.getByLabel('Email').fill('dr.rao@rci.demo');
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await page.getByRole('link', { name: /DEMO-001/ }).first().click();
  await page.getByRole('link', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: /EHR \/ ABDM/i }).click();
  await page.getByRole('button', { name: /Request Patient Consent/ }).click();
  await expect(page.getByText('Consent request submitted. See the recorded consent status below before pulling records.', { exact: true })).toBeVisible();
  await page.reload();
  const artifact = page.getByTestId('abdm-artifact').first();
  await expect(artifact).toContainText('GRANTED', { timeout: 30000 });
  await Promise.all([page.waitForResponse(response => response.request().method() === 'POST' && response.url() === page.url()),
    artifact.getByRole('button', { name: 'pull records', exact: true }).click()]);
  await page.reload();
  await expect(page.getByTestId('abdm-transfer').first()).toContainText('TRANSFERRED', { timeout: 30000 });
  const source = page.getByRole('link', { name: /ABDM-inbound/ }).first();
  await expect(source).toBeVisible();
  await page.screenshot({ path: '/tmp/oncobrief-abdm-sources.png', fullPage: true });
  const patientId = new URL(page.url()).pathname.split('/')[2];
  await source.click();
  await expect(page.getByText(/Hemoglobin/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Evidence journey', exact: true }).click();
  await expect(page.getByText(/Hemoglobin/).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/oncobrief-abdm-ledger.png', fullPage: true });
  const db = getMigratorPool();
  const transfer = (await db.query(`SELECT id, status, ephemeral_private_key_enc, received_pages,
    ingested_document_ids FROM abdm_hi_transfer WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 1`, [patientId])).rows[0];
  expect(transfer.status).toBe('TRANSFERRED');
  expect(transfer.ephemeral_private_key_enc).toBeNull();
  expect(transfer.received_pages).toBe(1);
  const facts = await db.query(`SELECT ef.id, es.state, ef.verbatim_quote,
    (SELECT count(*)::int FROM evidence_span_link ep WHERE ep.evidence_fact_id=ef.id) AS provenance_count
    FROM evidence_fact ef JOIN evidence_state es ON es.evidence_fact_id=ef.id
    WHERE ef.document_id=ANY($1::uuid[])`, [transfer.ingested_document_ids]);
  expect(facts.rows.length).toBeGreaterThan(0);
  for (const fact of facts.rows) {
    expect(['extracted', 'conflicting']).toContain(fact.state);
    expect(fact.provenance_count).toBeGreaterThan(0);
  }
  const inbox = (await db.query(`SELECT request_id, payload_json FROM abdm_inbox
    WHERE payload_json->>'transactionId'=(SELECT abdm_transaction_id FROM abdm_hi_transfer WHERE id=$1)
    AND endpoint='/hiu/health-information/push'`, [transfer.id])).rows[0];
  const push = inbox.payload_json;
  expect(push.entries[0].content).not.toContain('Hemoglobin');
  expect(push.entries[0].content).not.toContain('resourceType');
  expect(push.keyMaterial.curve).toBe('Curve25519');
  // A delivery replay must not execute ingestion again after the private key has been wiped.
  const replay = await page.request.post('/api/v3/hiu/health-information/push', {
    headers: { 'request-id': inbox.request_id }, data: push,
  });
  expect(replay.status()).toBe(202);
  expect((await db.query('SELECT received_pages FROM abdm_hi_transfer WHERE id=$1', [transfer.id])).rows[0].received_pages).toBe(1);
  expect(errors).toEqual([]);
  console.log('ABDM_E2E_DATABASE_EVIDENCE', JSON.stringify({ transferId: transfer.id,
    status: transfer.status, keyWiped: transfer.ephemeral_private_key_enc === null,
    documentIds: transfer.ingested_document_ids, facts: facts.rows,
    encryptedPushBytes: push.entries[0].content.length }));
});
