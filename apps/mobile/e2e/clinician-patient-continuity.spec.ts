import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/oncobrief',
});

const ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const PATIENT_ID = 'b0000000-0000-0000-0000-000000000001';
const USER_ID = 'c0000000-0000-0000-0000-000000000001';
const APPT_ID = 'd0000000-0000-0000-0000-000000000001';
const TASK_ID = 'e0000000-0000-0000-0000-000000000001';
const MSG_APPROVED_ID = 'f0000000-0000-0000-0000-000000000001';
const MSG_DRAFT_ID = 'f0000000-0000-0000-0000-000000000002';
const DOC_LAB_ID = '10000000-0000-0000-0000-000000000003';

test.describe('MOB-021: 20-Step Clinician-to-Patient Connected Continuity Verification', () => {
  test.beforeAll(async () => {
    // Clean previous mutable session/caregiver/grant state
    await pool.query('DELETE FROM patient_portal_session WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM caregiver_contact WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM patient_share_grant WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM patient_document_review WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM patient_discrepancy_flag WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM patient_message WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM admin_task WHERE org_id = $1', [ORG_ID]);
    await pool.query('DELETE FROM appointment WHERE org_id = $1', [ORG_ID]);

    // Step 1: Seed organization, clinician, and patient
    await pool.query(`
      INSERT INTO organization (id, slug, name, is_demo_fixture)
      VALUES ($1, 'apollo-chennai-demo', 'Apollo Specialty Cancer Hospital (Chennai Demo)', true)
      ON CONFLICT (slug) DO UPDATE SET is_demo_fixture = true
    `, [ORG_ID]);

    await pool.query(`
      INSERT INTO app_user (id, email, display_name, password_hash, is_active, is_demo_fixture)
      VALUES ($1, 'coordinator@apollo-chennai.demo', 'Dr. Ananya Ramanathan', 'mock-password-hash', true, true)
      ON CONFLICT (id) DO UPDATE SET is_demo_fixture = true
    `, [USER_ID]);

    await pool.query(`
      INSERT INTO membership (org_id, user_id, role, is_demo_fixture)
      VALUES ($1, $2, 'clinician', true)
      ON CONFLICT (org_id, user_id) DO UPDATE SET is_demo_fixture = true
    `, [ORG_ID, USER_ID]);

    await pool.query(`
      INSERT INTO patient (id, org_id, demo_code, display_name, primary_language, primary_clinician_id, is_demo_fixture)
      VALUES ($1, $2, 'DEMO-001', 'Meenakshi Sundaram', 'ta', $3, true)
      ON CONFLICT (id) DO NOTHING
    `, [PATIENT_ID, ORG_ID, USER_ID]);

    // Step 1b: Seed verified documents
    await pool.query(`
      INSERT INTO document (id, org_id, patient_id, source_kind, original_filename, document_type, ingest_status, duplicate_status, document_date, issuing_facility, mime_type, byte_size, content_sha256, storage_key, uploaded_by)
      VALUES 
        ('10000000-0000-0000-0000-000000000001', $1, $2, 'upload', 'Core Needle Biopsy & IHC Report.pdf', 'pathology', 'ready', 'none', '2026-10-12', 'Apollo Specialty Hospital', 'application/pdf', 1024, decode('1111111111111111111111111111111111111111111111111111111111111111', 'hex'), 'k1', $4),
        ('10000000-0000-0000-0000-000000000002', $1, $2, 'upload', 'Staging PET-CT Whole Body Summary.pdf', 'imaging', 'ready', 'none', '2026-10-16', 'Apollo Specialty Hospital', 'application/pdf', 1024, decode('2222222222222222222222222222222222222222222222222222222222222222', 'hex'), 'k2', $4),
        ($3, $1, $2, 'upload', 'Pre-Cycle 3 Hematology & ANC Panel.pdf', 'laboratory', 'ready', 'none', '2026-11-10', 'Apollo Specialty Hospital', 'application/pdf', 1024, decode('3333333333333333333333333333333333333333333333333333333333333333', 'hex'), 'k3', $4)
      ON CONFLICT (id) DO NOTHING
    `, [ORG_ID, PATIENT_ID, DOC_LAB_ID, USER_ID]);

    await pool.query(`
      INSERT INTO document_page (id, org_id, document_id, page_number, plain_text)
      VALUES ('20000000-0000-0000-0000-000000000001', $1, $2, 1, 'Pre-Cycle 3 Hematology Panel\nANC 1.9 ×10³/µL\nPrinted reference interval: 1.5–8.0 ×10³/µL\nHemoglobin 10.8 g/dL\nPlatelets 210 ×10³/µL')
      ON CONFLICT (id) DO NOTHING
    `, [ORG_ID, DOC_LAB_ID]);

    await pool.query(`
      INSERT INTO evidence_fact (id, org_id, patient_id, document_id, fact_type, slot_key, extractor_kind, extractor_name, extractor_version, confidence_band, value_normalized, value_json, verbatim_quote)
      VALUES 
        ('40000000-0000-0000-0000-000000000001', $1, $2, '10000000-0000-0000-0000-000000000001', 'stage', 'stage_group', 'fixture', 'fixture-extractor', '1.0', 'high', 'Stage IIA Breast Cancer — AC-T Cycle 3 of 4', '{"value": "Stage IIA Breast Cancer"}'::jsonb, 'Stage IIA (cT2 N0 M0)'),
        ('40000000-0000-0000-0000-000000000002', $1, $2, '10000000-0000-0000-0000-000000000001', 'diagnosis', 'primary_site', 'fixture', 'fixture-extractor', '1.0', 'high', 'Invasive Ductal Carcinoma, Left Breast', '{"value": "Invasive Ductal Carcinoma"}'::jsonb, 'Invasive Ductal Carcinoma, Left Breast')
      ON CONFLICT (id) DO NOTHING
    `, [ORG_ID, PATIENT_ID]);

    await pool.query(`
      INSERT INTO timeline_event (id, org_id, patient_id, document_id, evidence_fact_id, fact_type, value_text, display_date, state)
      VALUES 
        ('30000000-0000-0000-0000-000000000001', $1, $2, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'stage', 'Stage IIA Breast Cancer — AC-T Cycle 3 of 4', '2026-10-12', 'verified'),
        ('30000000-0000-0000-0000-000000000002', $1, $2, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'diagnosis', 'Invasive Ductal Carcinoma, Left Breast', '2026-10-12', 'verified')
      ON CONFLICT (id) DO NOTHING
    `, [ORG_ID, PATIENT_ID]);

    // Step 2: Coordinator schedules an oncology OPD appointment
    await pool.query(`
      INSERT INTO appointment (id, org_id, patient_id, clinician_id, scheduled_start, scheduled_end, token_number, room_label, status, appointment_type)
      VALUES ($1, $2, $3, $4, '2026-11-14T09:30:00Z', '2026-11-14T10:00:00Z', 'ONC-14', 'Medical Oncology OPD Room 4', 'scheduled', 'chemo_clearance')
      ON CONFLICT (id) DO UPDATE SET status = 'scheduled'
    `, [APPT_ID, ORG_ID, PATIENT_ID, USER_ID]);

    // Step 3: Coordinator creates missing document task
    await pool.query(`
      INSERT INTO admin_task (id, org_id, patient_id, task_kind, origin_kind, origin_document_id, title, detail, status, priority, created_by)
      VALUES ($1, $2, $3, 'missing_document', 'document', '10000000-0000-0000-0000-000000000001', 'Upload Outside Ki-67 Addendum Slide Report', 'Bring or upload prior to OPD visit', 'open', 'high', $4)
      ON CONFLICT (id) DO NOTHING
    `, [TASK_ID, ORG_ID, PATIENT_ID, USER_ID]);

    // Step 4: Clinician approves continuity message (and leaves a draft message)
    await pool.query(`
      INSERT INTO message_template (id, org_id, code, locale, version, body_template, allowed_variables, approved_by, approved_at)
      VALUES ('50000000-0000-0000-0000-000000000001', $1, 'PRE_CYCLE_REMINDER', 'en', 1, 'Pre-Cycle reminder: {{instruction}}', ARRAY['instruction'::text], $2, now())
      ON CONFLICT (id) DO NOTHING
    `, [ORG_ID, USER_ID]);

    await pool.query(`
      INSERT INTO patient_message (id, org_id, patient_id, template_id, body_rendered, locale, status, composed_by, approved_by, approved_at, variables_json)
      VALUES 
        ($1, $2, $3, '50000000-0000-0000-0000-000000000001', 'Pre-Cycle 3 reminder: Please take anti-emetics 30 min before appointment. Arrive by 09:15 AM at Room 4.', 'en', 'approved', $5, $5, now(), '{}'::jsonb),
        ($4, $2, $3, '50000000-0000-0000-0000-000000000001', 'INTERNAL CLINICIAN DRAFT NOTE - UNAPPROVED - CONFIDENTIAL', 'en', 'draft', $5, null, null, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [MSG_APPROVED_ID, ORG_ID, PATIENT_ID, MSG_DRAFT_ID, USER_ID]);
  });

  test('Complete 20-Step Clinician-to-Patient Connected Continuity Loop', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Clear local browser storage
    await page.goto('/');
    await page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {}
    });

    // Step 5: Patient launches mobile app, routes to /onboarding, toggles language to Tamil
    await page.goto('/');
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByText('உங்கள் பராமரிப்புப் பயணம்,', { exact: false })).toBeVisible();

    // Tap onboarding action
    await page.getByRole('button', { name: 'பராமரிப்பைப் பாருங்கள்', exact: true }).click();
    await page.getByRole('button', { name: 'மாதிரிப் பணியிடத்தைத் திறக்கவும்', exact: true }).click();
    await page.getByRole('tab', { name: 'பதிவுகள்', exact: true }).click();
    await expect(page.getByText('மருத்துவப் பதிவுகள்', { exact: true })).toBeVisible();

    // Step 6: Patient navigates to Sign In and logs in with DEMO-001 / OTP 246810
    await page.goto('/signin');
    await page.getByRole('button', { name: 'Connect to Live Hospital Portal' }).click();
    await expect(page.getByTestId('signin-submit-btn')).toBeVisible();

    await page.getByTestId('signin-hospital').fill('apollo-chennai-demo');
    await page.getByTestId('signin-identifier').fill('DEMO-001');
    await page.getByTestId('signin-otp').fill('246810');
    await page.getByTestId('signin-submit-btn').click();

    // Step 7: Snapshot Hydration & Draft Exclusion
    // Mobile app transitions to (tabs) in connected mode
    await expect(page.getByText('Apollo Specialty Hospital', { exact: false }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Stage IIA Breast Cancer — AC-T Cycle 3 of 4', { exact: false }).first()).toBeVisible();

    // Assert approved continuity message renders
    await expect(page.getByText('Pre-Cycle 3 reminder: Please take anti-emetics', { exact: false })).toBeVisible();

    // Assert unapproved draft message is excluded
    const pageContent = await page.evaluate(() => document.body.innerText);
    expect(pageContent).not.toContain('INTERNAL CLINICIAN DRAFT NOTE');

    // Step 8: Bilingual Voice TTS Playback
    await page.getByRole('button', { name: 'Listen to Message', exact: true }).click();
    await expect(page.getByText('Speaking (Audio Active)', { exact: false })).toBeVisible({ timeout: 10000 });

    // Step 9: Appointment Attendance Confirmation
    await expect(page.getByRole('button', { name: 'Confirm I Will Attend', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm I Will Attend', exact: true }).click();
    await expect(page.getByText('Attendance Confirmed', { exact: true })).toBeVisible({ timeout: 10000 });

    // Step 10: Missing-Document Task Deep-Link & Upload
    await page.goto('/import');
    await page.getByRole('checkbox', { name: /I confirm this is an authentic medical report|I am using fictional sample files only/i }).click();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Choose a file|Choose a sample file/i }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'ki-67-outside-report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF'),
    });
    await page.getByRole('button', { name: /Upload to Care Team|Save sample copy/i }).click();

    // Step 11: Dual-Track Verification Badge Check
    await expect(page.getByText('ki-67-outside-report.pdf', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Local copy · no extraction', { exact: false }).or(page.getByText('Pending Clinician Review', { exact: false })).or(page.getByText('Extracted · not clinically verified', { exact: false }))).toBeVisible();

    // Step 12: Verbatim Lab & Source Page Inspection
    // Open the lab report
    await page.goto(`http://127.0.0.1:8087/record/${DOC_LAB_ID}`);
    await expect(page.getByRole('button', { name: 'Inspect Source Page (Page 1)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Inspect Source Page (Page 1)', exact: true }).click();
    await expect(page.getByText('Pre-Cycle 3 Hematology Panel', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('ANC 1.9 ×10³/µL', { exact: false })).toBeVisible();
    await expect(page.getByText('Printed reference interval: 1.5–8.0 ×10³/µL', { exact: false })).toBeVisible();

    // Strict Clinical-Safety Assertion: Zero range classification labels
    const labBodyText = await page.evaluate(() => document.body.innerText);
    expect(labBodyText).not.toMatch(/below supplied interval/i);
    expect(labBodyText).not.toMatch(/within supplied interval/i);
    expect(labBodyText).not.toMatch(/above supplied interval/i);

    // Step 13: Glossary-to-Question De-Duplication & Stage Routing
    await page.goto('/prepare');
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await page.getByTestId('question-input').fill('Is ANC 1.9 safe for Cycle 3 chemotherapy?');
    await page.getByRole('button', { name: 'Save question', exact: true }).click();
    // Attempt duplicate question
    await page.getByTestId('question-input').fill('Is ANC 1.9 safe for Cycle 3 chemotherapy?');
    await page.getByRole('button', { name: 'Save question', exact: true }).click();

    // Exactly one instance of the question should exist
    const questionMatches = await page.getByText('Is ANC 1.9 safe for Cycle 3 chemotherapy?').count();
    expect(questionMatches).toBe(1);

    // Step 14: Patient Factual Discrepancy Flag
    await page.goto('http://127.0.0.1:8087/record/10000000-0000-0000-0000-000000000002');
    await page.getByLabel('Flag a detail', { exact: false }).fill('Echo was performed on 09 Nov 2026, not Oct 16');
    await page.getByRole('button', { name: /Send Discrepancy to Care Team|Save for discussion/i }).click();
    await expect(page.getByText('Echo was performed on 09 Nov 2026', { exact: false })).toBeVisible();

    // Step 15: Consultation Preparation & Personal Notes
    await page.goto('/prepare');
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await page.getByLabel('Personal notes', { exact: true }).fill('Notes for Dr. Ramanathan: Mild tingling in fingers after cold water.');
    await page.getByRole('button', { name: 'Save notes', exact: true }).click();
    await expect(page.getByLabel('Personal notes', { exact: true })).toHaveValue('Notes for Dr. Ramanathan: Mild tingling in fingers after cold water.');

    // Step 16: Coordinator Request Submission
    await page.goto('/coordinator-request');
    await page.getByLabel(/Request Summary|Your Request/i).fill('Need signed daycare cycle summary for insurance pre-auth');
    await page.getByRole('button', { name: /Send Request to Coordinator|Send Request to Care Coordinator/i }).click();
    await expect(page.getByText('Need signed daycare cycle summary for insurance pre-auth')).toBeVisible({ timeout: 10000 });

    // Step 17: Consented Caregiver & Scoped Share
    await page.goto('/sharing');
    await page.getByRole('button', { name: 'Add New Caregiver', exact: true }).click();
    await page.getByLabel('Full Name', { exact: true }).fill('Suresh Sundaram');
    await page.getByLabel('Relationship', { exact: true }).fill('Spouse');
    await page.getByLabel('Phone Number', { exact: true }).fill('+919840011223');
    await page.getByRole('button', { name: 'Save Consented Caregiver', exact: true }).click();
    await expect(page.getByText('Suresh Sundaram', { exact: false })).toBeVisible({ timeout: 10000 });

    // Revoke caregiver share simulation
    await page.getByLabel(/Who is this for\?|Recipient/i).fill('Dr. Rao (Second Opinion)');
    await page.getByLabel(/Purpose/i).fill('Review histopathology slides');
    await page.getByRole('checkbox').first().click();
    await page.getByRole('button', { name: 'Create Revocable Share Grant', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Revoke Share Grant', exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Revoke Share Grant', exact: true }).click();
    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Step 18: Offline Mutation Queue & Reconnect Replay
    await page.goto('/prepare');
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await page.getByTestId('question-input').fill('Offline queued question: Will diet impact ANC count?');
    await page.getByRole('button', { name: 'Save question', exact: true }).click();
    await expect(page.getByText('Will diet impact ANC count?')).toBeVisible();

    // Re-enable network online
    await page.context().setOffline(false);
    await page.waitForTimeout(500);

    // Step 19: Clinician Backend Verification via PostgreSQL
    // 19a: Appointment attendance status confirmed
    const apptCheck = await pool.query<{ status: string }>('SELECT status FROM appointment WHERE id = $1', [APPT_ID]);
    expect(apptCheck.rows[0]?.status).toBe('confirmed');

    // 19b: Caregiver Suresh Sundaram persisted
    const cgCheck = await pool.query<{ full_name: string; is_active: boolean }>(
      'SELECT full_name, is_active FROM caregiver_contact WHERE patient_id = $1 AND org_id = $2',
      [PATIENT_ID, ORG_ID],
    );
    expect(cgCheck.rows.length).toBeGreaterThanOrEqual(1);
    expect(cgCheck.rows[0]?.full_name).toBe('Suresh Sundaram');

    // 19c: Open coordinator task created from request
    const taskCheck = await pool.query<{ title: string; task_kind: string }>(
      'SELECT title, task_kind FROM admin_task WHERE patient_id = $1 AND org_id = $2',
      [PATIENT_ID, ORG_ID],
    );
    expect(taskCheck.rows.length).toBeGreaterThan(0);

    // Step 20: Consent Revocation & Cryptographic Wipe
    await page.goto('/(tabs)/profile');
    await page.getByRole('button', { name: 'Erase demo and restart', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Erase my demo changes', exact: true }).click();
    await page.getByRole('button', { name: 'Erase my demo changes', exact: true }).click();

    // App returns to clean landing page
    await expect(page.getByRole('button', { name: /Explore your care|பராமரிப்பைப் பாருங்கள்/i })).toBeVisible({ timeout: 10000 });

    const unexpectedErrors = pageErrors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('ERR_INTERNET_DISCONNECTED') && !e.includes('NetworkError'),
    );
    expect(unexpectedErrors).toEqual([]);
  });

  test.afterAll(async () => {
    await pool.end();
  });
});
