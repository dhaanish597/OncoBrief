import { describe, expect, it } from 'vitest';
import {
  compareFacts,
  detectConflicts,
  makeSlotKey,
  type ComparableFact,
  type FactValue,
} from '../src/index.js';

function fact(id: string, factType: ComparableFact['factType'], value: FactValue): ComparableFact {
  return { id, factType, slotKey: makeSlotKey(factType, value), value };
}

describe('comparators', () => {
  it('detects a genuine date disagreement between two documents', () => {
    const a = fact('a', 'document.date', { kind: 'date', date: '2025-06-12' });
    const b = fact('b', 'document.date', { kind: 'date', date: '2025-07-03' });
    expect(compareFacts(a, b)).toBe('disagree');
  });

  it('agrees on the same date', () => {
    const a = fact('a', 'document.date', { kind: 'date', date: '2025-06-12' });
    const b = fact('b', 'document.date', { kind: 'date', date: '2025-06-12' });
    expect(compareFacts(a, b)).toBe('agree');
  });

  it('allows a one-day tolerance for appointments', () => {
    const a = fact('a', 'appointment.recorded', { kind: 'appointment', date: '2025-06-12' });
    const b = fact('b', 'appointment.recorded', { kind: 'appointment', date: '2025-06-13' });
    expect(compareFacts(a, b)).toBe('agree');
    const c = fact('c', 'appointment.recorded', { kind: 'appointment', date: '2025-06-20' });
    expect(compareFacts(a, c)).toBe('disagree');
  });

  it('treats differing units as incomparable, not disagreeing', () => {
    const a = fact('a', 'lab_result.as_written', { kind: 'lab', name: 'CA 15-3', valueText: '32', unitText: 'U/mL' });
    const b = fact('b', 'lab_result.as_written', { kind: 'lab', name: 'CA 15-3', valueText: '32', unitText: 'kU/L' });
    expect(compareFacts(a, b)).toBe('incomparable');
  });

  it('compares lab values when units match', () => {
    const a = fact('a', 'lab_result.as_written', { kind: 'lab', name: 'CA 15-3', valueText: '32', unitText: 'U/mL' });
    const b = fact('b', 'lab_result.as_written', { kind: 'lab', name: 'CA 15-3', valueText: '32', unitText: 'u/ml' });
    expect(compareFacts(a, b)).toBe('agree');
  });

  it('returns incomparable for mismatched value shapes', () => {
    const a = fact('a', 'document.issuing_facility', { kind: 'facility', name: 'Hospital A' });
    const b = fact('b', 'document.issuing_facility', { kind: 'text', text: 'Hospital B' });
    expect(compareFacts(a, b)).toBe('incomparable');
  });

  it('never compares facts with different slot keys', () => {
    const a = fact('a', 'medication.recorded', { kind: 'medication', name: 'Tamoxifen' });
    const b = fact('b', 'medication.recorded', { kind: 'medication', name: 'Letrozole' });
    expect(compareFacts(a, b)).toBe('incomparable');
  });
});

describe('slot keys', () => {
  it('groups the same drug case-insensitively', () => {
    const a = makeSlotKey('medication.recorded', { kind: 'medication', name: 'Tamoxifen' });
    const b = makeSlotKey('medication.recorded', { kind: 'medication', name: '  tamoxifen ' });
    expect(a).toBe(b);
  });

  it('separates different drugs', () => {
    const a = makeSlotKey('medication.recorded', { kind: 'medication', name: 'Tamoxifen' });
    const b = makeSlotKey('medication.recorded', { kind: 'medication', name: 'Letrozole' });
    expect(a).not.toBe(b);
  });
});

describe('detector', () => {
  it('detects a disagreement from two real documents', () => {
    const facts = [
      fact('f1', 'document.date', { kind: 'date', date: '2025-06-12' }),
      fact('f2', 'document.date', { kind: 'date', date: '2025-07-03' }),
    ];
    const conflicts = detectConflicts(facts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBe('disagreement');
    expect(conflicts[0]!.memberIds).toEqual(['f1', 'f2']);
  });

  it('produces no conflict when all facts agree', () => {
    const facts = [
      fact('f1', 'document.date', { kind: 'date', date: '2025-06-12' }),
      fact('f2', 'document.date', { kind: 'date', date: '2025-06-12' }),
    ];
    expect(detectConflicts(facts)).toHaveLength(0);
  });

  it('surfaces incomparable pairs as needs-human-comparison rather than hiding them', () => {
    const facts = [
      fact('f1', 'lab_result.as_written', { kind: 'lab', name: 'CA 15-3', valueText: '32', unitText: 'U/mL' }),
      fact('f2', 'lab_result.as_written', { kind: 'lab', name: 'CA 15-3', valueText: '32', unitText: 'kU/L' }),
    ];
    const conflicts = detectConflicts(facts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBe('incomparable');
  });

  it('is idempotent — the fingerprint is a deterministic function of member ids', () => {
    const facts = [
      fact('f1', 'document.date', { kind: 'date', date: '2025-06-12' }),
      fact('f2', 'document.date', { kind: 'date', date: '2025-07-03' }),
    ];
    const first = detectConflicts(facts)[0]!;
    const second = detectConflicts([...facts].reverse())[0]!;
    expect(first.memberFingerprint).toBe(second.memberFingerprint);
  });

  it('does not compare across fact types', () => {
    const facts = [
      fact('f1', 'document.date', { kind: 'date', date: '2025-06-12' }),
      fact('f2', 'followup.recorded', { kind: 'date', date: '2025-07-03' }),
    ];
    expect(detectConflicts(facts)).toHaveLength(0);
  });
});
