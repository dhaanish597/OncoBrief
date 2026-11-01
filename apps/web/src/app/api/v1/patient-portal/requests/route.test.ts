import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { GET, POST } from './route';

let fx: Fixtures;
let demo1Token: string;

beforeAll(async () => {
  fx = await setupFixtures();

  const sess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['appointments', 'reminders', 'documents', 'preparation'],
  });
  demo1Token = sess.token;
}, 120_000);

describe('MOB-011: Coordinator Administrative Requests API (/api/v1/patient-portal/requests)', () => {
  const reqRequests = (method: string, token: string | undefined, body?: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/requests', {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(reqRequests('POST', undefined, { title: 'Need certificate' }));
    expect(res.status).toBe(401);
  });

  it('rejects clinical boundary violation with 422', async () => {
    const res = await POST(
      reqRequests('POST', demo1Token, {
        title: 'Please diagnose my stage 4 pain risk_score immediately',
        detail: 'Need chemotherapy dosage adjustment',
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('clinical_boundary_violation');
  });

  let createdRequestId: string;

  it('successfully creates an administrative coordinator request (REQ-MOB-027)', async () => {
    const res = await POST(
      reqRequests('POST', demo1Token, {
        title: 'Medical certificate for employer leave',
        category: 'administrative',
        detail: 'Need signed treatment dates from last cycle for HR verification.',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requestId).toBeTruthy();
    expect(body.title).toBe('Medical certificate for employer leave');
    expect(body.status).toBe('open');
    createdRequestId = body.requestId;

    // Verify task row in database
    await withTenantClient(
      { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
      async (q) => {
        const t = await q.query<{ id: string; status: string; detail: string }>(
          'SELECT id, status, detail FROM admin_task WHERE id = $1',
          [createdRequestId],
        );
        expect(t.rows.length).toBe(1);
        expect(t.rows[0]!.status).toBe('open');
        expect(t.rows[0]!.detail).toContain('HR verification');
      },
    );
  });

  it('lists existing coordinator requests for patient (GET)', async () => {
    const res = await GET(reqRequests('GET', demo1Token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.requests)).toBe(true);
    expect(body.requests.some((r: { id: string }) => r.id === createdRequestId)).toBe(true);
  });
});
