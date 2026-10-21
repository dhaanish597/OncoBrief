import { describe, expect, it, vi } from 'vitest';
import { LocalMultimodalOcrAdapter } from '../local-multimodal-ocr';
import { SarvamVisionOcrAdapter } from '../sarvam-vision-ocr';
import { parseDicomHeader } from '../dicom-header-parser';
import { FixtureOcrAdapter } from '../fixture-ocr';

function makeDicomTag(group: number, element: number, vr: string, value: string): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(element, 2);
  head.write(vr, 4, 2, 'ascii');
  const valBuf = Buffer.from(value, 'utf8');
  head.writeUInt16LE(valBuf.length, 6);
  return Buffer.concat([head, valBuf]);
}

describe('Layer 3: Multi-Modal Adapter & Ingestion Tests', () => {
  it('1. Unseeded PDF Upload (LocalMultimodalOcrAdapter): processes lab table with row grouping and zero FixtureOcr crashes', async () => {
    const localOcr = new LocalMultimodalOcrAdapter();
    const fixtureOcr = new FixtureOcrAdapter();

    // Construct a synthetic PDF with 4-column lab table
    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 200 >> stream
BT
/F1 12 Tf
50 700 Td (Hemoglobin) Tj
120 0 Td (11.4) Tj
80 0 Td (g/dL) Tj
80 0 Td (12.0 - 15.0) Tj
ET
BT
/F1 12 Tf
50 650 Td (Platelet Count) Tj
120 0 Td (180000) Tj
80 0 Td (/mcL) Tj
80 0 Td (150000 - 450000) Tj
ET
endstream
endobj
xref
trailer << /Root 1 0 R >>
%%EOF`;

    const pdfBuffer = Buffer.from(pdfContent, 'latin1');

    // Test LocalMultimodalOcrAdapter
    const res = await localOcr.extract({
      documentId: 'doc-pdf-1',
      pageNumber: 1,
      imageBytes: pdfBuffer,
    });

    expect(res.plainText).toContain('Hemoglobin');
    expect(res.plainText).toContain('11.4');
    expect(res.spans.length).toBeGreaterThan(0);

    // Verify row grouping: Hemoglobin, 11.4, g/dL, 12.0 - 15.0 in the same line span
    const hemoSpan = res.spans.find((s) => s.text.includes('Hemoglobin'));
    expect(hemoSpan).toBeDefined();
    expect(hemoSpan?.text).toContain('11.4');
    expect(hemoSpan?.text).toContain('g/dL');

    // Bounding boxes are normalized 0..1
    expect(hemoSpan?.bbox.x).toBeGreaterThanOrEqual(0);
    expect(hemoSpan?.bbox.x).toBeLessThanOrEqual(1);
    expect(hemoSpan?.bbox.y).toBeGreaterThanOrEqual(0);
    expect(hemoSpan?.bbox.y).toBeLessThanOrEqual(1);

    // Test FixtureOcrAdapter fallback with unseeded PDF: must not crash
    const fixtureFallbackRes = await fixtureOcr.extract({
      documentId: 'doc-pdf-fallback',
      pageNumber: 1,
      imageBytes: pdfBuffer,
    });
    expect(fixtureFallbackRes.plainText).toContain('Hemoglobin');
  });

  it('2. Sarvam Vision >10-Page Batching & TIFF Transcoding: transcode TIFF to PNG, dispatch in 3 batches, and wire params', async () => {
    const calls: Array<{ url: string; language: string; output_format: string; filename: string }> = [];

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const formData = init?.body as FormData;
      const file = formData.get('file') as File;
      const language = String(formData.get('language'));
      const output_format = String(formData.get('output_format'));

      calls.push({
        url: String(url),
        language,
        output_format,
        filename: file.name,
      });

      // Count pages in the sent chunk
      const ab = await file.arrayBuffer();
      const text = Buffer.from(ab).toString('latin1');
      const pageCount = (text.match(/\/Type\s*\/Page\b/g) || []).length || 1;

      const pages = [];
      for (let p = 1; p <= pageCount; p++) {
        pages.push({
          page_num: p,
          width: 800,
          height: 1100,
          blocks: [
            {
              id: `blk-${p}`,
              text: `Page content ${p}`,
              bbox: [0.1, 0.1, 0.9, 0.2] as [number, number, number, number],
              ocr_confidence: 0.96,
            },
          ],
        });
      }

      return new Response(JSON.stringify({ pages }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const sarvamAdapter = new SarvamVisionOcrAdapter({
      apiKey: 'test-sarvam-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
      minIntervalMs: 0,
    });

    // A. Test TIFF transcoding
    const syntheticTiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x01, 0x02, 0x03, 0x04]);
    const trans = sarvamAdapter.transcodeIfNeeded(syntheticTiff, 'image/tiff');
    expect(trans.mimeType).toBe('image/png');
    expect(trans.filename).toBe('transcoded.png');

    // B. Test 23-page PDF batching (10 + 10 + 3)
    let pdf23Pages = `%PDF-1.4\n`;
    for (let i = 1; i <= 23; i++) {
      pdf23Pages += `<< /Type /Page /Id ${i} >>\n`;
    }
    const pdf23Buffer = Buffer.from(pdf23Pages, 'latin1');

    const result = await sarvamAdapter.processDocument(pdf23Buffer, 'application/pdf');

    // 3 batches dispatched
    expect(calls).toHaveLength(3);

    // Verify wire params
    for (const call of calls) {
      expect(call.language).toBe('en-IN');
      expect(call.output_format).toBe('md');
    }

    // Global page numbers map to 1..23
    expect(result.pages).toHaveLength(23);
    expect(result.pages[0]?.pageNumber).toBe(1);
    expect(result.pages[9]?.pageNumber).toBe(10);
    expect(result.pages[10]?.pageNumber).toBe(11);
    expect(result.pages[22]?.pageNumber).toBe(23);
  });

  it('3. DICOM Header Intake: extracts Modality, StudyDate, scrubs PatientName, and flags burnedInPhiWarning', () => {
    // 128 bytes preamble + 'DICM'
    const preamble = Buffer.alloc(128, 0);
    const magic = Buffer.from('DICM', 'ascii');

    // Tags: (0008,0060)="CT", (0008,0020)="20260615", (0010,0010)="Real^Patient", (0028,0301)="YES"
    const tagModality = makeDicomTag(0x0008, 0x0060, 'CS', 'CT');
    const tagDate = makeDicomTag(0x0008, 0x0020, 'DA', '20260615');
    const tagName = makeDicomTag(0x0010, 0x0010, 'PN', 'Real^Patient');
    const tagBurnedIn = makeDicomTag(0x0028, 0x0301, 'CS', 'YES');

    const dicomBuffer = Buffer.concat([preamble, magic, tagModality, tagDate, tagName, tagBurnedIn]);

    const metadata = parseDicomHeader(dicomBuffer);

    expect(metadata.modality).toBe('CT');
    expect(metadata.studyDate).toBe('2026-06-15');
    expect(metadata.patientName).toBe('[REDACTED_PHI]');
    expect(metadata.burnedInPhiWarning).toBe(true);

    expect(metadata.plainText).toContain('Modality: CT');
    expect(metadata.plainText).toContain('Study Date: 2026-06-15');
    expect(metadata.plainText).toContain('Patient: [REDACTED_PHI]');
    expect(metadata.plainText).not.toContain('Real^Patient');
    expect(metadata.plainText).toContain('Burned-In PHI Warning: YES');

    // Check spans generated
    expect(metadata.spans.length).toBeGreaterThan(0);
    for (const span of metadata.spans) {
      expect(span.bbox.x).toBeGreaterThanOrEqual(0);
      expect(span.bbox.x).toBeLessThanOrEqual(1);
      expect(span.bbox.y).toBeGreaterThanOrEqual(0);
      expect(span.bbox.y).toBeLessThanOrEqual(1);
    }
  });

  it('4. FHIR R4 & VCF Non-Interpretive Intake: generates administrative and provenance spans only', async () => {
    const localOcr = new LocalMultimodalOcrAdapter();

    // FHIR Bundle
    const fhirBundle = {
      resourceType: 'Bundle',
      type: 'document',
      id: 'diagnostic-report-bundle-1',
      entry: [
        {
          resource: {
            resourceType: 'DiagnosticReport',
            title: 'Biopsy Pathology Report',
            status: 'final',
          },
        },
      ],
    };
    const fhirBytes = Buffer.from(JSON.stringify(fhirBundle), 'utf8');

    const fhirRes = await localOcr.extract({
      documentId: 'doc-fhir-1',
      pageNumber: 1,
      imageBytes: fhirBytes,
    });

    expect(fhirRes.plainText).toContain('Resource Type: Bundle');
    expect(fhirRes.plainText).toContain('Bundle Type: document');
    expect(fhirRes.plainText).toContain('Biopsy Pathology Report');
    expect(fhirRes.spans.length).toBeGreaterThan(0);

    // VCF / HL7
    const vcfHeader = `##fileformat=VCFv4.2\n##fileDate=20260515\n##source=OncoBriefGenomics\n#CHROM\tPOS\tID\tREF\tALT`;
    const vcfBytes = Buffer.from(vcfHeader, 'utf8');

    const vcfRes = await localOcr.extract({
      documentId: 'doc-vcf-1',
      pageNumber: 1,
      imageBytes: vcfBytes,
    });

    expect(vcfRes.plainText).toContain('##fileformat=VCFv4.2');
    expect(vcfRes.plainText).toContain('##fileDate=20260515');
    expect(vcfRes.plainText).toContain('##source=OncoBriefGenomics');
    expect(vcfRes.spans.length).toBeGreaterThan(0);
  });

  it('5. Real CBC Demo PDF Intake (02_CBC_with_Differential_02_Jun_2026_DEMO.pdf): extracts Sunita Sharma, date, and lab rows with correct SHA-256', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const crypto = await import('node:crypto');

    const fixturePath = path.resolve(__dirname, 'fixtures/02_CBC_with_Differential_02_Jun_2026_DEMO.pdf');
    const bytes = fs.readFileSync(fixturePath);

    // Verify SHA-256 matches verified facts
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(sha256.startsWith('5b8c3be7f550ba59')).toBe(true);

    const localOcr = new LocalMultimodalOcrAdapter();
    const res = await localOcr.extract({
      documentId: 'doc-cbc-sunita-demo',
      pageNumber: 1,
      imageBytes: bytes,
    });

    expect(res.plainText).toContain('Sunita Sharma');
    expect(res.plainText).toContain('02 June 2026');
    expect(res.plainText).toContain('Hemoglobin (Hb)');
    expect(res.plainText).toContain('11.4');
    expect(res.plainText).toContain('Total Leukocyte Count (WLC)');
    expect(res.plainText).toContain('7,200');
    expect(res.plainText).toContain('Platelet Count');
    expect(res.plainText).toContain('240,000');

    // Verify spans exist and have normalized coordinates
    expect(res.spans.length).toBeGreaterThanOrEqual(8);
    for (const span of res.spans) {
      expect(span.bbox.x).toBeGreaterThanOrEqual(0);
      expect(span.bbox.x).toBeLessThanOrEqual(1);
      expect(span.bbox.y).toBeGreaterThanOrEqual(0);
      expect(span.bbox.y).toBeLessThanOrEqual(1);
      expect(span.bbox.w).toBeGreaterThan(0);
      expect(span.bbox.h).toBeGreaterThan(0);
    }
  });
});
