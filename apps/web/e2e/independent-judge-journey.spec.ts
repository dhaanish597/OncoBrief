import { expect, test, type Page } from '@playwright/test';
import { getMigratorPool, closePools } from '../../../packages/db/src/client';

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/workspace/);
}
const query = (sql: string, values: unknown[] = []) => getMigratorPool().query(sql, values);
test.afterAll(closePools);

test('independent ordered ten-scene synthetic judge journey with persisted assertions', async ({ page }, info) => {
  test.setTimeout(90_000);
  const observations: Record<string, unknown> = {};
  const start = performance.now();
  // Only loopback application traffic is allowed from this browser.
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
  const patients = (await query(`SELECT p.id,p.demo_code,p.org_id FROM patient p JOIN organization o ON o.id=p.org_id WHERE o.slug='rci' AND p.is_demo_fixture`)).rows;
  const p1 = patients.find(p => p.demo_code === 'DEMO-001').id;
  const p3 = patients.find(p => p.demo_code === 'DEMO-003').id;
  const org = patients[0].org_id;
  let artifactId: string;
  let packetId: string;

  await test.step('1 intake preserves a synthetic source and extracted evidence', async () => {
    await login(page, 'dr.rao@rci.demo');
    await page.goto(`/patients/${p1}/sources`);
    const before = Number((await query('SELECT count(*) n FROM document WHERE patient_id=$1', [p1])).rows[0].n);
    await page.getByRole('button', { name: 'Import from EHR / ABDM' }).click();
    await expect(page.getByText('Synthetic Demo Fixture — Standard Ingest')).toBeVisible();
    await page.getByTestId('pull-abdm-bundle-tmc').click();
    await expect(page.getByText(/bundle imported successfully/i)).toBeVisible();
    expect(Number((await query('SELECT count(*) n FROM document WHERE patient_id=$1', [p1])).rows[0].n)).toBe(before + 1);
    const imported = await query(`SELECT d.id,count(ef.id)::int facts,count(*) FILTER(WHERE es.state='extracted')::int extracted FROM document d JOIN evidence_fact ef ON ef.document_id=d.id JOIN evidence_state es ON es.evidence_fact_id=ef.id WHERE d.patient_id=$1 GROUP BY d.id ORDER BY max(d.uploaded_at) DESC LIMIT 1`, [p1]);
    expect(imported.rows[0].facts).toBeGreaterThan(0);
    expect(imported.rows[0].extracted).toBe(imported.rows[0].facts);
    observations.intake = imported.rows[0];
  });
  await test.step('2 changes since last consultation and actual dated lab source', async () => {
    await page.getByTestId('tab-evidence').click();
    await expect(page.getByTestId('changes-since-last-visit-banner')).toContainText('05 Jul 2025');
    await page.getByTestId('filter-since_last_visit').click();
    await page.getByTestId('filter-labs').click();
    const labs = page.getByTestId('longitudinal-lab-flowsheet');
    await expect(labs).toContainText('-1.2 g/dL');
    await labs.locator('a[title*="View"]').first().click();
    await expect(page.getByText(/Source inspector/i)).toBeVisible();
    await expect(page.locator('[data-highlight="true"]').first()).toBeVisible();
  });
  await test.step('3 human-confirmed atomic batch verification persists', async () => {
    await page.goto(`/patients/${p1}/evidence`);
    const before = Number((await query(`SELECT count(*) n FROM evidence_state WHERE patient_id=$1 AND state='verified'`, [p1])).rows[0].n);
    await page.getByTestId('open-batch-verify-btn').click();
    const modal = page.getByTestId('batch-verification-modal');
    const selected = await modal.locator('input[type=checkbox]:checked').count();
    expect(selected).toBeGreaterThan(0);
    await page.getByTestId('confirm-batch-verify-btn').click();
    await expect(modal).not.toBeVisible();
    expect(Number((await query(`SELECT count(*) n FROM evidence_state WHERE patient_id=$1 AND state='verified'`, [p1])).rows[0].n)).toBe(before + selected);
    observations.batch = selected;
  });
  await test.step('4 reconcile the real surgery-date contradiction without inventing a winner', async () => {
    await page.getByTestId('tab-conflicts').click();
    // Imported synthetic examples can add legitimate conflicts. Each requires a human decision.
    while ((await query(`SELECT count(*)::int n FROM conflict_set WHERE patient_id=$1 AND status='open'`, [p1])).rows[0].n > 0) {
      await page.getByRole('link', { name: /open reconciliation room/i }).first().click();
      await expect(page.getByTestId('source-pane')).toHaveCount(2);
      const button = page.getByTestId('resolve-retain-both');
      await button.locator('xpath=ancestor::form[1]').locator('textarea[name=reason]').fill('Synthetic review: both source documents retained for human facility confirmation.');
      await button.click();
      await expect(page).toHaveURL(/\/conflicts$/);
    }
    expect((await query(`SELECT count(*)::int n FROM conflict_set WHERE patient_id=$1 AND status='open'`, [p1])).rows[0].n).toBe(0);
  });
  await test.step('5 review and reserve a ready OPD candidate; release then confirm arrived walk-in', async () => {
    await page.goto('/workspace');
    await page.getByRole('button', { name: 'Live oncology OPD', exact: true }).click();
    const vacant = (await query(`SELECT id FROM opd_appointment_slot WHERE org_id=$1 AND status='vacant' ORDER BY clinic_date DESC LIMIT 1`, [org])).rows[0].id;
    const row = page.getByTestId(`opd-slot-${vacant}`);
    await row.getByRole('button', { name: 'Review backfill candidates' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio')).toHaveCount(1);
    await dialog.getByRole('radio').check();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Confirm slot offer', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await query('SELECT status,patient_id FROM opd_appointment_slot WHERE id=$1', [vacant])).rows[0]).toEqual({ status: 'vacant', patient_id: null });
    expect((await query(`SELECT status FROM opd_waitlist_entry WHERE offered_slot_id=$1`, [vacant])).rows[0].status).toBe('offered');
    await row.getByRole('button', { name: 'Release offer', exact: true }).click();
    await page.getByLabel('Operational reason (required)').fill('Synthetic confirmed arrival; explicitly release offer before registration');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Confirm status update', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await row.getByRole('button', { name: 'Register walk-in', exact: true }).click();
    await dialog.getByRole('radio').check();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Confirm walk-in registration', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await query('SELECT status,patient_id FROM opd_appointment_slot WHERE id=$1', [vacant])).rows[0]).toEqual({ status: 'walk_in', patient_id: p3 });
  });
  await test.step('6 create a source-backed administrative task and confirm its owner', async () => {
    await login(page, 'coord.anita@rci.demo');
    await page.goto(`/patients/${p1}/record-map`);
    await page.getByTestId('create-task-from-gap').first().click();
    await page.getByRole('button', { name: /create task from this gap/i }).first().click();
    await page.getByTestId('tab-tasks').click();
    const row = page.getByTestId('task-row').filter({ has: page.getByRole('form', { name: 'Assign task owner' }) }).first();
    const owner = (await query(`SELECT user_id FROM membership WHERE org_id=$1 AND role='coordinator'`, [org])).rows[0].user_id;
    const taskId = await row.locator('input[name=taskId]').first().inputValue();
    await row.getByLabel('Task owner', { exact: true }).selectOption(owner);
    await row.getByLabel('Confirm owner and deadline').check();
    await row.getByRole('button', { name: 'Confirm assignment' }).click();
    await expect(row.getByRole('status')).toContainText('confirmed and audited');
    expect((await query('SELECT assigned_to FROM admin_task WHERE id=$1', [taskId])).rows[0].assigned_to).toBe(owner);
  });
  await test.step('7 approve a packet and source-grounded Studio draft; verify exports', async () => {
    await login(page, 'dr.rao@rci.demo');
    await page.goto(`/patients/${p3}/packet`);
    const packetsBefore=Number((await query('SELECT count(*) n FROM consultation_packet WHERE patient_id=$1',[p3])).rows[0].n);
    await page.getByRole('button', { name: 'assemble draft', exact: true }).click();
    await expect.poll(async()=>Number((await query('SELECT count(*) n FROM consultation_packet WHERE patient_id=$1',[p3])).rows[0].n)).toBe(packetsBefore+1);
    packetId = (await query(`SELECT id FROM consultation_packet WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 1`, [p3])).rows[0].id;
    await expect(page.locator(`input[name=packetId][value="${packetId}"]`).first()).toBeAttached();
    await page.getByTestId('approve-packet').click();
    await expect.poll(async()=>(await query('SELECT status FROM consultation_packet WHERE id=$1',[packetId])).rows[0].status).toBe('approved');
    expect((await page.request.get(`/api/v1/packets/${packetId}/export`)).status()).toBe(200);
    for (const kind of ['tumor_board_deck', 'academic_case_abstract', 'patient_info_sheet', 'referral_letter']) {
      await page.getByTestId('artifact-kind-select').selectOption(kind);
      await page.getByTestId('generate-draft-btn').click();
      if(kind==='tumor_board_deck') {
        await expect(page.getByTestId('tumor-board-slides-view')).toBeVisible();
        await page.getByTestId('editor-tab').click();
      }
      const heading={tumor_board_deck:'Multidisciplinary Tumor Board',academic_case_abstract:'De-Identified Academic Case Report',patient_info_sheet:'Patient & Caregiver Visit Summary',referral_letter:'Specialist Referral / Transfer Letter'}[kind]!;
      await expect(page.getByTestId('studio-markdown-editor')).toHaveValue(new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    }
    await page.getByTestId('approve-studio-artifact').click();
    await expect(page.getByText('Document Approved & Frozen')).toBeVisible();
    const artifact = (await query(`SELECT id,status,encode(snapshot_sha256,'hex') hash FROM studio_artifact WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 1`, [p3])).rows[0];
    expect(artifact.status).toBe('approved'); expect(artifact.hash).toMatch(/^[a-f0-9]{64}$/); artifactId=artifact.id;
    for (const format of ['markdown', 'json', 'abdm', 'mcode']) expect((await page.request.get(`/api/v1/studio/${artifactId}/export?format=${format}`)).status()).toBe(200);
    observations.artifact = artifact;
  });
  await test.step('8 caregiver consent, scoped voice preview, delivered reminder and attendance', async () => {
    await page.getByTestId('tab-continuity').click();
    await expect(page.getByTestId('caregiver-network-section')).toContainText('Kavita Menon');
    const outboxBefore=Number((await query('SELECT count(*) n FROM message_outbox WHERE org_id=$1',[org])).rows[0].n);
    await page.getByTestId('approve-message').first().click();
    await page.getByTestId('deliver-message').first().click();
    await expect(page.getByText(/simulated delivery/i).first()).toBeVisible();
    await expect.poll(async()=>Number((await query('SELECT count(*) n FROM message_outbox WHERE org_id=$1',[org])).rows[0].n)).toBeGreaterThan(outboxBefore);

    await page.getByTestId('audio-locale-select').first().selectOption('ta-IN');
    expect(await page.getByTestId('audio-locale-select').first().locator('option').count()).toBe(11);
    const responsePromise = page.waitForResponse(r=>r.url().endsWith('/api/v1/continuity/tts'));
    await page.getByTestId('generate-voice-note').first().click();
    const response=await responsePromise; expect(response.status()).toBe(503);
    expect(response.headers()['cache-control']).toContain('no-store');
    observations.browserSpeech = await page.evaluate(()=>({available:'speechSynthesis' in window,voices:'speechSynthesis' in window?window.speechSynthesis.getVoices().map(v=>({lang:v.lang,local:v.localService})):[]}));
    await expect(page.getByTestId('tts-fallback-note').first()).toBeVisible();
    await page.getByTestId('load-synthetic-demo-audio').first().click();
    await expect(page.getByTestId('audio-provider-badge').first()).toContainText(/silent|no speech/i);
    await login(page,'coord.anita@rci.demo');
    await page.goto(`/patients/${p3}/continuity`);
    await page.getByTestId('attendance-select').first().selectOption('cannot_attend');
    await page.locator('input[name=note]').first().fill('Synthetic travel delay; coordinator callback requested');
    await page.getByTestId('record-attendance-button').first().click();
    await expect(page.locator('[data-testid^=attendance-status-badge-]').first()).toContainText('Cannot Attend');
    const card=page.locator('[data-testid^=caregiver-card-]').filter({hasText:'Kavita Menon'});
    await card.getByRole('button',{name:'Revoke Consent'}).click();
    await expect(card).toContainText('Consent Revoked');
    expect((await query(`SELECT sync_reminders,is_active,revoked_at FROM caregiver_contact WHERE patient_id=$1 AND full_name='Kavita Menon'`,[p3])).rows[0]).toMatchObject({sync_reminders:false,is_active:false,revoked_at:expect.any(Date)});
  });
  await test.step('9 institutional synthetic SOP lookup and deterministic medical refusal', async () => {
    await page.getByTestId('assistant-launcher').click();
    await page.getByTestId('assistant-input').fill('Show the institutional checklist for breast oncology intake');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByText('Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)').first()).toBeVisible();
    await page.getByTestId('assistant-input').fill('What chemotherapy should this patient receive?');
    await page.getByTestId('assistant-send').click();
    await expect(page.getByText('I can’t answer general medical questions about diagnosis or treatment').first()).toBeVisible();
  });
  await test.step('10 audit role sees persisted V4 events and verified ledger; clinician denied', async () => {
    await login(page,'auditor.k@rci.demo');
    await page.goto(`/patients/${p3}/audit`);
    await expect(page.getByTestId('ledger-verify')).toHaveAttribute('data-ok','true');
    for(const action of ['studio.approved','caregiver.revoked','message.attendance_recorded','opd.offered']) await expect(page.getByText(action,{exact:true}).first()).toBeVisible();
    await login(page,'dr.rao@rci.demo');
    expect((await page.goto(`/patients/${p3}/audit`))?.status()).toBe(403);
  });
  observations.automatedElapsedSeconds=(performance.now()-start)/1000;
  await info.attach('persisted-journey-observations',{body:JSON.stringify(observations,null,2),contentType:'application/json'});
  console.log('JUDGE_JOURNEY',JSON.stringify(observations));
});

test('real HTTP exports and TTS fail closed after approval and source withdrawal', async ({ page }) => {
  const p=(await query(`SELECT p.id,p.org_id FROM patient p JOIN organization o ON o.id=p.org_id WHERE o.slug='rci' AND p.demo_code='DEMO-003'`)).rows[0];
  const artifact=(await query(`SELECT id,cited_fact_ids FROM studio_artifact WHERE patient_id=$1 AND status='approved' ORDER BY created_at DESC LIMIT 1`,[p.id])).rows[0];
  expect(artifact).toBeTruthy();
  const packet=(await query(`SELECT id FROM consultation_packet WHERE patient_id=$1 AND status='approved' ORDER BY created_at DESC LIMIT 1`,[p.id])).rows[0];
  const message=(await query(`SELECT pm.id,ef.document_id FROM patient_message pm JOIN message_variable_source vs ON vs.patient_message_id=pm.id JOIN evidence_fact ef ON ef.id=vs.evidence_fact_id WHERE pm.patient_id=$1 LIMIT 1`,[p.id])).rows[0];
  const unauth=await page.request.post('/api/v1/continuity/tts',{data:{messageId:message.id,patientId:p.id,languageCode:'en-IN'}});
  expect(unauth.status()).toBe(401);
  await login(page,'dr.rao@rci.demo');
  const other=(await query(`SELECT p.id FROM patient p JOIN organization o ON o.id=p.org_id WHERE o.slug='northgate' LIMIT 1`)).rows[0];
  expect((await page.request.post('/api/v1/continuity/tts',{data:{messageId:message.id,patientId:other.id,languageCode:'en-IN'}})).status()).toBe(404);
  expect((await page.request.post('/api/v1/continuity/tts',{data:{messageId:message.id,patientId:p.id,languageCode:'xx-XX'}})).status()).toBe(400);
  const docs=(await query('SELECT DISTINCT document_id FROM evidence_fact WHERE id=ANY($1::uuid[])',[artifact.cited_fact_ids])).rows.map(r=>r.document_id);
  docs.push(message.document_id);
  await query(`UPDATE document SET ingest_error='consent_revoked_or_expired' WHERE id=ANY($1::uuid[])`,[docs]);
  try {
    for(const format of ['markdown','json','abdm','mcode']) expect((await page.request.get(`/api/v1/studio/${artifact.id}/export?format=${format}`)).status()).toBe(409);
    for(const format of ['json','abdm','mcode']) expect((await page.request.get(`/api/v1/packets/${packet.id}/export?format=${format}`)).status()).toBe(409);
    expect((await page.request.get(`/api/v1/evidence/${artifact.cited_fact_ids[0]}`)).status()).toBe(404);
    const tts=await page.request.post('/api/v1/continuity/tts',{data:{messageId:message.id,patientId:p.id,languageCode:'en-IN'}});
    expect(tts.status()).toBe(409); expect(await tts.text()).not.toContain('fallbackText');
    expect(Number((await query(`SELECT count(*) n FROM audit_event WHERE entity_id IN ($1,$2) AND outcome='denied'`,[artifact.id,packet.id])).rows[0].n)).toBeGreaterThanOrEqual(7);
  }finally{await query('UPDATE document SET ingest_error=NULL WHERE id=ANY($1::uuid[])',[docs]);}
});
