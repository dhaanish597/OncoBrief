import { describe, expect, it } from 'vitest';
import {
  generateStudioDraft,
  revalidateStudioMarkdownCitations,
  validateDeidentification,
  type StudioPatientInfo,
  type StudioEvidenceFactInput,
  type StudioGuidelineSpanInput,
  type StudioConflictInput,
  type StudioGapInput,
  type StudioTaskInput,
} from '../src/studio/draft-generator';

const samplePatient: StudioPatientInfo = {
  id: 'patient-uuid-1',
  displayName: 'Priya Sharma',
  mrn: 'RCI-2025-0044',
  abhaId: '91-1234-5678-9012',
  gender: 'Female',
  ageYears: 52,
  dateOfBirth: '1973-04-12',
  facilityName: 'Regional Cancer Institute',
};

const sampleFacts: StudioEvidenceFactInput[] = [
  {
    evidenceFactId: 'fact-1',
    factType: 'diagnosis.as_written',
    valueText: 'Invasive ductal carcinoma of right breast',
    verbatimQuote: 'Histopathology: Invasive ductal carcinoma of right breast, Nottingham grade 2',
    observedOn: '2025-05-10',
    displayDate: '2025-05-10',
    documentId: 'doc-path-1',
    documentName: 'histopathology-report.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'fact-2',
    factType: 'procedure.as_written',
    valueText: 'Right modified radical mastectomy',
    verbatimQuote: 'Procedure: Right modified radical mastectomy with level II axillary dissection',
    observedOn: '2025-05-28',
    displayDate: '2025-05-28',
    documentId: 'doc-surg-1',
    documentName: 'operative-note.pdf',
    pageNumber: 2,
    state: 'verified',
  },
  {
    evidenceFactId: 'fact-3',
    factType: 'medication.recorded',
    valueText: 'Paclitaxel 175 mg/m2 and Carboplatin AUC 5',
    verbatimQuote: 'Cycle 1 chemotherapy administered: Paclitaxel 175 mg/m2 and Carboplatin AUC 5 iv',
    observedOn: '2025-06-25',
    displayDate: '2025-06-25',
    documentId: 'doc-chemo-1',
    documentName: 'chemotherapy-administration.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'fact-4',
    factType: 'lab_result.as_written',
    valueText: 'Hemoglobin: 10.8 g/dL',
    verbatimQuote: 'Haemoglobin: 10.8 g/dL (normal 12.0-15.0)',
    observedOn: '2025-07-12',
    displayDate: '2025-07-12',
    documentId: 'doc-lab-1',
    documentName: 'cbc-cycle-review.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'fact-5',
    factType: 'instruction.recorded',
    valueText: 'Bring outside PET-CT report and previous imaging CD at next visit',
    verbatimQuote: 'Please bring outside PET-CT report and previous imaging CD at next visit.',
    observedOn: '2025-07-12',
    displayDate: '2025-07-12',
    documentId: 'doc-lab-1',
    documentName: 'cbc-cycle-review.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'fact-6',
    factType: 'appointment.recorded',
    valueText: 'Follow-up on 22 July 2025 in Medical Oncology OPD',
    verbatimQuote: 'Next appointment scheduled on 22 July 2025 with Medical Oncology team.',
    observedOn: '2025-07-14',
    displayDate: '2025-07-14',
    documentId: 'doc-opd-1',
    documentName: 'opd-note-july.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'fact-unverified-7',
    factType: 'biomarker.as_written',
    valueText: 'HER2-neu 2+ equivocal awaiting FISH',
    verbatimQuote: 'HER2-neu score 2+ (equivocal), advised FISH test',
    observedOn: '2025-05-10',
    displayDate: '2025-05-10',
    documentId: 'doc-path-1',
    documentName: 'histopathology-report.pdf',
    pageNumber: 1,
    state: 'extracted', // Unverified!
  },
];

const sampleGuidelines: StudioGuidelineSpanInput[] = [
  {
    spanId: 'span-guide-1',
    guidelineDocumentId: 'guide-doc-1',
    guidelineCode: 'ncg-breast-v2025',
    guidelineTitle: 'NCG Breast Cancer Guidelines',
    issuingBody: 'National Cancer Grid',
    versionLabel: 'v2025.2',
    publicationDate: '2025-03-01',
    pageNumber: 4,
    sectionHeading: '4.2 Multidisciplinary Tumor Board Preparation',
    verbatimText:
      'All newly referred breast oncology cases must have confirmed histopathology and staging imaging before multidisciplinary consultation.',
  },
];

const sampleConflicts: StudioConflictInput[] = [
  {
    conflictSetId: 'conflict-1',
    factType: 'procedure.date',
    memberValues: [
      { valueText: 'Surgery on 27 May 2025', documentName: 'referral-note.pdf', pageNumber: 1 },
      { valueText: 'Surgery on 28 May 2025', documentName: 'operative-note.pdf', pageNumber: 2 },
    ],
    reason: 'Two documents record different surgery dates',
  },
];

