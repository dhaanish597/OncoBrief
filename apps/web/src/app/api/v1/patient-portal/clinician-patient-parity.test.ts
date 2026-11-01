import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import { withTenantClient } from '@oncobrief/db';
import { POST as sessionPost } from './session/route';
import { GET as snapshotGet } from './snapshot/route';
import { POST as attendancePost } from './attendance/route';
import { POST as documentsPost } from './documents/route';
import { POST as flagsPost } from './flags/route';
import { GET as caregiversGet, POST as caregiversPost, DELETE as caregiversDelete } from './caregivers/route';

let fx: Fixtures;
let token: string;
let patientId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // Ensure an appointment exists for DEMO-001 in clinic schedule
  await withTenantClient(
    { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
    async (q) => {
      await q.query(
        `INSERT INTO appointment
           (org_id, patient_id, clinician_id, scheduled_start, scheduled_end, status, created_by)
         VALUES ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 30 minutes', 'scheduled', $4)`,
        [fx.org1, fx.patients.demo1, fx.clinicians.clinician, fx.clinicians.coordinator],
      );
    },
  );
}, 120_000);

describe('M6.5 REM-010: Clinician Website ↔ Patient Mobile 20-Step Parity Verification', () => {
  it('Step 1-3: Mobile signs into hospital portal and establishes shared identity for DEMO-001', async () => {
    // 1. Clinician opens synthetic DEMO-001 in website / DB
    expect(fx.patients.demo1).toBeTruthy();

    // 2. Mobile signs in as DEMO-001
    const sessReq = new Request('http://localhost/api/v1/patient-portal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({
        hospitalSlug: 'rci',
        patientExternalId: 'DEMO-001',
        otpCode: '246810',
        actorRole: 'patient',
      }),
    });
    const sessRes = await sessionPost(sessReq);
    expect(sessRes.status).toBe(201);
    const sessBody = await sessRes.json();
    token = sessBody.sessionToken;
    patientId = sessBody.patientId;

    // 3. Both refer to the identical database patient identity
    expect(patientId).toBe(fx.patients.demo1);
  });

  it('Step 4-7: Clinician appointment visibility & Patient attendance confirmation', async () => {
    // 4. Inspect appointments in patient snapshot
    const snapReq = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapRes = await snapshotGet(snapReq);
    expect(snapRes.status).toBe(200);
    const snap = await snapRes.json();
    expect(snap.patient.id).toBe(patientId);
    expect(snap.patient.displayName).toBeTruthy();
    expect(snap.appointments.length).toBeGreaterThan(0);

    const appt = snap.appointments[0];
    expect(appt.id).toBeTruthy();

    // 5 & 6. Patient confirms attendance
    const attendReq = new Request('http://localhost/api/v1/patient-portal/attendance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: appt.id,
        action: 'confirm',
      }),
    });
    const attendRes = await attendancePost(attendReq);
    expect(attendRes.status).toBe(200);
    const attendBody = await attendRes.json();
    expect(attendBody.status).toBe('confirmed');
    expect(attendBody.appointmentId).toBe(appt.id);

    // 7. Verify updated status reflects on subsequent snapshot
    const updatedSnapRes = await snapshotGet(snapReq);
    const updatedSnap = await updatedSnapRes.json();
    const updatedAppt = updatedSnap.appointments.find((a: any) => a.id === appt.id);
    expect(updatedAppt.status).toBe('confirmed');
  });

  it('Step 8-11: Clinician task visibility, patient upload & pending clinician review status', async () => {
    // 8 & 9. Patient sees tasks / requested documents
    const snapReq = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapRes = await snapshotGet(snapReq);
    const snap = await snapRes.json();
    expect(snap.tasks).toBeDefined();

    // 10. Patient uploads requested document
    const uploadReq = new Request('http://localhost/api/v1/patient-portal/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'external_mammogram_report.pdf',
        contentBase64: Buffer.from('%PDF-1.4 test external mammogram report').toString('base64'),
        documentDate: '2026-10-25',
        issuingFacility: 'Scan Diagnostic Centre, Chennai',
      }),
    });
    const uploadRes = await documentsPost(uploadReq);
    expect(uploadRes.status).toBe(201);
    const uploadBody = await uploadRes.json();
    expect(uploadBody.documentId).toBeTruthy();

    // 11. Website/Backend shows uploaded document with clinicianStatus 'unreviewed' / 'uploaded'
    const afterUploadRes = await snapshotGet(snapReq);
    const afterUpload = await afterUploadRes.json();
    const uploadedDoc = afterUpload.documents.find((d: any) => d.id === uploadBody.documentId);
    expect(uploadedDoc).toBeTruthy();
    expect(uploadedDoc.originalFilename || uploadedDoc.filename).toBe('external_mammogram_report.pdf');
    expect(['received', 'uploaded']).toContain(uploadedDoc.clinicianStatus);
  });

  it('Step 12-13: Patient flags discrepancy for clinical reconciliation', async () => {
    const snapReq = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapRes = await snapshotGet(snapReq);
    const snap = await snapRes.json();
    const doc = snap.documents[0];

    const flagReq = new Request('http://localhost/api/v1/patient-portal/flags', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: doc.id,
        fieldName: 'date',
        patientReason: 'The scan date appears to be from September, not October.',
      }),
    });
    const flagRes = await flagsPost(flagReq);
    expect(flagRes.status).toBe(201);
    const flagBody = await flagRes.json();
    expect(flagBody.flagId).toBeTruthy();
    expect(flagBody.status).toBe('open');
  });

  it('Step 14-15: Clinician continuity message visibility (only approved messages delivered)', async () => {
    const snapReq = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapRes = await snapshotGet(snapReq);
    const snap = await snapRes.json();
    expect(Array.isArray(snap.continuityMessages)).toBe(true);

    // Each visible continuity message must be clinician-approved
    for (const msg of snap.continuityMessages) {
      expect(msg.body).toBeTruthy();
      expect(msg.approvedAt).toBeTruthy();
    }
  });

  it('Step 16-19: Patient caregiver consent authorization and revocation', async () => {
    // 16. Authorize caregiver
    const cgReq = new Request('http://localhost/api/v1/patient-portal/caregivers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Ramesh Sundaram',
        relationship: 'Spouse',
        phoneNumber: '+919876543210',
        syncReminders: true,
      }),
    });
    const cgRes = await caregiversPost(cgReq);
    expect(cgRes.status).toBe(201);
    const cgBody = await cgRes.json();
    const caregiverId = cgBody.caregiver.id;
    expect(caregiverId).toBeTruthy();

    // 17. Verify caregiver appears in active list
    const listReq = new Request('http://localhost/api/v1/patient-portal/caregivers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listRes = await caregiversGet(listReq);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const active = listBody.caregivers.find((c: any) => c.id === caregiverId);
    expect(active).toBeTruthy();
    expect(active.isActive).toBe(true);

    // 18. Patient revokes caregiver consent
    const delReq = new Request(`http://localhost/api/v1/patient-portal/caregivers?caregiverId=${caregiverId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const delRes = await caregiversDelete(delReq);
    expect(delRes.status).toBe(200);

    // 19. Verify caregiver is inactive
    const afterDelRes = await caregiversGet(listReq);
    const afterDel = await afterDelRes.json();
    const revoked = afterDel.caregivers.find((c: any) => c.id === caregiverId);
    expect(revoked === undefined || revoked.isActive === false).toBe(true);
  });

  it('Step 20: Audit trail and evidence ledger consistency', async () => {
    const snapReq = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const snapRes = await snapshotGet(snapReq);
    const snap = await snapRes.json();

    // Evidence ledger facts are intact and source-anchored
    expect(snap.timeline.length).toBeGreaterThan(0);
    for (const item of snap.timeline) {
      expect(item.quote).toBeTruthy();
    }
  });
});
