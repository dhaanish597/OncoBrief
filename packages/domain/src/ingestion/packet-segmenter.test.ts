import { describe, expect, it } from 'vitest';
import { segmentDocumentPacket, type OcrPageInput } from './packet-segmenter';

describe('packet-segmenter (Damani et al., 2026)', () => {
  it('DOM-07: splits multi-report packet into 3 sub-documents with accurate bounds, categories and dates', () => {
    const pages: OcrPageInput[] = [
      {
        pageNumber: 1,
        plainText: 'Apollo Cancer Centre\nSURGICAL PATHOLOGY REPORT\nReport Date: 14/05/2026\nPage 1 of 2\nSpecimen: Left Breast Core Biopsy',
      },
      {
        pageNumber: 2,
        plainText: 'Apollo Cancer Centre\nSURGICAL PATHOLOGY REPORT (cont.)\nPage 2 of 2\nDiagnosis: Invasive Ductal Carcinoma',
      },
      {
        pageNumber: 3,
        plainText: 'Tata Memorial Hospital\nCOMPLETE BLOOD COUNT (CBC REPORT)\nDate: 2026-06-01\nPage 1 of 1\nHemoglobin: 11.4 g/dL',
      },
      {
        pageNumber: 4,
        plainText: 'Max Super Speciality Hospital\nDISCHARGE SUMMARY\nAdmission Date: 10/06/2026\nDischarge Date: 15 June 2026\nPage 1 of 3\nPatient admitted for left breast conserving surgery',
      },
      {
        pageNumber: 5,
        plainText: 'Max Super Speciality Hospital\nDISCHARGE SUMMARY (Hospital Course)\nPage 2 of 3\nPost-operative recovery uneventful',
      },
      {
        pageNumber: 6,
        plainText: 'Max Super Speciality Hospital\nDISCHARGE SUMMARY (Discharge Medications)\nPage 3 of 3\nFollow up in OPD after 7 days',
      },
    ];

    const subDocs = segmentDocumentPacket(pages);

    expect(subDocs).toHaveLength(3);

    // Sub-document 1: Pathology (pages 1-2)
    expect(subDocs[0]?.index).toBe(0);
    expect(subDocs[0]?.startPage).toBe(1);
    expect(subDocs[0]?.endPage).toBe(2);
    expect(subDocs[0]?.category).toBe('Pathology');
    expect(subDocs[0]?.statedDate).toBe('2026-05-14');
    expect(subDocs[0]?.statedFacility).toContain('Apollo Cancer Centre');

    // Sub-document 2: CBC Lab (page 3)
    expect(subDocs[1]?.index).toBe(1);
    expect(subDocs[1]?.startPage).toBe(3);
    expect(subDocs[1]?.endPage).toBe(3);
    expect(subDocs[1]?.category).toBe('Laboratory');
    expect(subDocs[1]?.statedDate).toBe('2026-06-01');
    expect(subDocs[1]?.statedFacility).toContain('Tata Memorial Hospital');

    // Sub-document 3: Discharge Summary (pages 4-6)
    expect(subDocs[2]?.index).toBe(2);
    expect(subDocs[2]?.startPage).toBe(4);
    expect(subDocs[2]?.endPage).toBe(6);
    expect(subDocs[2]?.category).toBe('Discharge Summary');
    expect(subDocs[2]?.statedDate).toBe('2026-06-10'); // or 2026-06-15
    expect(subDocs[2]?.statedFacility).toContain('Max Super Speciality Hospital');
  });

  it('handles empty page list gracefully', () => {
    expect(segmentDocumentPacket([])).toEqual([]);
  });

  it('handles single page document', () => {
    const pages: OcrPageInput[] = [
      {
        pageNumber: 1,
        plainText: 'AIIMS Delhi\nPET-CT WHOLE BODY SCAN\nDate: 2026-07-20\nFindings: Normal',
      },
    ];
    const subDocs = segmentDocumentPacket(pages);
    expect(subDocs).toHaveLength(1);
    expect(subDocs[0]?.category).toBe('Imaging');
    expect(subDocs[0]?.startPage).toBe(1);
    expect(subDocs[0]?.endPage).toBe(1);
    expect(subDocs[0]?.statedDate).toBe('2026-07-20');
  });
});
