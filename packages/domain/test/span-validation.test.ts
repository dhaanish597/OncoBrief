import { describe, expect, it } from 'vitest';
import {
  normalizeForComparison,
  validateSpans,
  validateCandidateProvenance,
  type SpanForValidation,
} from '../src/index';

const DOC = 'doc-1';
const PAGE = 'page-1';

function span(id: string, text: string, page = PAGE, doc = DOC): SpanForValidation {
  return { id, documentId: doc, pageId: page, text };
}

describe('normalizeForComparison', () => {
  it('collapses whitespace', () => {
    expect(normalizeForComparison('  Post   operative\n\nnote ')).toBe('Post operative note');
  });

  it('unifies dash variants', () => {
    expect(normalizeForComparison('2023\u20132024')).toBe('2023-2024');
    expect(normalizeForComparison('2023\u20142024')).toBe('2023-2024');
  });

  it('unifies curly quotes', () => {
    expect(normalizeForComparison('\u201Cfollow-up\u201D')).toBe('"follow-up"');
  });

  it('applies NFKC so compatibility variants fold', () => {
    expect(normalizeForComparison('\uFB01ne needle')).toBe('fine needle');
  });
});

describe('validateSpans', () => {
  it('accepts an exact substring', () => {
    const r = validateSpans('Needle biopsy', [span('s1', 'US guided Needle biopsy of right breast performed.')]);
    expect(r.ok).toBe(true);
  });

  it('accepts across whitespace and dash differences', () => {
    // quote has a non-breaking hyphen and collapsed spaces; span has ASCII.
    const r = validateSpans('Needle   biopsy  Follow\u2011up', [
      span('s1', 'Needle biopsy Follow-up documented.'),
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects a dash difference that changes the token structure', () => {
    // '12–June-2023' and '12 June 2023' normalise differently; the checker
    // must not paper over a structural difference.
    const r = validateSpans('12\u2013June-2023', [
      span('s1', 'Surgery completed on 12 June 2023 at 09:00.'),
    ]);
    expect(r.ok).toBe(false);
  });

  it('accepts a multi-span concatenation', () => {
    const r = validateSpans('Cycle 3 chemotherapy on 14 Aug', [
      span('s1', 'Cycle 3 chemotherapy'),
      span('s2', 'on 14 Aug 2023'),
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects a fabricated quote with span_mismatch', () => {
    const r = validateSpans('Patient has metastatic disease', [
      span('s1', 'Patient reviewed in the outpatient department.'),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('span_mismatch');
  });

  it('rejects a cross-page link', () => {
    const r = validateSpans('some text', [span('s1', 'some text', 'page-1'), span('s2', 'more', 'page-2')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('cross_page');
  });

  it('rejects a cross-document link', () => {
    const r = validateSpans('some text', [span('s1', 'some text', PAGE, DOC), span('s2', 'more', PAGE, 'doc-2')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('cross_document');
  });

  it('rejects an empty quote', () => {
    const r = validateSpans('   ', [span('s1', 'anything')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('empty_quote');
  });

  it('rejects no spans', () => {
    const r = validateSpans('anything', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_spans');
  });

  it('rejects a plausible-but-absent number', () => {
    const r = validateSpans('CA 15-3 was 42', [span('s1', 'CA 15-3 was 32 U/mL')]);
    expect(r.ok).toBe(false);
  });
});

describe('validateCandidateProvenance — TASK-02.04 Stage A + Stage B Safety Gate', () => {
  const spans: SpanForValidation[] = [
    {
      id: 'span-date',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Report Date: 14/05/2025',
      ocrConfidence: 0.95,
      bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-appt',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Next Follow-up Appointment on 22/05/2025 at Medical Oncology OPD',
      ocrConfidence: 0.92,
      bbox: { x: 0.1, y: 0.15, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-lab',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Hemoglobin: 11.2 g/dL (Reference: 12.0 - 15.0)',
      ocrConfidence: 0.94,
      bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-id',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'MRN: RCI-7781',
      ocrConfidence: 0.96,
      bbox: { x: 0.1, y: 0.25, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-med',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Rx: Tamoxifen 20 mg PO daily for 5 years',
      ocrConfidence: 0.91,
      bbox: { x: 0.1, y: 0.3, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-proc',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Procedure: Modified radical mastectomy performed under GA',
      ocrConfidence: 0.93,
      bbox: { x: 0.1, y: 0.35, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-fac',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Issuing Centre: Tata Memorial Hospital, Mumbai',
      ocrConfidence: 0.97,
      bbox: { x: 0.1, y: 0.4, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-cycle',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Chemotherapy Cycle 3 Day 1 Administered',
      ocrConfidence: 0.92,
      bbox: { x: 0.1, y: 0.45, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-text',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Histological Diagnosis: Invasive ductal carcinoma Grade 2',
      ocrConfidence: 0.95,
      bbox: { x: 0.1, y: 0.5, w: 0.8, h: 0.05 },
    },
    {
      id: 'span-low-conf',
      documentId: DOC,
      pageId: PAGE,
      pageNumber: 1,
      text: 'Platelets: 185000 /uL',
      ocrConfidence: 0.72, // Below 0.85 threshold
      bbox: { x: 0.1, y: 0.55, w: 0.8, h: 0.05 },
    },
  ];

  it('validates and entails kind: "date"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'document.date',
        value: { kind: 'date', date: '2025-05-14' },
        verbatimQuote: '14/05/2025',
        spanIds: ['span-date'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'document.date',
        value: { kind: 'date', date: '2026-12-31' },
        verbatimQuote: '14/05/2025',
        spanIds: ['span-date'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "appointment"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'appointment.recorded',
        value: { kind: 'appointment', date: '2025-05-22' },
        verbatimQuote: 'Next Follow-up Appointment on 22/05/2025',
        spanIds: ['span-appt'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'appointment.recorded',
        value: { kind: 'appointment', date: '2026-01-01' },
        verbatimQuote: 'Next Follow-up Appointment on 22/05/2025',
        spanIds: ['span-appt'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "lab"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'lab_result.as_written',
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '11.2', unitText: 'g/dL' },
        verbatimQuote: 'Hemoglobin: 11.2 g/dL',
        spanIds: ['span-lab'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'lab_result.as_written',
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '6.2', unitText: 'g/dL' },
        verbatimQuote: 'Hemoglobin: 11.2 g/dL',
        spanIds: ['span-lab'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "identifier"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'identifier.mrn',
        value: { kind: 'identifier', system: 'mrn', value: 'RCI-7781' },
        verbatimQuote: 'MRN: RCI-7781',
        spanIds: ['span-id'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'identifier.mrn',
        value: { kind: 'identifier', system: 'mrn', value: 'XYZ-9999' },
        verbatimQuote: 'MRN: RCI-7781',
        spanIds: ['span-id'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "medication"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'medication.recorded',
        value: { kind: 'medication', name: 'Tamoxifen', doseText: '20 mg' },
        verbatimQuote: 'Tamoxifen 20 mg PO daily',
        spanIds: ['span-med'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'medication.recorded',
        value: { kind: 'medication', name: 'Cisplatin' },
        verbatimQuote: 'Tamoxifen 20 mg PO daily',
        spanIds: ['span-med'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "procedure"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'procedure.recorded',
        value: { kind: 'procedure', name: 'Mastectomy' },
        verbatimQuote: 'Modified radical mastectomy performed',
        spanIds: ['span-proc'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'procedure.recorded',
        value: { kind: 'procedure', name: 'Chemotherapy' },
        verbatimQuote: 'Modified radical mastectomy performed',
        spanIds: ['span-proc'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "facility"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'document.issuing_facility',
        value: { kind: 'facility', name: 'Tata Memorial Hospital' },
        verbatimQuote: 'Tata Memorial Hospital',
        spanIds: ['span-fac'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'document.issuing_facility',
        value: { kind: 'facility', name: 'Apollo Hospital' },
        verbatimQuote: 'Tata Memorial Hospital',
        spanIds: ['span-fac'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "cycle"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'chemo_cycle.recorded',
        value: { kind: 'cycle', label: 'Cycle 3' },
        verbatimQuote: 'Chemotherapy Cycle 3 Day 1',
        spanIds: ['span-cycle'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'chemo_cycle.recorded',
        value: { kind: 'cycle', label: 'Cycle 6' },
        verbatimQuote: 'Chemotherapy Cycle 3 Day 1',
        spanIds: ['span-cycle'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('validates and entails kind: "text"', () => {
    const valid = validateCandidateProvenance(
      {
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: 'Invasive ductal carcinoma' },
        verbatimQuote: 'Invasive ductal carcinoma Grade 2',
        spanIds: ['span-text'],
      },
      spans,
    );
    expect(valid.valid).toBe(true);

    const invalid = validateCandidateProvenance(
      {
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: 'Benign fibroadenoma' },
        verbatimQuote: 'Invasive ductal carcinoma Grade 2',
        spanIds: ['span-text'],
      },
      spans,
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.stageFailed).toBe('STAGE_B');
  });

  it('routes to needs_review when min OCR confidence is below 0.85', () => {
    const r = validateCandidateProvenance(
      {
        factType: 'lab_result.as_written',
        value: { kind: 'lab', name: 'Platelets', valueText: '185000', unitText: '/uL' },
        verbatimQuote: 'Platelets: 185000 /uL',
        spanIds: ['span-low-conf'],
      },
      spans,
    );
    expect(r.valid).toBe(true);
    expect(r.recommendedState).toBe('needs_review');
    expect(r.minOcrConfidence).toBe(0.72);
  });
});
