import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { POST, DELETE } from './route';

let fx: Fixtures;
let demo1Token: string;
let demo1DocId: string;
let demo2DocId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  await withTenantClient(
    { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
    async (q) => {
      const d1 = await q.query<{ id: string }>(
        'SELECT id FROM document WHERE patient_id = $1 AND org_id = $2 LIMIT 1',
        [fx.patients.demo1, fx.org1],
      );
      demo1DocId = d1.rows[0]!.id;

      const d2 = await q.query<{ id: string }>(
        'SELECT id FROM document WHERE patient_id = $1 AND org_id = $2 LIMIT 1',
        [fx.patients.demo2, fx.org1],
      );
      demo2DocId = d2.rows[0]!.id;
    },
  );

  const sess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['documents'],
  });
  demo1Token = sess.token;
}, 120_000);

describe('MOB-011: Time-Bounded & Revocable Share Grants API (/api/v1/patient-portal/shares)', () => {
  const reqShares = (method: string, token: string | undefined, body?: unknown, url = 'http://localhost/api/v1/patient-portal/shares') =>
    new Request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(
      reqShares('POST', undefined, {
        recipientLabel: 'Second Opinion',
        recipientRole: 'second_opinion_clinician',
        sharedDocumentIds: [demo1DocId],
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects attempt to share another patient document with 404/403 (SEC-NEG-06 / IDOR)', async () => {
    const res = await POST(
      reqShares('POST', demo1Token, {
        recipientLabel: 'Unauthorized Document Share',
        recipientRole: 'second_opinion_clinician',
        sharedDocumentIds: [demo2DocId],
      }),
    );
    expect([400, 403, 404]).toContain(res.status);
    const body = await res.json();
    expect(body.error.code).toMatch(/invalid_document|not_found|unauthorized/);
  });

  let createdGrantId: string;
  let createdShareToken: string;

  it('successfully creates time-bounded share grant with 72h expiration (REQ-MOB-033)', async () => {
    const res = await POST(
      reqShares('POST', demo1Token, {
        recipientLabel: 'Dr. Rao Oncology Second Opinion',
        recipientRole: 'second_opinion_clinician',
        sharedDocumentIds: [demo1DocId],
        includeQuestions: true,
        expiresInHours: 72,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.grantId).toBeTruthy();
    expect(body.shareToken).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
    expect(body.shareUrl).toContain(body.shareToken);

    createdGrantId = body.grantId;
    createdShareToken = body.shareToken;

    // Verify token hash is stored, never plaintext token (SEC-NEG-03)
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const row = await q.query<{ share_token_sha256: string }>(
          'SELECT share_token_sha256 FROM patient_share_grant WHERE id = $1',
          [createdGrantId],
        );
        expect(row.rows[0]!.share_token_sha256).not.toBe(createdShareToken);
      },
    );
  });

  it('revokes share grant immediately with 200 (REQ-MOB-033)', async () => {
    const res = await DELETE(
      reqShares('DELETE', demo1Token, undefined, `http://localhost/api/v1/patient-portal/shares?id=${createdGrantId}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grantId).toBe(createdGrantId);
    expect(body.revoked).toBe(true);

    // Verify revoked_at in database
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const row = await q.query<{ revoked_at: Date | null }>(
          'SELECT revoked_at FROM patient_share_grant WHERE id = $1',
          [createdGrantId],
        );
        expect(row.rows[0]!.revoked_at).not.toBeNull();
      },
    );
  });
});
