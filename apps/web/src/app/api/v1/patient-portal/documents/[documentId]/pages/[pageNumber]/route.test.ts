import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { GET } from './route';

let fx: Fixtures;
let demo1Token: string;
let noDocsToken: string;
let demo1DocId: string;
let demo2DocId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // Find a document belonging to DEMO-001
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

  const s1 = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['documents'],
  });
  demo1Token = s1.token;

  const sNoDocs = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['appointments'], // No 'documents' scope
  });
  noDocsToken = sNoDocs.token;
}, 120_000);

describe('MOB-008: Patient Document Page Viewer API (/api/v1/patient-portal/documents/[id]/pages/[page])', () => {
  const reqGet = (token?: string) =>
    new Request('http://localhost/api/v1/patient-portal/documents/any/pages/1', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await GET(reqGet(), {
      params: Promise.resolve({ documentId: demo1DocId, pageNumber: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects session lacking documents scope with 403', async () => {
    const res = await GET(reqGet(noDocsToken), {
      params: Promise.resolve({ documentId: demo1DocId, pageNumber: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects cross-patient document IDOR with 404 (SEC-NEG-06)', async () => {
    // Patient DEMO-001 attempts to view DEMO-002's document
    const res = await GET(reqGet(demo1Token), {
      params: Promise.resolve({ documentId: demo2DocId, pageNumber: '1' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects invalid page number (<1 or non-integer) with 400', async () => {
    const res = await GET(reqGet(demo1Token), {
      params: Promise.resolve({ documentId: demo1DocId, pageNumber: '0' }),
    });
    expect(res.status).toBe(400);
  });

  it('successfully retrieves page spans for own document (REQ-MOB-014)', async () => {
    const res = await GET(reqGet(demo1Token), {
      params: Promise.resolve({ documentId: demo1DocId, pageNumber: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBeDefined();
    expect(body.page.pageNumber).toBe(1);
    expect(Array.isArray(body.page.spans)).toBe(true);
  });
});
