import { describe, expect, it } from 'vitest';
import {
  computeReadiness,
  evaluateGaps,
  type ChecklistItemDef,
  type DocumentForGap,
} from '../src/index';

const ITEMS: ChecklistItemDef[] = [
  {
    id: 'ci-referral',
    code: 'referral_note',
    label: 'Referral note',
    requiredDocumentType: 'referral_letter',
    requirementKind: 'required',
    ordinal: 1,
    rationale: 'Records office requires a referral note for new-patient intake.',
  },
  {
    id: 'ci-path',
    code: 'pathology',
    label: 'Pathology report',
    requiredDocumentType: 'pathology_report',
    requirementKind: 'required',
    ordinal: 2,
    rationale: 'Records office requires the pathology report on file.',
  },
  {
    id: 'ci-consent',
    code: 'consent',
    label: 'Consent form',
    requiredDocumentType: 'consent_form',
    requirementKind: 'expected',
    ordinal: 3,
    rationale: 'Consent form is expected but may be completed on the day.',
  },
];

function doc(id: string, documentType: DocumentForGap['documentType'], confirmed: boolean): DocumentForGap {
  return { id, documentType, documentDate: '2025-01-01', typeConfirmed: confirmed };
}

describe('evaluateGaps', () => {
  it('marks an item satisfied when a confirmed document of the type is present', () => {
    const gaps = evaluateGaps(ITEMS, [doc('d1', 'referral_letter', true)], []);
    const referral = gaps.find((g) => g.checklistItemId === 'ci-referral')!;
    expect(referral.status).toBe('satisfied');
    expect(referral.satisfiedByDocumentId).toBe('d1');
  });

  it('marks an item partial when a matching document type is unconfirmed', () => {
    const gaps = evaluateGaps(ITEMS, [doc('d1', 'referral_letter', false)], []);
    const referral = gaps.find((g) => g.checklistItemId === 'ci-referral')!;
    expect(referral.status).toBe('partial');
    expect(referral.candidateDocumentId).toBe('d1');
  });

  it('marks an item missing when no document of the type exists', () => {
    const gaps = evaluateGaps(ITEMS, [doc('d1', 'referral_letter', true)], []);
    const pathology = gaps.find((g) => g.checklistItemId === 'ci-path')!;
    expect(pathology.status).toBe('missing');
  });

  it('preserves a human waiver and never reopens it', () => {
    const gaps = evaluateGaps(ITEMS, [doc('d1', 'pathology_report', true)], [
      { checklistItemId: 'ci-path', status: 'waived', waivedBy: 'u1', waivedReason: 'not applicable' },
    ]);
    expect(gaps.find((g) => g.checklistItemId === 'ci-path')!.status).toBe('waived');
  });

  it('picks the most recent confirmed document as the satisfier', () => {
    const gaps = evaluateGaps(ITEMS, [
      { id: 'old', documentType: 'pathology_report', documentDate: '2024-01-01', typeConfirmed: true },
      { id: 'new', documentType: 'pathology_report', documentDate: '2025-06-01', typeConfirmed: true },
    ], []);
    expect(gaps.find((g) => g.checklistItemId === 'ci-path')!.satisfiedByDocumentId).toBe('new');
  });

  it('does not classify a document still processing as definitively missing', () => {
    const gaps = evaluateGaps(
      ITEMS,
      [
        doc('d1', 'referral_letter', true),
        { id: 'd2', documentType: 'pathology_report', documentDate: '2025-01-01', typeConfirmed: false, ingestStatus: 'ocr_running' },
      ],
      [],
    );
    const path = gaps.find((g) => g.checklistItemId === 'ci-path')!;
    expect(path.status).toBe('partial');
    expect(path.candidateDocumentId).toBe('d2');
  });

  it('does not classify a requirement as missing when an unclassified document is still processing', () => {
    const gaps = evaluateGaps(
      ITEMS,
      [
        doc('d1', 'referral_letter', true),
        { id: 'd2', documentType: null, documentDate: '2025-01-01', typeConfirmed: false, ingestStatus: 'rendering' },
      ],
      [],
    );
    const path = gaps.find((g) => g.checklistItemId === 'ci-path')!;
    expect(path.status).toBe('partial');
    expect(path.candidateDocumentId).toBe('d2');
  });

  it('treats an uploaded document with zero extracted facts as present if confirmed', () => {
    const gaps = evaluateGaps(
      ITEMS,
      [
        doc('d1', 'referral_letter', true),
        { id: 'd2', documentType: 'pathology_report', documentDate: '2025-01-01', typeConfirmed: true, ingestStatus: 'ready', factCount: 0 },
      ],
      [],
    );
    const path = gaps.find((g) => g.checklistItemId === 'ci-path')!;
    expect(path.status).toBe('satisfied');
    expect(path.satisfiedByDocumentId).toBe('d2');
  });
});

