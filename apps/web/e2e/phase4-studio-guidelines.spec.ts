import { expect, test, type Page } from '@playwright/test';
import { getMigratorPool } from '../../../packages/db/src/client';

async function loginAsClinician(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dr.rao@rci.demo');
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/workspace/);
}

async function openDemoPatient(page: Page, code = 'DEMO-001') {
  await page.getByRole('link', { name: new RegExp(code) }).first().click();
  await expect(page).toHaveURL(/\/patients\/.+\/evidence/);
}

async function queryDb(sql: string, params: unknown[] = []) {
  return getMigratorPool().query(sql, params);
}

test.describe.serial('Phase 4: Oncology Guideline Co-Pilot and Clinician Productivity Studio', () => {
  test('Guideline Co-Pilot: permitted institutional SOP lookup returns [G#] citation with disclaimer', async ({ page }) => {
    await loginAsClinician(page);
    await openDemoPatient(page);

    // Open Ask OncoBrief floating launcher
    const launcher = page.getByTestId('assistant-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByTestId('assistant-panel');
    await expect(panel).toBeVisible();

    const input = page.getByTestId('assistant-input');
    await input.fill('Show the institutional checklist for breast oncology intake');
    await page.getByTestId('assistant-send').click();

    // Verify response contains guideline disclaimer and citation
    await expect(
      page.locator('text=Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)').first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('text=[G1]').first()).toBeVisible();
    await expect(page.locator('text=Institutional SOP — Breast Oncology Intake and Document Readiness').first()).toBeVisible();
  });

  test('Guideline Co-Pilot: patient-specific clinical decision query is strictly blocked', async ({ page }) => {
    await loginAsClinician(page);
    await openDemoPatient(page);

    const launcher = page.getByTestId('assistant-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const input = page.getByTestId('assistant-input');
    await input.fill('What chemotherapy should this patient receive?');
    await page.getByTestId('assistant-send').click();

    // Verify clinical boundary rejection message
    await expect(
      page.locator('text=Ask OncoBrief is limited to information contained in the authorised OncoBrief record').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('text=I can’t answer general medical questions about diagnosis or treatment').first(),
    ).toBeVisible();
  });

  test('Productivity Studio: generate and switch between all 4 oncology document drafts', async ({ page }) => {
    await loginAsClinician(page);
    await openDemoPatient(page, 'DEMO-003');
    await page.getByTestId('tab-packet').click();
    await expect(page).toHaveURL(/\/patients\/.+\/packet/);

    // Verify Productivity Studio is present
    await expect(page.getByTestId('productivity-studio')).toBeVisible();

    // 1. Referral Letter
    const kindSelect = page.getByTestId('artifact-kind-select');
    await kindSelect.selectOption('referral_letter');
    await page.getByTestId('generate-draft-btn').click();

    // After form post, verify Referral Letter draft appears in markdown editor
    const editor = page.getByTestId('studio-markdown-editor');
    await expect(editor).toHaveValue(/Specialist Referral \/ Transfer Letter/i, { timeout: 10_000 });
    const editorVal = await editor.inputValue();
    expect(editorVal).toMatch(/\[E\d+\]/);

    // 2. Tumor Board Deck
    await kindSelect.selectOption('tumor_board_deck');
    await page.getByTestId('generate-draft-btn').click();

    // Verify Tumor Board presentation generated and slide view rendered
    await expect(page.getByTestId('tumor-board-slides-view')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Slide 1').first()).toBeVisible();

    // Switch to editor tab to verify markdown content
    await page.getByTestId('editor-tab').click();
    await expect(editor).toHaveValue(/Multidisciplinary Tumor Board/i);

    // 3. Academic Case Report (De-identified)
    await kindSelect.selectOption('academic_case_abstract');
    await page.getByTestId('generate-draft-btn').click();

    await expect(editor).toHaveValue(/De-Identified Academic Case Report/i, { timeout: 10_000 });
    const caseReportVal = await editor.inputValue();
    expect(caseReportVal).not.toContain('DEMO-003 — Ready');
    expect(caseReportVal).toMatch(/Day (?:0|\+\d+)/);
    expect(caseReportVal).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);

    // 4. Patient Visit Summary
    await kindSelect.selectOption('patient_info_sheet');
    await page.getByTestId('generate-draft-btn').click();

    await expect(editor).toHaveValue(/Patient & Caregiver Visit Summary/i, { timeout: 10_000 });
    const patientSummaryVal = await editor.inputValue();
    expect(patientSummaryVal).toContain('administrative visit preparation instructions only');
  });

  test('Productivity Studio: edit draft, approve with cryptographic snapshot, and export', async ({ page }) => {
    const res = await queryDb(
      `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-003'`,
    );
    const demo3Id = res.rows[0].id;

    await loginAsClinician(page);
    await page.goto(`/patients/${demo3Id}/packet`);
    await expect(page).toHaveURL(new RegExp(`/patients/${demo3Id}/packet`));

    // Generate fresh referral letter for verified patient
    await page.getByTestId('artifact-kind-select').selectOption('referral_letter');
    await page.getByTestId('generate-draft-btn').click();
    const editor = page.getByTestId('studio-markdown-editor');
    await expect(editor).toHaveValue(/Specialist Referral \/ Transfer Letter/i, { timeout: 10_000 });

    // Retrieve the newly created draft artifact ID from DB
    const dbArtifact = await queryDb(
      `SELECT id, status, snapshot_sha256 FROM studio_artifact WHERE patient_id = $1 AND artifact_kind = 'referral_letter' ORDER BY created_at DESC LIMIT 1`,
      [demo3Id],
    );
    expect(dbArtifact.rowCount).toBeGreaterThan(0);
    const artifactId = dbArtifact.rows[0].id;

    // Test editing draft title / body
    const currentText = await editor.inputValue();
    // Supported edits preserve exact source clauses. Arbitrary factual additions are rejected by security tests.
    await editor.fill(`${currentText}\n\n`);
    await page.getByTestId('save-draft-btn').click();

    // Verify approval action by clinician
    const approveBtn = page.getByTestId('approve-studio-artifact');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Verify approval badge in UI
    await expect(page.locator('text=APPROVED').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Document Approved & Frozen').first()).toBeVisible();

    // Verify database row is marked approved with snapshot sha256
    const approvedRow = await queryDb(
      `SELECT status, snapshot_sha256, approved_by FROM studio_artifact WHERE id = $1`,
      [artifactId],
    );
    expect(approvedRow.rows[0].status).toBe('approved');
    expect(approvedRow.rows[0].snapshot_sha256).toBeTruthy();

    // Test multi-format export endpoints
    const mdRes = await page.request.get(`/api/v1/studio/${artifactId}/export?format=markdown`);
    expect(mdRes.status()).toBe(200);
    const mdBody = await mdRes.text();
    expect(mdBody).toContain('Specialist Referral / Transfer Letter');

    const jsonRes = await page.request.get(`/api/v1/studio/${artifactId}/export?format=json`);
    expect(jsonRes.status()).toBe(200);
    const jsonData = await jsonRes.json();
    expect(jsonData.id).toBe(artifactId);
    expect(jsonData.status).toBe('approved');

    const abdmRes = await page.request.get(`/api/v1/studio/${artifactId}/export?format=abdm`);
    expect(abdmRes.status()).toBe(200);
    const abdmData = await abdmRes.json();
    expect(abdmData.resourceType).toBe('Bundle');
    expect(abdmData.type).toBe('document');

    const mcodeRes = await page.request.get(`/api/v1/studio/${artifactId}/export?format=mcode`);
    expect(mcodeRes.status()).toBe(200);
    const mcodeData = await mcodeRes.json();
    expect(mcodeData.resourceType).toBe('Bundle');

    // Verify audit event logged for export
    const exportAudit = await queryDb(
      `SELECT action, outcome, metadata_json FROM audit_event WHERE entity_id = $1 AND action = 'studio.exported'`,
      [artifactId],
    );
    expect(exportAudit.rowCount).toBeGreaterThan(0);
  });
});
