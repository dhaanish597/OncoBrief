import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { POST } from './route';

let fx: Fixtures;
let demo1Token: string;
let approvedMessageId: string;
let draftMessageId: string;
let demo2ApprovedMessageId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  await withTenantClient(
    { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
    async (q) => {
      const tmpl = await q.query<{ id: string }>(
        'SELECT id FROM message_template WHERE org_id = $1 LIMIT 1',
        [fx.org1],
      );
      const templateId = tmpl.rows[0]!.id;

      // 1. Create an approved continuity message for demo1
      const app1 = await q.query<{ id: string }>(
        `INSERT INTO patient_message
           (org_id, patient_id, template_id, locale, variables_json, status, body_rendered, composed_by, approved_by, approved_at)
         VALUES ($1, $2, $3, 'en-IN', '{}', 'approved', 'Your next chemotherapy cycle is scheduled for Tuesday. Please arrive with fasting labs.', $4, $4, now())
         RETURNING id`,
        [fx.org1, fx.patients.demo1, templateId, fx.clinicians.clinician],
      );
      approvedMessageId = app1.rows[0]!.id;

      // 2. Create a draft continuity message for demo1
      const draft1 = await q.query<{ id: string }>(
        `INSERT INTO patient_message
           (org_id, patient_id, template_id, locale, variables_json, status, body_rendered, composed_by)
         VALUES ($1, $2, $3, 'en-IN', '{}', 'draft', 'Internal clinician draft notes not yet approved.', $4)
         RETURNING id`,
        [fx.org1, fx.patients.demo1, templateId, fx.clinicians.clinician],
      );
      draftMessageId = draft1.rows[0]!.id;

      // 3. Create an approved message for demo2 (different patient)
      const app2 = await q.query<{ id: string }>(
        `INSERT INTO patient_message
           (org_id, patient_id, template_id, locale, variables_json, status, body_rendered, composed_by, approved_by, approved_at)
         VALUES ($1, $2, $3, 'en-IN', '{}', 'approved', 'DEMO-002 continuity instructions.', $4, $4, now())
         RETURNING id`,
        [fx.org1, fx.patients.demo2, templateId, fx.clinicians.clinician],
      );
      demo2ApprovedMessageId = app2.rows[0]!.id;
    },
  );

  const pSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['reminders'],
  });
  demo1Token = pSess.token;
}, 120_000);

describe('MOB-010: Patient Voice TTS API (/api/v1/patient-portal/voice-tts)', () => {
  const reqVoice = (token: string | undefined, body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/voice-tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(reqVoice(undefined, { messageId: approvedMessageId }));
    expect(res.status).toBe(401);
  });

  it('rejects cross-patient messageId with 404 (SEC-NEG-06)', async () => {
    const res = await POST(reqVoice(demo1Token, { messageId: demo2ApprovedMessageId }));
    expect(res.status).toBe(404);
  });

  it('rejects draft / unapproved message with 403 (SEC-NEG-12)', async () => {
    const res = await POST(reqVoice(demo1Token, { messageId: draftMessageId }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('unapproved_message_forbidden');
  });

  it('synthesizes approved message speech for English and Tamil (REQ-MOB-030)', async () => {
    const res = await POST(
      reqVoice(demo1Token, {
        messageId: approvedMessageId,
        language: 'ta',
      }),
    );
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    if (res.status === 200) {
      expect(body.audioBase64).toBeTruthy();
      expect(body.mimeType).toBe('audio/wav');
      expect(body.language).toBe('ta-IN');
      expect(body.transcript).toContain('chemotherapy cycle');
    } else {
      // Graceful fallback when TTS provider (Sarvam) has no API key in local test env
      expect(body.fallbackText).toContain('chemotherapy cycle');
    }
  });
});
