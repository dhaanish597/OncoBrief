import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Querier } from '@oncobrief/db';
import { evaluateGaps, type ChecklistItemDef } from '@oncobrief/domain';

vi.mock('@oncobrief/adapters', () => ({
  chatCompletion: vi.fn(async () => ({ content: 'ambiguous_question' })),
  chatCompletionWithRetry: vi.fn(async () => ({ content: 'The report shows invasive ductal carcinoma.' })),
  NvidiaLlmError: class NvidiaLlmError extends Error {
    constructor(message: string, public statusCode?: number, public retryable = false) {
      super(message);
    }
  },
}));

vi.mock('@oncobrief/db', () => ({
  getPatient: vi.fn(),
  getTimeline: vi.fn(),
  getProvenance: vi.fn(),
  getConflict: vi.fn(),
  listConflicts: vi.fn(),
  listTasks: vi.fn(),
  listRecordMap: vi.fn(),
  getPageSpans: vi.fn(),
  listDocuments: vi.fn(),
}));

import * as db from '@oncobrief/db';
import { chatCompletionWithRetry } from '@oncobrief/adapters';
import { runAssistant, sanitizeUserFacingProse } from './orchestrator';
import { isEvidenceAnswerGrounded, type PromptEvidence } from './prompt';
import { findDocument, searchEvidence } from './tools';

const q = {} as Querier;
const PATIENT = '11111111-1111-1111-1111-111111111111';
const ctx = { patientId: PATIENT, route: `/patients/${PATIENT}/evidence` };

const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: 'item-referral',
    code: 'referral_letter',
    label: 'Referral Letter',
    requiredDocumentType: 'referral_letter',
    requirementKind: 'required',
    ordinal: 1,
    rationale: 'A referral letter is required for all new consultations.',
  },
  {
    id: 'item-pathology',
    code: 'pathology_report',
    label: 'Pathology Report',
    requiredDocumentType: 'pathology_report',
    requirementKind: 'required',
    ordinal: 2,
    rationale: 'Primary pathology report is required to confirm histological diagnosis.',
  },
  {
    id: 'item-imaging',
    code: 'imaging_report',
    label: 'Baseline Imaging',
    requiredDocumentType: 'radiology_report',
    requirementKind: 'expected',
    ordinal: 3,
    rationale: 'Baseline imaging expected for anatomical evaluation.',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getPatient).mockResolvedValue({
    id: PATIENT,
    displayName: 'DEMO-001',
    demoCode: 'DEMO-001',
    isDemoFixture: true,
  });
  vi.mocked(db.getTimeline).mockResolvedValue([]);
  vi.mocked(db.listRecordMap).mockResolvedValue({ gaps: [], origins: [], readiness: null });
  vi.mocked(db.listTasks).mockResolvedValue([]);
  vi.mocked(db.listConflicts).mockResolvedValue([]);
  vi.mocked(db.listDocuments).mockResolvedValue([]);
});