const sampleGaps: StudioGapInput[] = [
  {
    recordGapId: 'gap-1',
    label: 'Baseline Contrast CT Thorax/Abdomen',
    requirementKind: 'required',
    status: 'missing',
  },
];

const sampleTasks: StudioTaskInput[] = [
  {
    taskId: 'task-1',
    title: 'Obtain FISH confirmation for HER2 status',
    status: 'open',
    dueOn: '2025-08-01',
  },
];

describe('Clinician Productivity Studio — Pure Domain Draft Generators', () => {
  describe('Format 1: Specialist Referral / Transfer Letter', () => {
    it('generates a source-grounded referral letter citing verified evidence [E#]', () => {
      const draft = generateStudioDraft({
        kind: 'referral_letter',
        patient: samplePatient,
        facts: sampleFacts,
        tasks: sampleTasks,
      });

      expect(draft.kind).toBe('referral_letter');
      expect(draft.title).toContain('Specialist Referral / Transfer Letter');
      expect(draft.title).toContain(samplePatient.displayName);

      // Verifies patient identification
      expect(draft.markdownBody).toContain(samplePatient.displayName);
      expect(draft.markdownBody).toContain(samplePatient.mrn);

      // Verifies evidence citations [E#]
      expect(draft.markdownBody).toContain('[E1]');
      expect(draft.markdownBody).toContain('[E2]');
      expect(draft.markdownBody).toContain('[E3]');
      expect(draft.markdownBody).toContain('[E4]');

      // Contains documented procedures, chemo, labs as written
      expect(draft.markdownBody).toContain('Right modified radical mastectomy');
      expect(draft.markdownBody).toContain('Paclitaxel 175 mg/m2 and Carboplatin AUC 5');
      expect(draft.markdownBody).toContain('Hemoglobin: 10.8 g/dL');

      // Includes sign-off section
      expect(draft.markdownBody).toContain('Referring Clinician Sign-off');

      // Does not contain autonomous treatment recommendation
      expect(draft.markdownBody).not.toMatch(/recommend initiating|should be prescribed|recommended dose/i);

      // Checks cited fact IDs
      expect(draft.citedFactIds).toContain('fact-1');
      expect(draft.citedFactIds).toContain('fact-2');
      expect(draft.citedFactIds).toContain('fact-3');
    });

    it('labels unverified facts clearly in preview mode', () => {
      const draft = generateStudioDraft({
        kind: 'referral_letter',
        patient: samplePatient,
        facts: sampleFacts,
        includeUnverifiedInPreview: true,
      });

      expect(draft.markdownBody).toContain('[UNVERIFIED — Confirm Source Before Sign-Off]');
      expect(draft.unverifiedCitationsCount).toBeGreaterThan(0);
    });

    it('excludes unverified facts by default for final sign-off safety', () => {
      const draft = generateStudioDraft({
        kind: 'referral_letter',
        patient: samplePatient,
        facts: sampleFacts,
        includeUnverifiedInPreview: false,
      });

      expect(draft.markdownBody).not.toContain('HER2-neu 2+ equivocal awaiting FISH');
      expect(draft.unverifiedCitationsCount).toBe(0);
    });
  });

  describe('Format 2: Multidisciplinary Tumor Board Presentation Deck', () => {
    it('generates structured Markdown slides with chronological facts, conflicts, and guideline links', () => {
      const draft = generateStudioDraft({
        kind: 'tumor_board_deck',
        patient: samplePatient,
        facts: sampleFacts,
        guidelines: sampleGuidelines,
        conflicts: sampleConflicts,
        gaps: sampleGaps,
        tasks: sampleTasks,
      });

      expect(draft.kind).toBe('tumor_board_deck');
      expect(draft.title).toContain('Multidisciplinary Tumor Board');

      // Markdown slide format separated by '---'
      expect(draft.markdownBody).toContain('---');
      expect(draft.markdownBody).toContain('## Slide 1: Case Identity & Record Readiness');
      expect(draft.markdownBody).toContain('## Slide 2: Chronological Interventions & Administrations');
      expect(draft.markdownBody).toContain('## Slide 3: Histopathology, Biomarkers & Diagnostics');
      expect(draft.markdownBody).toContain('## Slide 4: Unresolved Source Contradictions & Missing Records');
      expect(draft.markdownBody).toContain('## Slide 5: Reference Institutional & NCG Oncology Guidelines');
      expect(draft.markdownBody).toContain('## Slide 6: Multidisciplinary Board Discussion');

      // Checks evidence [E#] and guideline [G#] citations
      expect(draft.markdownBody).toContain('[E1]');
      expect(draft.markdownBody).toContain('[G1]');
      expect(draft.citedGuidelineIds).toContain('guide-doc-1');

      // Reconciled/open contradictions surfaced explicitly
      expect(draft.markdownBody).toContain('Two documents record different surgery dates');
      expect(draft.markdownBody).toContain('Baseline Contrast CT Thorax/Abdomen');

      // Board decision is explicitly clinician-owned
      expect(draft.markdownBody).toContain('Clinician Input Required');
      expect(draft.markdownBody).not.toMatch(/ai tumor board recommendation:/i);
    });
  });

  describe('Format 3: De-Identified Academic Case Report Draft', () => {
    it('redacts all direct identifiers and transforms calendar dates to relative day offsets', () => {
      const draft = generateStudioDraft({
        kind: 'academic_case_abstract',
        patient: samplePatient,
        facts: sampleFacts,
      });

      expect(draft.kind).toBe('academic_case_abstract');
      expect(draft.isDeidentified).toBe(true);

      // Must not leak patient name, MRN, or ABHA
      expect(draft.markdownBody).not.toContain(samplePatient.displayName);
      expect(draft.markdownBody).not.toContain(samplePatient.mrn);
      expect(draft.markdownBody).not.toContain(samplePatient.abhaId);

      // Must use relative days (Day 0, Day +18, etc.) instead of calendar dates
      expect(draft.markdownBody).toContain('Day 0');
      expect(draft.markdownBody).toMatch(/Day \+\d+/);

      // De-identification validation passes
      const validation = validateDeidentification(draft.markdownBody, samplePatient);
      expect(validation.isValid).toBe(true);
      expect(validation.leaks).toHaveLength(0);
    });

    it('catches and reports identifier leaks if present', () => {
      const leakyText = `Case of Priya Sharma with MRN RCI-2025-0044 who underwent surgery on 2025-05-28.`;
      const validation = validateDeidentification(leakyText, samplePatient);
      expect(validation.isValid).toBe(false);
      expect(validation.leaks.length).toBeGreaterThan(0);
      expect(validation.leaks.some((l) => l.includes('Priya Sharma'))).toBe(true);
      expect(validation.leaks.some((l) => l.includes('RCI-2025-0044'))).toBe(true);
    });
  });

  describe('Format 4: Patient and Caregiver Information Sheet', () => {
    it('generates plain-language administrative visit instructions without medical advice', () => {
      const draft = generateStudioDraft({
        kind: 'patient_info_sheet',
        patient: samplePatient,
        facts: sampleFacts,
        tasks: sampleTasks,
      });

      expect(draft.kind).toBe('patient_info_sheet');
      expect(draft.title).toContain('Patient & Caregiver Visit Summary');

      // Verifies confirmed appointment date and instructions to bring
      expect(draft.markdownBody).toContain('Follow-up on 22 July 2025 in Medical Oncology OPD');
      expect(draft.markdownBody).toContain('Bring outside PET-CT report and previous imaging CD');

      // Verifies disclaimer and absence of autonomous medical advice
      expect(draft.markdownBody).toContain('administrative visit preparation instructions only');
      expect(draft.markdownBody).toContain('does not contain medical advice');
      expect(draft.markdownBody).not.toMatch(/take this medication|prescribed dose|start taking/i);
    });
  });

  describe('Citation Revalidation Gate', () => {
    it('approves markdown when all citations match available evidence and guidelines', () => {
      const markdown = `${sampleFacts[0]!.valueText} [E1]\n${sampleFacts[1]!.valueText} [E2]\n${sampleGuidelines[0]!.verbatimText} [G1]`;
      const result = revalidateStudioMarkdownCitations(markdown, sampleFacts, sampleGuidelines);

      expect(result.valid).toBe(true);
      expect(result.citedFactIds).toEqual(['fact-1', 'fact-2']);
      expect(result.citedGuidelineIds).toEqual(['guide-doc-1']);
      expect(result.invalidCitations).toHaveLength(0);
      expect(result.unverifiedFactIds).toHaveLength(0);
    });

    it('rejects markdown when an invented or out-of-range citation [E99] is attached', () => {
      const markdown = `Invented lab result is 15.0 [E99].`;
      const result = revalidateStudioMarkdownCitations(markdown, sampleFacts, sampleGuidelines);

      expect(result.valid).toBe(false);
      expect(result.invalidCitations).toContain('[E99]');
    });

    it('flags unverified facts when cited in text', () => {
      // fact-unverified-7 is index 7 in sampleFacts (so [E7])
      const markdown = `Patient had equivocal HER2-neu [E7].`;
      const result = revalidateStudioMarkdownCitations(markdown, sampleFacts, sampleGuidelines);

      expect(result.valid).toBe(false); // Unverified facts cannot be approved without review
      expect(result.unverifiedFactIds).toContain('fact-unverified-7');
    });
  });
});
