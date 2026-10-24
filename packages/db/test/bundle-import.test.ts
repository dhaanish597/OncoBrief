import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools, getMigratorPool } from '../src/client';
import { seed, type SeedSummary } from '../src/seed';
import { appClientForOrg } from './helpers';
import { createDocument, ingestDocument } from '../src/services/documents';
import {
  createTataMemorialDiagnosticBundle,
  createAiimsMCodeBundle,
  validateFhirBundle,
} from '@oncobrief/domain';
import { LocalMultimodalOcrAdapter, RuleBasedExtractor } from '@oncobrief/adapters';
import { getStorage } from '../src/container';

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

describe('Task 2.3 — FHIR Bundle Ingestion and Ledger Anchoring', () => {
  it('validates and ingests a standard NRCeS ABDM v6.5.0 bundle from Tata Memorial', async () => {
    const c = await orgClient();
    try {
      const bundle = createTataMemorialDiagnosticBundle(p1);
      const validation = validateFhirBundle(bundle);
      expect(validation.valid).toBe(true);
      expect(validation.bundleType).toBe('abdm_v650');

      const storage = getStorage();
      const content = Buffer.from(JSON.stringify(bundle, null, 2), 'utf8');

      const { documentId } = await createDocument(c, storage, {
        orgId: org1,
        patientId: p1,
        uploadedBy: clinicianId,
        filename: 'Tata_Memorial_ACTREC_Diagnostic_Bundle.json',
        mimeType: 'application/fhir+json',
        content,
        sourceKind: 'fhir_document',
        issuingFacility: 'Tata Memorial Hospital & ACTREC',
        recordOrigin: 'external_hospital',
      });

      expect(documentId).toBeDefined();

      const ocr = new LocalMultimodalOcrAdapter();
      const extractor = new RuleBasedExtractor();
      const result = await ingestDocument(c, { storage, ocr, extractor }, documentId);

      expect(result.status).toBe('ready');
      expect(result.pages).toBe(1);
      expect(result.promoted).toBeGreaterThanOrEqual(1);

      // Verify facts anchored in DB
      const facts = await c.query<{ fact_type: string; verbatim_quote: string }>(
        `SELECT fact_type, verbatim_quote FROM evidence_fact WHERE document_id = $1`,
        [documentId],
      );
      expect(facts.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await c.end();
    }
  });

  it('validates and ingests an HL7 mCODE STU4 oncology bundle from AIIMS', async () => {
    const c = await orgClient();
    try {
      const bundle = createAiimsMCodeBundle(p1);
      const validation = validateFhirBundle(bundle);
      expect(validation.valid).toBe(true);
      expect(validation.bundleType).toBe('mcode_stu4');

      const storage = getStorage();
      const content = Buffer.from(JSON.stringify(bundle, null, 2), 'utf8');

      const { documentId } = await createDocument(c, storage, {
        orgId: org1,
        patientId: p1,
        uploadedBy: clinicianId,
        filename: 'AIIMS_New_Delhi_mCODE_Bundle.json',
        mimeType: 'application/fhir+json',
        content,
        sourceKind: 'fhir_document',
        issuingFacility: 'All India Institute of Medical Sciences Hospital',
        recordOrigin: 'external_hospital',
      });

      expect(documentId).toBeDefined();

      const ocr = new LocalMultimodalOcrAdapter();
      const extractor = new RuleBasedExtractor();
      const result = await ingestDocument(c, { storage, ocr, extractor }, documentId);

      expect(result.status).toBe('ready');
      expect(result.promoted).toBeGreaterThanOrEqual(1);

      const facts = await c.query<{ fact_type: string; verbatim_quote: string }>(
        `SELECT fact_type, verbatim_quote FROM evidence_fact WHERE document_id = $1`,
        [documentId],
      );
      expect(facts.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await c.end();
    }
  });

  it('rejects invalid bundles before ingestion', () => {
    const invalidObj = { resourceType: 'NotABundle', data: [] };
    const validation = validateFhirBundle(invalidObj);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Invalid resourceType');
  });
});
