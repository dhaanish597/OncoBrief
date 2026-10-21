import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getMigratorPool } from '../client';
import { getStorage } from '../container';
import { createDocument, ingestDocument } from '../services/documents';
import { getDocument, getPageSpans, getProvenance } from '../services/patients';
import { LocalMultimodalOcrAdapter, RuleBasedExtractor } from '@oncobrief/adapters';

describe('P0 & P1 Regression: Document Identity, Extraction, and Span Alignment', () => {
  it('P0: Real CBC Upload (02_CBC_with_Differential_02_Jun_2026_DEMO.pdf) extracts genuine text and facts without cross-association', async () => {
    const client = await getMigratorPool().connect();
    try {
      // 1. Load real CBC demo PDF
      const fixturePath = path.resolve(
        __dirname,
        '../../../../packages/adapters/src/__tests__/fixtures/02_CBC_with_Differential_02_Jun_2026_DEMO.pdf',
      );
      const bytes = fs.readFileSync(fixturePath);

      // Verify SHA-256 starts with 5b8c3be7f550ba59
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      expect(sha256.startsWith('5b8c3be7f550ba59')).toBe(true);

      // Find an existing demo patient
      const patientRes = await client.query<{ id: string; org_id: string }>(
        "SELECT id, org_id FROM patient WHERE demo_code = 'DEMO-001' LIMIT 1",
      );
      expect(patientRes.rows.length).toBe(1);
      const { id: patientId, org_id: orgId } = patientRes.rows[0]!;

      // 2. Create document via service
      const storage = getStorage();
      const userRes = await client.query<{ id: string }>('SELECT id FROM app_user LIMIT 1');
      const userId = userRes.rows[0]!.id;

      const { documentId } = await createDocument(client, storage, {
        orgId,
        patientId,
        uploadedBy: userId,
        filename: '02_CBC_with_Differential_02_Jun_2026_DEMO.pdf',
        mimeType: 'application/pdf',
        content: bytes,
        sourceKind: 'upload',
      });

      // 3. Ingest document with real LocalMultimodalOcrAdapter
      const deps = {
        storage,
        ocr: new LocalMultimodalOcrAdapter(),
        extractor: new RuleBasedExtractor(),
      };

      const result = await ingestDocument(client, deps, documentId);
      expect(result.status).toBe('ready');
      expect(result.pages).toBe(1);
      expect(result.spans).toBeGreaterThanOrEqual(8);
      expect(result.promoted).toBeGreaterThanOrEqual(4);

      // 4. Verify authoritative database record
      const doc = await getDocument(client, patientId, documentId);
      expect(doc).not.toBeNull();
      expect(doc?.ingestStatus).toBe('ready');
      expect(doc?.ingestError).toBeNull();
      expect(doc?.pageCount).toBe(1);
      expect(doc?.contentSha256.startsWith('5b8c3be7f550ba59')).toBe(true);

      // 5. Verify page text contains Sunita Sharma and lab rows
      const page = await getPageSpans(client, documentId, 1);
      expect(page).not.toBeNull();
      expect(page?.plainText).toContain('Sunita Sharma');
      expect(page?.plainText).toContain('02 June 2026');
      expect(page?.plainText).toContain('Hemoglobin (Hb)');
      expect(page?.plainText).toContain('11.4');
      expect(page?.plainText).toContain('Total Leukocyte Count (WLC)');
      expect(page?.plainText).toContain('7,200');
      expect(page?.plainText).toContain('Platelet Count');
      expect(page?.plainText).toContain('240,000');

      // 6. Verify facts strictly belong to this document (no cross-contamination)
      const factsRes = await client.query<{
        id: string;
        document_id: string;
        fact_type: string;
        verbatim_quote: string;
      }>('SELECT id, document_id, fact_type, verbatim_quote FROM evidence_fact WHERE document_id = $1', [
        documentId,
      ]);
      expect(factsRes.rows.length).toBeGreaterThanOrEqual(4);
      for (const fact of factsRes.rows) {
        expect(fact.document_id).toBe(documentId);
        const prov = await getProvenance(client, fact.id);
        expect(prov).not.toBeNull();
        expect(prov?.fact.documentId).toBe(documentId);
        expect(prov?.fact.documentName).toBe('02_CBC_with_Differential_02_Jun_2026_DEMO.pdf');
        // Prove spans belong to page of this document
        for (const s of prov?.spans ?? []) {
          expect(s.pageId).toBe(page?.pageId);
          expect(page?.plainText).toContain(prov?.fact.verbatimQuote ?? '');
        }
      }
    } finally {
      client.release();
    }
  });

  it('P1: Appointment Letter Span Alignment: "Regional Cancer Institute" links strictly to span 0 without shifting over Date/MRN', async () => {
    const client = await getMigratorPool().connect();
    try {
      const docRes = await client.query<{ id: string }>(
        "SELECT id FROM document WHERE original_filename = 'appointment-letter.pdf' LIMIT 1",
      );
      if (docRes.rows.length === 0) return;
      const documentId = docRes.rows[0]!.id;

      const spansRes = await client.query<{
        id: string;
        span_index: number;
        text: string;
        bbox_x: number;
        bbox_y: number;
        bbox_w: number;
        bbox_h: number;
      }>('SELECT id, span_index, text, bbox_x, bbox_y, bbox_w, bbox_h FROM text_span WHERE document_id = $1 ORDER BY span_index', [
        documentId,
      ]);

      const spans = spansRes.rows;
      expect(spans.length).toBeGreaterThanOrEqual(4);

      // Span 0 must be Regional Cancer Institute
      expect(spans[0]?.text).toBe('Regional Cancer Institute');
      expect(spans[0]?.span_index).toBe(0);
      expect(spans[0]?.bbox_y).toBeLessThan(0.08); // Near top (0.04)

      // Span 2 is Date
      expect(spans[2]?.text).toContain('Date: 30 July 2025');
      expect(spans[2]?.bbox_y).toBeGreaterThan(spans[0]?.bbox_y ?? 0);

      // Span 3 is MRN
      expect(spans[3]?.text).toContain('MRN: RCI-2025-0031');
      expect(spans[3]?.bbox_y).toBeGreaterThan(spans[2]?.bbox_y ?? 0);

      // Verify evidence fact linking for issuing facility
      const facilityFact = await client.query<{ id: string; verbatim_quote: string }>(
        "SELECT id, verbatim_quote FROM evidence_fact WHERE document_id = $1 AND fact_type = 'document.issuing_facility'",
        [documentId],
      );
      expect(facilityFact.rows.length).toBe(1);
      const prov = await getProvenance(client, facilityFact.rows[0]!.id);

      expect(prov?.spans.length).toBe(1);
      expect(prov?.spans[0]?.text).toBe('Regional Cancer Institute');
      expect(prov?.spans[0]?.id).toBe(spans[0]?.id);
      expect(prov?.spans[0]?.bbox.y).toBe(spans[0]?.bbox_y);

      // Coordinate bounds are strictly normalized [0..1]
      expect(prov?.spans[0]?.bbox.x).toBeGreaterThanOrEqual(0);
      expect(prov?.spans[0]?.bbox.x).toBeLessThanOrEqual(1);
      expect(prov?.spans[0]?.bbox.y).toBeGreaterThanOrEqual(0);
      expect(prov?.spans[0]?.bbox.y).toBeLessThanOrEqual(1);
      expect(prov?.spans[0]?.bbox.w).toBeGreaterThan(0);
      expect(prov?.spans[0]?.bbox.h).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });
});
