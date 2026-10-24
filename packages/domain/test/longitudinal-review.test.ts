import { describe, expect, it } from 'vitest';
import {
  buildLongitudinalLabFlowsheet,
  buildMedicationHistory,
  computeIntervalDelta,
  type TimelineFactInput,
} from '../src/journey/longitudinal-review';

function fact(
  id: string,
  overrides: Partial<TimelineFactInput> = {},
): TimelineFactInput {
  return {
    evidenceFactId: id,
    factType: 'lab_result.as_written',
    value: {
      kind: 'lab',
      name: 'Hemoglobin',
      valueText: '11.4',
      unitText: 'g/dL',
    },
    observedOn: '2026-06-02',
    state: 'verified',
    documentId: `doc-${id}`,
    documentName: `${id}.pdf`,
    pageNumber: 2,
    verbatimQuote: 'Hemoglobin: 11.4 g/dL',
    createdAt: '2026-06-02T08:00:00Z',
    ...overrides,
  };
}
const latest = () =>
  fact('b', {
    observedOn: '2026-07-26',
    value: {
      kind: 'lab',
      name: 'Hemoglobin',
      valueText: '10.2',
      unitText: 'g/dL',
    },
  });

describe('interval delta', () => {
  it('counts newly uploaded old records and updated evidence separately from observation dates', () => {
    const old = fact('old');
    const updated = fact('updated', { updatedAt: '2026-07-06T01:00:00Z' });
    const late = fact('late', { createdAt: '2026-07-07T01:00:00Z' });
    const result = computeIntervalDelta(
      [old, updated, late],
      [
        { documentId: 'old', uploadedAt: '2026-07-05T10:00:00Z' },
        { documentId: 'late', uploadedAt: '2026-07-06T10:00:00Z' },
      ],
      '2026-07-05',
    );
    expect(result.newDocumentsCount).toBe(1);
    expect(result.newFacts.map((f) => f.evidenceFactId)).toEqual([
      'updated',
      'late',
    ]);
    expect(result.newFacts[1]).toEqual(late);
  });
  it('uses documented observation dates as well as ledger sequence changes', () => {
    const newer = fact('newer', { observedOn: '2026-07-06' });
    const changed = fact('changed', { ledgerSeq: 19 });
    expect(
      computeIntervalDelta(
        [newer, changed, fact('old', { ledgerSeq: 18 })],
        [],
        '2026-07-05',
        { baselineLedgerSeq: 18 },
      ).newFacts.map((f) => f.evidenceFactId),
    ).toEqual(['newer', 'changed']);
  });
  it('supports an exact approved-packet timestamp', () => {
    const after = fact('after', { createdAt: '2026-07-05T12:00:01Z' });
    expect(
      computeIntervalDelta([fact('before'), after], [], '2026-07-05T12:00:00Z')
        .newFacts,
    ).toEqual([after]);
  });
  it('deduplicates reopened/new conflicts by ID and excludes historical/closed events', () => {
    const options = {
      conflicts: [
        {
          conflictSetId: 'a',
          status: 'open' as const,
          detectedAt: '2026-07-06T01:00:00Z',
          reopenedAt: '2026-07-07T01:00:00Z',
        },
        {
          conflictSetId: 'a',
          status: 'open' as const,
          detectedAt: '2026-07-06T01:00:00Z',
        },
        {
          conflictSetId: 'b',
          status: 'open' as const,
          detectedAt: '2026-06-02T01:00:00Z',
          reopenedAt: '2026-07-07T01:00:00Z',
        },
        {
          conflictSetId: 'c',
          status: 'resolved' as const,
          detectedAt: '2026-07-06T01:00:00Z',
        },
      ],
    };
    expect(
      computeIntervalDelta([], [], '2026-07-05', options)
        .reopenedOrNewConflictsCount,
    ).toBe(2);
  });
  it('returns source-grounded pending and instructions while omitting rejected/replaced evidence', () => {
    const pending = fact('pending', {
      factType: 'pending_investigation.recorded',
      value: { kind: 'text', text: 'Awaiting IHC report' },
      observedOn: null,
    });
    const instruction = fact('instruction', {
      factType: 'instruction.recorded',
      value: { kind: 'text', text: 'Bring prior imaging CD' },
    });
    const result = computeIntervalDelta(
      [
        pending,
        instruction,
        { ...pending, evidenceFactId: 'rejected', state: 'rejected' },
        { ...pending, evidenceFactId: 'replaced', replacedByFactId: 'new' },
      ],
      [],
      '2026-07-05',
    );
    expect(result.pendingInvestigations).toEqual([pending]);
    expect(result.documentedInstructions).toEqual([instruction]);
  });
  it('handles first visit without inventing a prior consultation', () => {
    const input = fact('a', { observedOn: null });
    const result = computeIntervalDelta(
      [input],
      [{ documentId: 'a', uploadedAt: '2026-06-02T00:00:00Z' }],
      null,
    );
    expect(result.baselineDate).toBeNull();
    expect(result.newDocumentsCount).toBe(1);
    expect(result.newFacts).toEqual([input]);
  });
  it('rejects invalid baseline dates', () => {
    expect(() => computeIntervalDelta([], [], '2026-02-30')).toThrow(
      'invalid_baseline_date',
    );
  });
});