describe('computeReadiness', () => {
  const baseInput = {
    requiredItems: 2,
    satisfiedItems: 2,
    missingRequired: 0,
    missingExpected: 0,
    partialItems: 0,
    unresolvedConflicts: 0,
    unverifiedFacts: 0,
    openTasks: 0,
    overdueTasks: 0,
    duplicateDocuments: 0,
    staleVerifiedFacts: 0,
  };

  it('is ready when nothing is outstanding', () => {
    expect(computeReadiness(baseInput).band).toBe('ready');
  });

  it('is blocked when a required document is missing', () => {
    const r = computeReadiness({ ...baseInput, missingRequired: 1 });
    expect(r.band).toBe('blocked');
    expect(r.reasons.join(' ')).toContain('required document');
  });

  it('is blocked when a conflict is unresolved', () => {
    expect(computeReadiness({ ...baseInput, unresolvedConflicts: 1 }).band).toBe('blocked');
  });

  it('is gaps when an expected document is absent', () => {
    expect(computeReadiness({ ...baseInput, missingExpected: 1 }).band).toBe('gaps');
  });

  it('is gaps when facts are unverified', () => {
    expect(computeReadiness({ ...baseInput, unverifiedFacts: 3 }).band).toBe('gaps');
  });

  it('is gaps when a task is overdue', () => {
    expect(computeReadiness({ ...baseInput, overdueTasks: 1 }).band).toBe('gaps');
  });

  it('blocked takes precedence over gaps', () => {
    const r = computeReadiness({ ...baseInput, missingRequired: 1, unverifiedFacts: 5 });
    expect(r.band).toBe('blocked');
  });

  it('never produces a numeric score', () => {
    const r = computeReadiness(baseInput);
    expect(Object.keys(r).sort()).toEqual(['band', 'reasons']);
  });
});

describe('worklist readiness summary and filtering (TASK-001 regression)', () => {
  const SYNTHETIC_WORKLIST = [
    {
      id: 'p1',
      displayName: 'Asha Sharma',
      mrn: 'RCI-2025-001',
      demoCode: 'DEMO-001',
      readinessBand: 'blocked',
      primaryClinicianName: 'Dr. Meera Rao',
      departmentName: 'Medical Oncology',
      openConflicts: 1,
      unverifiedFacts: 4,
    },
    {
      id: 'p2',
      displayName: 'Ramesh Kulkarni',
      mrn: 'RCI-2025-002',
      demoCode: 'DEMO-002',
      readinessBand: 'gaps',
      primaryClinicianName: 'Dr. Rajesh Sharma',
      departmentName: 'Surgical Oncology',
      openConflicts: 0,
      unverifiedFacts: 2,
    },
    {
      id: 'p3',
      displayName: 'Lakshmi Menon',
      mrn: 'RCI-2025-003',
      demoCode: 'DEMO-003',
      readinessBand: 'ready',
      primaryClinicianName: 'Dr. Meera Rao',
      departmentName: 'Medical Oncology',
      openConflicts: 0,
      unverifiedFacts: 0,
    },
    {
      id: 'p4',
      displayName: 'Unassessed Walk-in',
      mrn: null,
      demoCode: null,
      readinessBand: null,
      primaryClinicianName: null,
      departmentName: null,
      openConflicts: 0,
      unverifiedFacts: 0,
    },
  ];

  it('computes accurate canonical readiness counts (ready, gaps, blocked, unassessed)', async () => {
    const { computeWorklistReadinessSummary, READINESS_BAND_LABEL, WORKLIST_BAND_FILTER_VALUES } = await import('../src/index');
    expect(Object.keys(READINESS_BAND_LABEL)).toEqual(['ready', 'gaps', 'blocked']);
    expect(WORKLIST_BAND_FILTER_VALUES).toEqual(['all', 'ready', 'gaps', 'blocked', 'none']);

    const summary = computeWorklistReadinessSummary(SYNTHETIC_WORKLIST);
    expect(summary).toEqual({
      totalPatients: 4,
      readyCount: 1,
      gapsCount: 1,
      blockedCount: 1,
      unassessedCount: 1,
      totalConflicts: 1,
      totalUnverified: 6,
    });
  });

  it('filters patients accurately across all canonical readiness band options', async () => {
    const { filterWorklistPatients } = await import('../src/index');
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { band: 'all' }).map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { band: 'ready' }).map((p) => p.id)).toEqual(['p3']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { band: 'gaps' }).map((p) => p.id)).toEqual(['p2']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { band: 'blocked' }).map((p) => p.id)).toEqual(['p1']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { band: 'none' }).map((p) => p.id)).toEqual(['p4']);
  });

  it('filters by search, clinician, and department without leaking null-clinician or null-department records', async () => {
    const { filterWorklistPatients } = await import('../src/index');
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { search: 'DEMO-003' }).map((p) => p.id)).toEqual(['p3']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { search: 'rci-2025-001' }).map((p) => p.id)).toEqual(['p1']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { clinician: 'Dr. Meera Rao' }).map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(filterWorklistPatients(SYNTHETIC_WORKLIST, { department: 'Surgical Oncology' }).map((p) => p.id)).toEqual(['p2']);
    expect(
      filterWorklistPatients(SYNTHETIC_WORKLIST, { clinician: 'Dr. Meera Rao', band: 'ready' }).map((p) => p.id),
    ).toEqual(['p3']);
  });
});
