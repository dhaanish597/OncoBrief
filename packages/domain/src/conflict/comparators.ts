import { normalizeForComparison } from '../provenance/normalize.js';
import type { FactType } from '../vocab/fact-types.js';
import type { FactValue } from '../vocab/fact-value.js';

/**
 * Deterministic conflict comparators (architecture §8.2).
 *
 * Never an LLM. `incomparable` is a deliberate third outcome: silently treating
 * "we cannot compare these" as "they agree" is exactly the omission failure
 * mode the research flags. Incomparable pairs are surfaced as *needs human
 * comparison*, not hidden.
 */

export type ComparisonVerdict = 'agree' | 'disagree' | 'incomparable';

export interface ComparableFact {
  id: string;
  factType: FactType;
  slotKey: string;
  value: FactValue;
}

export interface Comparator {
  factType: FactType;
  version: string;
  compare(a: ComparableFact, b: ComparableFact): ComparisonVerdict;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateVerdict(a: string, b: string, toleranceDays: number): ComparisonVerdict {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 'incomparable';
  const diff = Math.abs(ta - tb) / DAY_MS;
  return diff <= toleranceDays ? 'agree' : 'disagree';
}

function normalizedEqual(a: string, b: string): ComparisonVerdict {
  return normalizeForComparison(a).toLowerCase() === normalizeForComparison(b).toLowerCase()
    ? 'agree'
    : 'disagree';
}

function kindMismatch(a: FactValue, b: FactValue): boolean {
  return a.kind !== b.kind;
}

function textualComparator(factType: FactType): Comparator {
  return {
    factType,
    version: 'v1',
    compare(a, b) {
      if (a.value.kind !== 'text' || b.value.kind !== 'text') return 'incomparable';
      return normalizedEqual(a.value.text, b.value.text);
    },
  };
}

function dateComparator(factType: FactType, toleranceDays: number): Comparator {
  return {
    factType,
    version: 'v1',
    compare(a, b) {
      const av = a.value.kind === 'date' ? a.value.date : a.value.kind === 'appointment' ? a.value.date : null;
      const bv = b.value.kind === 'date' ? b.value.date : b.value.kind === 'appointment' ? b.value.date : null;
      if (av === null || bv === null) return 'incomparable';
      return dateVerdict(av, bv, toleranceDays);
    },
  };
}

export const COMPARATORS: Record<FactType, Comparator> = {
  'document.date': dateComparator('document.date', 0),
  'document.issuing_facility': {
    factType: 'document.issuing_facility',
    version: 'v1',
    compare(a, b) {
      if (a.value.kind !== 'facility' || b.value.kind !== 'facility') return 'incomparable';
      return normalizedEqual(a.value.name, b.value.name);
    },
  },
  'document.type_as_written': textualComparator('document.type_as_written'),
  'procedure.recorded': {
    factType: 'procedure.recorded',
    version: 'v1',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'procedure' || b.value.kind !== 'procedure') {
        return 'incomparable';
      }
      if (a.value.code && b.value.code) {
        return a.value.code === b.value.code ? 'agree' : 'disagree';
      }
      return normalizedEqual(a.value.name, b.value.name);
    },
  },
  'medication.recorded': {
    factType: 'medication.recorded',
    version: 'v1',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'medication' || b.value.kind !== 'medication') {
        return 'incomparable';
      }
      return normalizedEqual(a.value.name, b.value.name);
    },
  },
  'appointment.recorded': dateComparator('appointment.recorded', 1),
  'diagnosis_text.as_written': textualComparator('diagnosis_text.as_written'),
  'stage_text.as_written': textualComparator('stage_text.as_written'),
  'lab_result.as_written': {
    factType: 'lab_result.as_written',
    version: 'v1',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'lab' || b.value.kind !== 'lab') {
        return 'incomparable';
      }
      const unitA = normalizeForComparison(a.value.unitText ?? '').toLowerCase();
      const unitB = normalizeForComparison(b.value.unitText ?? '').toLowerCase();
      // Mismatched units are incomparable, never a fabricated disagreement.
      if (unitA !== unitB) return 'incomparable';
      return normalizedEqual(a.value.valueText, b.value.valueText);
    },
  },
  'imaging.recorded': {
    factType: 'imaging.recorded',
    version: 'v1',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'procedure' || b.value.kind !== 'procedure') {
        return 'incomparable';
      }
      if (a.value.code && b.value.code) return a.value.code === b.value.code ? 'agree' : 'disagree';
      return normalizedEqual(a.value.name, b.value.name);
    },
  },
  'radiation.recorded': {
    factType: 'radiation.recorded',
    version: 'v1',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'procedure' || b.value.kind !== 'procedure') {
        return 'incomparable';
      }
      return normalizedEqual(a.value.name, b.value.name);
    },
  },
  'chemotherapy_cycle.recorded': {
    factType: 'chemotherapy_cycle.recorded',
    version: 'v1',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'cycle' || b.value.kind !== 'cycle') {
        return 'incomparable';
      }
      return normalizedEqual(a.value.label, b.value.label);
    },
  },
  'referral.recorded': textualComparator('referral.recorded'),
  'followup.recorded': dateComparator('followup.recorded', 1),
  'consent.recorded': dateComparator('consent.recorded', 0),
  'identifier.mrn': {
    factType: 'identifier.mrn',
    version: 'v1',
    compare(a, b) {
      if (a.value.kind !== 'identifier' || b.value.kind !== 'identifier') return 'incomparable';
      if (a.value.system !== b.value.system) return 'incomparable';
      return normalizedEqual(a.value.value, b.value.value);
    },
  },
  'identifier.abha': {
    factType: 'identifier.abha',
    version: 'v1',
    compare(a, b) {
      if (a.value.kind !== 'identifier' || b.value.kind !== 'identifier') return 'incomparable';
      return normalizedEqual(a.value.value, b.value.value);
    },
  },
};

export function compareFacts(a: ComparableFact, b: ComparableFact): ComparisonVerdict {
  if (a.factType !== b.factType || a.slotKey !== b.slotKey) return 'incomparable';
  return COMPARATORS[a.factType].compare(a, b);
}
