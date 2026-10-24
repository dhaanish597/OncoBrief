import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools, getMigratorPool } from '../src/client';
import { seed, type SeedSummary } from '../src/seed';
import { appClientForOrg } from './helpers';
import { searchPatientDocuments, linkDocumentDuplicate } from '../src/services/documents';

let summary: SeedSummary;
let org1: string;
let clinicianId: string;
let p1: string;

async function orgClient(): Promise<Client> {
  return appClientForOrg(org1, clinicianId, 'clinician');
}

beforeAll(async () => {
  summary = await seed();
  org1 = summary.orgs[0]!;
  p1 = summary.patients[0]!;
  const clinCred = summary.credentials.find((c) => c.role === 'clinician')!;
  const pool = getMigratorPool();
  const userRes = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE email = $1`,
    [clinCred.email],
  );
  clinicianId = userRes.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Task 2.3 — Document Search and Linking', () => {
  it('searches patient documents by name, facility, or empty query', async () => {
    const c = await orgClient();
    try {
      // 1. Search all documents for patient
      const allDocs = await searchPatientDocuments(c, {
        orgId: org1,
        patientId: p1,
        query: '',
      });
      expect(allDocs.length).toBeGreaterThan(0);
      expect(allDocs[0]?.id).toBeDefined();
      expect(allDocs[0]?.sha256Hex).toBeDefined();

      // 2. Search specific document by name
      const queryMatch = await searchPatientDocuments(c, {
        orgId: org1,
        patientId: p1,
        query: 'cbc',
      });
      expect(queryMatch.length).toBeGreaterThan(0);
      expect(queryMatch.some((d) => d.filename.toLowerCase().includes('cbc'))).toBe(true);
    } finally {
      await c.end();
    }
  });

  it('links and unlinks a duplicate document with audit trails', async () => {
    const c = await orgClient();
    try {
      const allDocs = await searchPatientDocuments(c, {
        orgId: org1,
        patientId: p1,
        query: '',
      });
      expect(allDocs.length).toBeGreaterThanOrEqual(2);
      const targetDoc = allDocs[0]!;
      const dupDoc = allDocs[1]!;

      // Link as duplicate
      await linkDocumentDuplicate(c, {
        orgId: org1,
        patientId: p1,
        documentId: dupDoc.id,
        targetDocumentId: targetDoc.id,
        action: 'link_duplicate',
        userId: clinicianId,
      });

      // Verify state in DB
      const check1 = await c.query<{ duplicate_of_document_id: string; duplicate_status: string }>(
        `SELECT duplicate_of_document_id, duplicate_status FROM document WHERE id = $1`,
        [dupDoc.id],
      );
      expect(check1.rows[0]?.duplicate_of_document_id).toBe(targetDoc.id);
      expect(check1.rows[0]?.duplicate_status).toBe('confirmed_duplicate');

      // Unlink
      await linkDocumentDuplicate(c, {
        orgId: org1,
        patientId: p1,
        documentId: dupDoc.id,
        targetDocumentId: null,
        action: 'unlink',
        userId: clinicianId,
      });

      const check2 = await c.query<{ duplicate_of_document_id: string | null; duplicate_status: string }>(
        `SELECT duplicate_of_document_id, duplicate_status FROM document WHERE id = $1`,
        [dupDoc.id],
      );
      expect(check2.rows[0]?.duplicate_of_document_id).toBeNull();
      expect(check2.rows[0]?.duplicate_status).toBe('none');
    } finally {
      await c.end();
    }
  });

  it('enforces tenant and patient isolation on document linking', async () => {
    const c = await orgClient();
    try {
      const p2 = summary.patients[1]!;
      const docsP1 = await searchPatientDocuments(c, {
        orgId: org1,
        patientId: p1,
        query: '',
      });
      const docsP2 = await searchPatientDocuments(c, {
        orgId: org1,
        patientId: p2,
        query: '',
      });
      expect(docsP1[0]).toBeDefined();
      expect(docsP2[0]).toBeDefined();

      // Attempting to link P2 document as duplicate of P1 document under P1 session fails
      await expect(
        linkDocumentDuplicate(c, {
          orgId: org1,
          patientId: p1,
          documentId: docsP2[0]!.id,
          targetDocumentId: docsP1[0]!.id,
          action: 'link_duplicate',
          userId: clinicianId,
        }),
      ).rejects.toThrow('document_not_found_or_unauthorized');
    } finally {
      await c.end();
    }
  });
});