describe('lab flowsheets', () => {
  it('orders dated source points and computes arithmetic only', () => {
    const rows = buildLongitudinalLabFlowsheet([latest(), fact('a')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.points.map((p) => p.factId)).toEqual(['a', 'b']);
    expect(rows[0]?.points[0]).toMatchObject({
      observedOn: '2026-06-02',
      numericValue: 11.4,
      documentId: 'doc-a',
      documentName: 'a.pdf',
      pageNumber: 2,
      state: 'verified',
    });
    expect(rows[0]?.deltaText).toBe('-1.2 g/dL since 02 Jun 2026');
  });
  it('keeps units separate without conversion', () => {
    const other = fact('unit', {
      value: {
        kind: 'lab',
        name: 'Hemoglobin',
        valueText: '114',
        unitText: 'g/L',
      },
    });
    expect(buildLongitudinalLabFlowsheet([fact('a'), other])).toHaveLength(2);
    expect(
      buildLongitudinalLabFlowsheet([fact('a'), other]).every(
        (r) => r.deltaText === null,
      ),
    ).toBe(true);
  });
  it.each(['<10', '11,4', 'not recorded', 'NaN'])(
    'does not coerce ambiguous numeric text %s',
    (valueText) => {
      const last = latest();
      last.value = {
        kind: 'lab',
        name: 'Hemoglobin',
        valueText,
        unitText: 'g/dL',
      };
      const row = buildLongitudinalLabFlowsheet([fact('a'), last])[0]!;
      expect(row.points[1]?.numericValue).toBeNull();
      expect(row.deltaText).toBeNull();
    },
  );
  it('retains undated sources but excludes them from arithmetic', () => {
    const row = buildLongitudinalLabFlowsheet([
      fact('a'),
      fact('unknown', { observedOn: null }),
    ])[0]!;
    expect(row.points).toHaveLength(2);
    expect(row.points[1]?.observedOn).toBeNull();
    expect(row.deltaText).toBeNull();
  });
  it('suppresses delta when the latest date has multiple values or conflicts', () => {
    const ambiguous = { ...latest(), evidenceFactId: 'c' };
    expect(
      buildLongitudinalLabFlowsheet([fact('a'), latest(), ambiguous])[0]
        ?.deltaText,
    ).toBeNull();
    expect(
      buildLongitudinalLabFlowsheet([
        fact('a'),
        { ...latest(), state: 'conflicting' },
      ])[0]?.deltaText,
    ).toBeNull();
  });
  it('excludes superseded/rejected/replaced facts without dropping unverified labels', () => {
    const rows = buildLongitudinalLabFlowsheet([
      fact('a', { state: 'extracted' }),
      fact('b', { state: 'superseded' }),
      fact('c', { state: 'rejected' }),
      fact('d', { replacedByFactId: 'a' }),
    ]);
    expect(rows[0]?.points.map((p) => [p.factId, p.state])).toEqual([
      ['a', 'extracted'],
    ]);
  });
  it('parses grouped thousands and avoids floating point noise', () => {
    const points = [
      fact('a', {
        value: {
          kind: 'lab',
          name: 'Platelets',
          valueText: '1,200',
          unitText: '/mcL',
        },
      }),
      fact('b', {
        observedOn: '2026-07-26',
        value: {
          kind: 'lab',
          name: 'Platelets',
          valueText: '1,400',
          unitText: '/mcL',
        },
      }),
    ];
    expect(buildLongitudinalLabFlowsheet(points)[0]?.deltaText).toBe(
      '+200 /mcL since 02 Jun 2026',
    );
  });
});

describe('medication history', () => {
  it('preserves dated doses and undated entries without inferring an active regimen', () => {
    const a = fact('a', {
      factType: 'medication.recorded',
      value: { kind: 'medication', name: 'Paclitaxel', doseText: '80 mg' },
    });
    const b = fact('b', {
      ...a,
      evidenceFactId: 'b',
      observedOn: '2026-07-26',
      state: 'extracted',
      value: { kind: 'medication', name: 'paclitaxel', doseText: '100 mg' },
    });
    const undated = fact('u', { ...a, evidenceFactId: 'u', observedOn: null });
    const history = buildMedicationHistory([b, undated, a]);
    expect(history).toHaveLength(1);
    expect(
      history[0]?.points.map((p) => [
        p.factId,
        p.observedOn,
        p.doseText,
        p.state,
      ]),
    ).toEqual([
      ['a', '2026-06-02', '80 mg', 'verified'],
      ['b', '2026-07-26', '100 mg', 'extracted'],
      ['u', null, '80 mg', 'verified'],
    ]);
    expect(history[0]?.points[0]).toMatchObject({
      documentId: 'doc-a',
      pageNumber: 2,
    });
  });
});

describe('ambiguous measurement units', () => {
  it('retains unitless source observations without assuming arithmetic compatibility', () => {
    const row = buildLongitudinalLabFlowsheet([
      fact('a', {
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '11.4' },
      }),
      fact('b', {
        observedOn: '2026-07-26',
        value: { kind: 'lab', name: 'Hemoglobin', valueText: '10.2' },
      }),
    ])[0]!;
    expect(row.points).toHaveLength(2);
    expect(row.unitText).toBeNull();
    expect(row.deltaText).toBeNull();
  });
});
