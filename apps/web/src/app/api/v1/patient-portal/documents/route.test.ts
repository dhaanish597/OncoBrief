import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import { createPatientPortalSession } from '@oncobrief/db';
import { POST } from './route';

let fx: Fixtures;
let patientToken: string;

beforeAll(async () => {
  fx = await setupFixtures();

  const sess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['documents'],
  });
  patientToken = sess.token;
}, 120_000);

describe('MOB-009: Patient Document Upload API (/api/v1/patient-portal/documents)', () => {
  const reqUpload = (token: string | undefined, body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(reqUpload(undefined, { filename: 'test.pdf' }));
    expect(res.status).toBe(401);
  });

  it('rejects payload > 10 MB with 413 (SEC-NEG-09)', async () => {
    // 11 MB base64 payload
    const bigContent = 'A'.repeat(11 * 1024 * 1024);
    const res = await POST(
      reqUpload(patientToken, {
        filename: 'huge.pdf',
        contentBase64: Buffer.from(bigContent).toString('base64'),
      }),
    );
    expect(res.status).toBe(413);
  });

  it('rejects spoofed MIME magic bytes with 415 (SEC-NEG-08)', async () => {
    // Content is HTML script tag, not PDF
    const fakePdf = '<html><script>alert(1)</script></html>';
    const res = await POST(
      reqUpload(patientToken, {
        filename: 'malicious.pdf',
        contentBase64: Buffer.from(fakePdf).toString('base64'),
      }),
    );
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe('unsupported_media_type');
  });

  it('successfully uploads valid PDF report with 201 (REQ-MOB-015)', async () => {
    const validPdfBytes = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
    const res = await POST(
      reqUpload(patientToken, {
        filename: 'external_lab.pdf',
        contentBase64: Buffer.from(validPdfBytes).toString('base64'),
        documentDate: '2026-03-01',
        issuingFacility: 'City Diagnostic Labs',
      }),
    );
    const body = await res.json();
    console.log('TEST 4 RES:', res.status, body);
    expect(res.status).toBe(201);
    expect(body.documentId).toBeTruthy();
    expect(body.clinicianStatus).toBe('pending_clinician_review');
    expect(body.mimeType).toBe('application/pdf');
  });

  it('rejects duplicate SHA-256 upload with 409 (SEC-NEG-19)', async () => {
    const validPdfBytes = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
    const res = await POST(
      reqUpload(patientToken, {
        filename: 'duplicate_attempt.pdf',
        contentBase64: Buffer.from(validPdfBytes).toString('base64'),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('duplicate_document');
  });
});