describe('Phase 2 Evidence Correctness & Grounding Regression Suite', () => {
  it('1. Missing-required-document question returns a truthful result with non-empty sources', async () => {
    vi.mocked(db.listRecordMap).mockResolvedValue({
      gaps: [
        {
          id: 'gap-pathology-1',
          label: 'Pathology Report',
          requirementKind: 'required',
          status: 'missing',
          rationale: 'Primary pathology report is required to confirm histological diagnosis.',
          requiredDocumentType: 'pathology_report',
          satisfiedByDocumentId: null,
          candidateDocumentId: null,
        },
      ],
      origins: [],
      readiness: null,
    });
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content:
        'According to the consultation record checklist, the required [E1] Pathology Report is currently missing. It is needed to confirm the histological diagnosis.',
    });

    const result = await runAssistant(q, {
      message: 'Which required documents are missing?',
      context: ctx,
    });

    expect(result.intent).toBe('missing_documents_question');
    expect(result.grounded).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]!.documentName).toBe('Record Checklist: Pathology Report');
    expect(result.sources[0]!.factType).toBe('record.requirement');
    expect(result.sources[0]!.state).toBe('missing');
    expect(result.sources[0]!.href).toBe(`/patients/${PATIENT}/record-map`);
    expect(result.answer).toContain('Pathology Report');
  });

  it('2. A grounded response never has an empty source list (strict invariant)', async () => {
    // If retrieval found items, but the model gave an answer that does not cite or reference any of them
    const evidence: PromptEvidence[] = [
      {
        label: 'Retrieved evidence',
        items: [
          {
            evidenceFactId: 'e1',
            factType: 'procedure.recorded',
            valueText: 'lumpectomy',
            displayDate: '2026-01-01',
            state: 'verified',
            documentId: 'd1',
            documentName: 'note.pdf',
            pageNumber: 1,
            confidenceBand: 'high',
            extractorKind: 'rule',
            extractorName: 'rule',
            extractorVersion: '1',
            verbatimQuote: 'lumpectomy done',
            reviewerName: null,
            reviewedAt: null,
          },
        ],
      },
    ];

    // Hallucinated answer with zero citation of e1/lumpectomy/note.pdf
    const ungroundedAnswer = 'The patient has severe diabetes mellitus.';
    const status = isEvidenceAnswerGrounded(ungroundedAnswer, evidence);
    expect(status).toBe('ungrounded');

    // Run assistant turn where LLM speculates
    vi.mocked(db.getTimeline).mockResolvedValue([
      {
        id: 't1',
        evidenceFactId: 'e1',
        factType: 'procedure.recorded',
        valueText: 'lumpectomy',
        displayDate: '2026-01-01',
        observedOn: '2026-01-01',
        state: 'verified',
        documentId: 'd1',
        originalFilename: 'note.pdf',
        documentName: 'note.pdf',
        pageNumber: 1,
        confidenceBand: 'high',
        extractorKind: 'rule',
        extractorName: 'rule',
        extractorVersion: '1',
        verbatimQuote: 'lumpectomy done',
        reviewerName: null,
        reviewedAt: null,
        correctsFactId: null,
        replacedByFactId: null,
        version: 1,
      } as never,
    ]);
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content: 'The patient has severe diabetes mellitus.',
    });

    const result = await runAssistant(q, { message: 'What procedure was done?', context: ctx });

    // Invariant: If grounded is false, sources must be empty; if sources is empty, grounded CANNOT be true.
    if (result.grounded) {
      expect(result.sources.length).toBeGreaterThan(0);
    } else {
      expect(result.grounded).toBe(false);
    }
    // And here it was ungrounded, so fallback was engaged
    expect(result.grounded).toBe(false);
    expect(result.sources).toHaveLength(0);
  });

  it('3. Each source reference resolves to a legitimate source or explicitly identified workflow requirement', async () => {
    vi.mocked(db.listRecordMap).mockResolvedValue({
      gaps: [
        {
          id: 'gap-imaging-1',
          label: 'Baseline Imaging',
          requirementKind: 'expected',
          status: 'partial',
          rationale: 'Baseline imaging expected for anatomical evaluation.',
          requiredDocumentType: 'imaging_report',
          satisfiedByDocumentId: null,
          candidateDocumentId: 'cand-doc-1',
        },
      ],
      origins: [],
      readiness: null,
    });
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content: 'Baseline Imaging is in-flight / pending confirmation [E1].',
    });

    const result = await runAssistant(q, {
      message: 'What documents are missing?',
      context: ctx,
    });

    expect(result.sources.length).toBe(1);
    const source = result.sources[0]!;
    expect(source.href).toBe(`/patients/${PATIENT}/record-map`);
    expect(source.documentName).toBe('Record Checklist: Baseline Imaging');
    expect(source.state).toBe('partial');
    expect(result.navigation?.href).toBe(`/patients/${PATIENT}/record-map`);
    expect(result.navigation?.label).toBe('Open Record Map');
  });

  it('4. A missing document does not produce a fabricated document citation', async () => {
    vi.mocked(db.listRecordMap).mockResolvedValue({
      gaps: [
        {
          id: 'gap-ref-1',
          label: 'Referral Letter',
          requirementKind: 'required',
          status: 'missing',
          rationale: 'A referral letter is required for all new consultations.',
          requiredDocumentType: 'referral_letter',
          satisfiedByDocumentId: null,
          candidateDocumentId: null,
        },
      ],
      origins: [],
      readiness: null,
    });
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content: 'The referral letter is missing from the record [E1].',
    });

    const result = await runAssistant(q, {
      message: 'What documents are missing?',
      context: ctx,
    });

    expect(result.sources).toHaveLength(1);
    // Page number must NOT be fabricated for a nonexistent document
    expect(result.sources[0]!.pageNumber).toBeNull();
    // Document ID must not be an invented ID
    expect(result.sources[0]!.documentId).toBeNull();
    // Source name clearly identifies it as the checklist requirement
    expect(result.sources[0]!.documentName).toBe('Record Checklist: Referral Letter');
  });

  it('5. A document still processing is not incorrectly classified as definitively missing', () => {
    // Pathology report is still in OCR / classification pipeline
    const gaps = evaluateGaps(
      CHECKLIST_ITEMS,
      [
        {
          id: 'doc-in-flight',
          documentType: 'pathology_report',
          documentDate: '2026-01-10',
          typeConfirmed: false,
          ingestStatus: 'ocr_running',
        },
      ],
      [],
    );

    const pathGap = gaps.find((g) => g.checklistItemId === 'item-pathology')!;
    expect(pathGap.status).not.toBe('missing');
    expect(pathGap.status).toBe('partial');
    expect(pathGap.candidateDocumentId).toBe('doc-in-flight');
  });

  it('6. An uploaded document with zero extracted facts is not automatically treated as absent', async () => {
    // Document exists in document table with factCount: 0
    vi.mocked(db.listDocuments).mockResolvedValue([
      {
        id: 'doc-zero-facts',
        filename: 'external_referral_scan.pdf',
        mimeType: 'application/pdf',
        byteSize: 1048576,
        documentType: 'referral_letter',
        typeConfirmed: true,
        typeConfidence: 'high',
        documentDate: '2026-01-05',
        issuingFacility: 'St Jude',
        recordOrigin: 'external',
        ingestStatus: 'ready',
        ingestError: null,
        pageCount: 2,
        docVersion: 1,
        duplicateOf: null,
        isDemoFixture: false,
        factCount: 0,
      },
    ]);
    vi.mocked(db.getTimeline).mockResolvedValue([]);

    const found = await findDocument(q, PATIENT, 'external_referral_scan');
    expect(found.success).toBe(true);
    expect(found.data).toHaveLength(1);
    expect(found.data![0]!.documentName).toBe('external_referral_scan.pdf');
    expect(found.data![0]!.state).toBe('verified');
  });

  it('7. Unresolved conflicting evidence is presented as unresolved rather than silently choosing a value', async () => {
    vi.mocked(db.listConflicts).mockResolvedValue([
      { id: 'conf-1', factType: 'appointment.recorded', status: 'open' } as never,
    ]);
    vi.mocked(db.getConflict).mockResolvedValue({
      id: 'conf-1',
      factType: 'appointment.recorded',
      slotKey: 'appointment|2026-02-01',
      status: 'open',
      detectionReason: 'disagreement',
      detectedAt: new Date().toISOString(),
      resolvedKind: null,
      resolvedReason: null,
      resolvedByName: null,
      resolvedAt: null,
      members: [
        {
          factId: 'f1',
          valueText: '2026-02-01',
          state: 'conflicting',
          observedOn: null,
          verbatimQuote: 'Visit on 1 Feb',
          documentId: 'd1',
          documentName: 'ClinicNoteA.pdf',
          pageNumber: 1,
          spanIds: [],
          pageSpans: [],
          extractorKind: 'rule',
          extractorName: 'r',
          confidenceBand: 'high',
          reviewerName: null,
          createdAt: new Date().toISOString(),
        },
        {
          factId: 'f2',
          valueText: '2026-02-08',
          state: 'conflicting',
          observedOn: null,
          verbatimQuote: 'Visit on 8 Feb',
          documentId: 'd2',
          documentName: 'ClinicNoteB.pdf',
          pageNumber: 2,
          spanIds: [],
          pageSpans: [],
          extractorKind: 'rule',
          extractorName: 'r',
          confidenceBand: 'high',
          reviewerName: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content:
        'Conflicting evidence found: ClinicNoteA.pdf records appointment on 2026-02-01 [E1], while ClinicNoteB.pdf records 2026-02-08 [E2]. The dates disagree and require human reconciliation.',
    });

    const result = await runAssistant(q, {
      message: 'Are there any conflicting appointment dates?',
      context: ctx,
    });

    expect(result.conflict).toBe(true);
    expect(result.grounded).toBe(true);
    expect(result.sources.length).toBe(2);
    expect(result.answer).toContain('Conflicting evidence');
  });

  it('8. Rejected or superseded evidence is marked and not presented as current verified evidence', async () => {
    vi.mocked(db.getTimeline).mockResolvedValue([
      {
        id: 't-active',
        evidenceFactId: 'f-active',
        factType: 'procedure.recorded',
        valueText: 'Modified radical mastectomy',
        displayDate: '2025-06-16',
        observedOn: '2025-06-16',
        state: 'verified',
        documentId: 'd1',
        originalFilename: 'op_report.pdf',
        documentName: 'op_report.pdf',
        pageNumber: 1,
        confidenceBand: 'high',
        extractorKind: 'rule',
        extractorName: 'r',
        extractorVersion: '1',
        verbatimQuote: 'Modified radical mastectomy completed.',
        reviewerName: 'Dr Patel',
        reviewedAt: new Date(),
        correctsFactId: 'f-rejected',
        replacedByFactId: null,
        version: 2,
      } as never,
      {
        id: 't-rejected',
        evidenceFactId: 'f-rejected',
        factType: 'procedure.recorded',
        valueText: 'Lumpectomy',
        displayDate: '2025-06-16',
        observedOn: '2025-06-16',
        state: 'rejected',
        documentId: 'd2',
        originalFilename: 'draft_note.pdf',
        documentName: 'draft_note.pdf',
        pageNumber: 1,
        confidenceBand: 'low',
        extractorKind: 'ml',
        extractorName: 'nlp',
        extractorVersion: '1',
        verbatimQuote: 'Lumpectomy planned.',
        reviewerName: 'Dr Patel',
        reviewedAt: new Date(),
        correctsFactId: null,
        replacedByFactId: 'f-active',
        version: 1,
      } as never,
    ]);

    // Active fact ranks higher than rejected fact
    const searched = await searchEvidence(q, PATIENT, 'mastectomy lumpectomy');
    expect(searched.data![0]!.state).toBe('verified');
    expect(searched.data![0]!.valueText).toBe('Modified radical mastectomy');
  });

  it('9. Raw UUIDs do not appear in user-facing assistant prose', () => {
    const rawProse =
      'The referral was found in Note A (documentId=550e8400-e29b-41d4-a716-446655440000) on page 1 with id=660e8400-e29b-41d4-a716-446655440000.';
    const sanitized = sanitizeUserFacingProse(rawProse);

    expect(sanitized).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(sanitized).not.toContain('660e8400-e29b-41d4-a716-446655440000');
    expect(sanitized).not.toContain('documentId=');
    expect(sanitized).not.toContain('id=');
  });

  it('10. Irrelevant sources cannot be attached merely to satisfy grounding requirements', async () => {
    vi.mocked(db.getTimeline).mockResolvedValue([
      {
        id: 't1',
        evidenceFactId: 'f1',
        factType: 'diagnosis_text',
        valueText: 'Diagnosis: Invasive ductal carcinoma',
        displayDate: '2026-05-01',
        observedOn: '2026-05-01',
        state: 'verified',
        documentId: 'd1',
        originalFilename: 'path_report.pdf',
        documentName: 'path_report.pdf',
        pageNumber: 2,
        confidenceBand: 'high',
        extractorKind: 'rule',
        extractorName: 'r',
        extractorVersion: '1',
        verbatimQuote: 'Diagnosis: Invasive ductal carcinoma',
        reviewerName: null,
        reviewedAt: null,
        correctsFactId: null,
        replacedByFactId: null,
        version: 1,
      } as never,
      {
        id: 't2',
        evidenceFactId: 'f2',
        factType: 'appointment.recorded',
        valueText: 'Diagnosis follow-up visit on 2026-04-01',
        displayDate: '2026-04-01',
        observedOn: '2026-04-01',
        state: 'verified',
        documentId: 'd2',
        originalFilename: 'visit.pdf',
        documentName: 'visit.pdf',
        pageNumber: 1,
        confidenceBand: 'high',
        extractorKind: 'rule',
        extractorName: 'r',
        extractorVersion: '1',
        verbatimQuote: 'Diagnosis follow-up visit on 2026-04-01',
        reviewerName: null,
        reviewedAt: null,
        correctsFactId: null,
        replacedByFactId: null,
        version: 1,
      } as never,
    ]);

    // LLM answers only about the primary diagnosis in path_report.pdf [E1]
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content: 'The diagnosis recorded in path_report.pdf is [E1] Invasive ductal carcinoma.',
    });

    const result = await runAssistant(q, { message: 'What is the diagnosis?', context: ctx });

    expect(result.grounded).toBe(true);
    // Only f1 from path_report.pdf is attached; visit.pdf was NOT cited and is omitted!
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.documentName).toBe('path_report.pdf');
  });

  it('11. Insufficient evidence produces an honest response rather than an unsupported claim', async () => {
    vi.mocked(db.getTimeline).mockResolvedValue([]);
    const result = await runAssistant(q, { message: 'What is the MRI scan finding?', context: ctx });

    expect(result.grounded).toBe(false);
    expect(result.sources).toHaveLength(0);
    expect(result.answer).toContain("couldn't find that information in the selected record set");
  });

  it('12. Existing valid grounded answers continue to work', async () => {
    vi.mocked(db.getTimeline).mockResolvedValue([
      {
        id: 't1',
        evidenceFactId: 'e1',
        factType: 'pathology.result',
        valueText: 'Invasive ductal carcinoma, grade 2',
        displayDate: '2026-01-04',
        observedOn: '2026-01-04',
        state: 'verified',
        documentId: 'd1',
        originalFilename: 'Pathology Report.pdf',
        documentName: 'Pathology Report.pdf',
        pageNumber: 4,
        confidenceBand: 'high',
        extractorKind: 'rule',
        extractorName: 'rule.extractor',
        extractorVersion: 'v1',
        verbatimQuote: 'Invasive ductal carcinoma, grade 2',
        reviewerName: 'Dr Rao',
        reviewedAt: new Date(),
        correctsFactId: null,
        replacedByFactId: null,
        version: 2,
      } as never,
    ]);
    vi.mocked(chatCompletionWithRetry).mockResolvedValueOnce({
      content: 'The Pathology Report.pdf shows [E1] Invasive ductal carcinoma, grade 2.',
    });

    const result = await runAssistant(q, { message: 'What is the pathology report?', context: ctx });

    expect(result.grounded).toBe(true);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.documentName).toBe('Pathology Report.pdf');
    expect(result.sources[0]!.pageNumber).toBe(4);
    expect(result.sources[0]!.href).toBe(`/patients/${PATIENT}/sources/d1?fact=e1&page=4`);
  });

  it('13. Source links and document/page references remain tenant-scoped', async () => {
    // When a patient does not belong to the authorized tenant, getPatient returns null
    vi.mocked(db.getPatient).mockResolvedValue(null);

    const result = await runAssistant(q, { message: 'Show the pathology report', context: ctx });

    expect(result.grounded).toBe(false);
    expect(result.sources).toHaveLength(0);
    expect(result.answer).toContain('couldn’t retrieve the requested OncoBrief information');
  });

  it('14. Missing-document gaps remain stable across readiness recomputation', () => {
    // Evaluating gaps twice produces stable item IDs and respects human waivers
    const initialGaps = evaluateGaps(CHECKLIST_ITEMS, [], []);
    expect(initialGaps.filter((g) => g.status === 'missing')).toHaveLength(3);

    // Human waives one item
    const waivedGaps = evaluateGaps(CHECKLIST_ITEMS, [], [
      { checklistItemId: 'item-imaging', status: 'waived', waivedBy: 'u1', waivedReason: 'Clinician waived' },
    ]);

    const imaging = waivedGaps.find((g) => g.checklistItemId === 'item-imaging')!;
    expect(imaging.status).toBe('waived');
    // Remaining items remain missing
    expect(waivedGaps.filter((g) => g.status === 'missing')).toHaveLength(2);
  });
});
