import { describe, expect, it } from 'vitest';
import {
  validateCandidateProvenance,
  type SpanForValidation,
  type CandidateProvenanceInput,
} from './span-validation';

describe('Layer 2: Two-Stage Candidate Provenance Safety Gate (DOM-01 - DOM-06)', () => {
  const spans: SpanForValidation[] = [
    {
      id: 'span-1',
      documentId: 'doc-1',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: 0,
      text: 'Apollo Cancer Centre - Report Date: 14/05/2026',
      bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.04 },
      ocrConfidence: 0.98,
    },
    {
      id: 'span-2',
      documentId: 'doc-1',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: 1,
      text: 'Blood sample Collected on 14 May 2026',
      bbox: { x: 0.1, y: 0.15, w: 0.8, h: 0.04 },
      ocrConfidence: 0.95,
    },
    {
      id: 'span-3',
      documentId: 'doc-1',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: 2,
      text: 'Hemoglobin: 11.4 g/dL (Reference: 12.0 - 15.0)',
      bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.04 },
      ocrConfidence: 0.92,
    },
    {
      id: 'span-4',
      documentId: 'doc-1',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: 3,
      text: 'Issued by Apollo Cancer Centre',
      bbox: { x: 0.1, y: 0.25, w: 0.8, h: 0.04 },
      ocrConfidence: 0.99,
    },
    {
      id: 'span-low-conf',
      documentId: 'doc-1',
      pageId: 'page-1',
      pageNumber: 1,
      lineIndex: 4,
      text: 'Biopsy confirmed Invasive Ductal Carcinoma',
      bbox: { x: 0.1, y: 0.3, w: 0.8, h: 0.04 },
      ocrConfidence: 0.78, // Low confidence (< 0.85)
    },
  ];

  it('DOM-01: Stage A Quote Mismatch: verbatimQuote not present in linked text_spans', () => {
    const candidate: CandidateProvenanceInput = {
      spanIds: ['span-1'],
      verbatimQuote: 'Completely fabricated text not in span',
      value: '2026-05-14',
    };
    const res = validateCandidateProvenance(candidate, spans);
    expect(res.valid).toBe(false);
    expect(res.stageFailed).toBe('STAGE_A');
  });

  it('DOM-02: Stage B Hallucinated Date: Quote says "Report Date: 14/05/2026", candidate value is "2026-09-01"', () => {
    const candidate: CandidateProvenanceInput = {
      spanIds: ['span-1'],
      verbatimQuote: 'Report Date: 14/05/2026',
      value: '2026-09-01', // Hallucinated date
    };
    const res = validateCandidateProvenance(candidate, spans);
    expect(res.valid).toBe(false);
    expect(res.stageFailed).toBe('STAGE_B');
  });

  it('DOM-03: Stage B Localized Date Match: Quote says "Collected on 14 May 2026", candidate value is "2026-05-14"', () => {
    const candidate: CandidateProvenanceInput = {
      spanIds: ['span-2'],
      verbatimQuote: 'Collected on 14 May 2026',
      value: '2026-05-14',
    };
    const res = validateCandidateProvenance(candidate, spans);
    expect(res.valid).toBe(true);
    expect(res.recommendedState).toBe('extracted');
  });

  it('DOM-04: Stage B Lab Value Missing Unit / Wrong Value: Quote says "Hemoglobin: 11.4 g/dL", candidate has value "14.2 g/dL"', () => {
    const candidate: CandidateProvenanceInput = {
      spanIds: ['span-3'],
      verbatimQuote: 'Hemoglobin: 11.4 g/dL',
      value: '14.2 g/dL',
    };
    const res = validateCandidateProvenance(candidate, spans);
    expect(res.valid).toBe(false);
    expect(res.stageFailed).toBe('STAGE_B');
  });

  it('DOM-05: Stage B Facility Hallucination: Quote says "Issued by Apollo Cancer Centre", candidate value is "AIIMS Delhi"', () => {
    const candidate: CandidateProvenanceInput = {
      spanIds: ['span-4'],
      verbatimQuote: 'Issued by Apollo Cancer Centre',
      value: 'AIIMS Delhi',
    };
    const res = validateCandidateProvenance(candidate, spans);
    expect(res.valid).toBe(false);
    expect(res.stageFailed).toBe('STAGE_B');
  });

  it('DOM-06: Low OCR Confidence Routing: Valid Stage A + Stage B, but span ocrConfidence = 0.78', () => {
    const candidate: CandidateProvenanceInput = {
      spanIds: ['span-low-conf'],
      verbatimQuote: 'Biopsy confirmed Invasive Ductal Carcinoma',
      value: 'Invasive Ductal Carcinoma',
    };
    const res = validateCandidateProvenance(candidate, spans);
    expect(res.valid).toBe(true);
    expect(res.recommendedState).toBe('needs_review');
    expect(res.minOcrConfidence).toBe(0.78);
  });
});
