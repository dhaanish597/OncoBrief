import { describe, expect, it } from 'vitest';
import {
  compareFacts,
  detectConflicts,
  makeSlotKey,
  toIsoDate,
  type ComparableFact,
  type FactValue,
} from '../src/index';

function lab(
  id: string,
  date: string | null,
  valueText = '11.4',
): ComparableFact {
  return {
    id,
    factType: 'lab_result.as_written',
    slotKey: 'lab_result.as_written|lab:hemoglobin',
    value: { kind: 'lab', name: 'Hemoglobin', valueText, unitText: 'g/dL' },
    observedOn: date,
  };
}
function drug(
  id: string,
  date: string | null,
  doseText?: string,
): ComparableFact {
  return {
    id,
    factType: 'medication.recorded',
    slotKey: 'medication.recorded|drug:paclitaxel',
    value: {
      kind: 'medication',
      name: 'Paclitaxel',
      ...(doseText ? { doseText } : {}),
    },
    observedOn: date,
  };
}

describe('dated source comparisons', () => {
  it('keeps serial observations out of an unrelated same-day conflict (legacy keys)', () => {
    const conflicts = detectConflicts([
      lab('old', '2026-06-02'),
      lab('a', '2026-07-26', '10.2'),
      lab('b', '2026-07-26', '13.8'),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.memberIds).toEqual(['a', 'b']);
  });
  it('separates adjacent-day observations', () => {
    expect(
      detectConflicts([lab('a', '2026-06-02'), lab('b', '2026-06-03', '10.2')]),
    ).toEqual([]);
  });
  it('creates separate conflicts for independent dates', () => {
    const sets = detectConflicts([
      lab('a', '2026-06-02'),
      lab('b', '2026-06-02', '10'),
      lab('c', '2026-07-26'),
      lab('d', '2026-07-26', '9'),
    ]);
    expect(sets.map((s) => s.memberIds)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('detects same-day medication dose discrepancies', () => {
    expect(
      compareFacts(
        drug('a', '2026-06-02', '80 mg'),
        drug('b', '2026-06-02', '100 mg'),
      ),
    ).toBe('disagree');
  });
  it('allows recorded medication changes on distinct dates', () => {
    expect(
      compareFacts(
        drug('a', '2026-06-02', '80 mg'),
        drug('b', '2026-06-03', '100 mg'),
      ),
    ).toBe('agree');
  });
  it('treats an omitted dose as unknown rather than agreement', () => {
    expect(
      compareFacts(drug('a', '2026-06-02', '80 mg'), drug('b', '2026-06-02')),
    ).toBe('incomparable');
  });
  it.each([null, 'not dated', '2026-02-30'])(
    'does not equate a dated and ambiguous observation: %s',
    (date) => {
      expect(compareFacts(lab('a', '2026-06-02'), lab('b', date))).toBe(
        'incomparable',
      );
    },
  );
  it('retains disagreement between different undated values', () => {
    expect(compareFacts(lab('a', null), lab('b', null, '9'))).toBe('disagree');
  });
  it('validates actual calendar dates', () => {
    expect(toIsoDate('2026-02-30')).toBeNull();
    expect(toIsoDate('2026-06-02garbage')).toBeNull();
    expect(toIsoDate(new Date('invalid'))).toBeNull();
    expect(toIsoDate('2024-02-29')).toBe('2024-02-29');
  });
  it('dates newly computed slots without changing the default legacy key', () => {
    const value: FactValue = {
      kind: 'lab',
      name: 'Hemoglobin',
      valueText: '11.4',
    };
    expect(makeSlotKey('lab_result.as_written', value, '2026-06-02')).toBe(
      'lab_result.as_written|lab:hemoglobin@2026-06-02',
    );
    expect(makeSlotKey('lab_result.as_written', value)).toBe(
      'lab_result.as_written|lab:hemoglobin',
    );
  });
  it('compares legacy and new slots for the same observation', () => {
    const a = lab('a', '2026-06-02');
    const b = {
      ...lab('b', '2026-06-02', '9'),
      slotKey: 'lab_result.as_written|lab:hemoglobin@2026-06-02',
    };
    expect(detectConflicts([a, b])[0]?.memberIds).toEqual(['a', 'b']);
  });
});
