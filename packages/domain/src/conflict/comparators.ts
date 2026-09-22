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
  /** The date the fact refers to. Compared for dated-event fact types. */
  observedOn?: string | Date | null;
}

/**
 * Fact types that describe one document rather than the patient. Two documents
 * legitimately carry different dates, facilities and type labels, so these are
 * never cross-compared. Every other fact type shares a slot across documents and
 * is a comparison candidate.
 */
export const DOCUMENT_SCOPED_FACT_TYPES: readonly FactType[] = [
  'document.date',
  'document.issuing_facility',
  'document.type_as_written',
];

export function isDocumentScopedFactType(factType: FactType): boolean {
  return DOCUMENT_SCOPED_FACT_TYPES.includes(factType);
}

export interface Comparator {
  factType: FactType;
  version: string;
  compare(a: ComparableFact, b: ComparableFact): ComparisonVerdict;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Accept a date as either an ISO date string or a `Date` and normalise to
 * `YYYY-MM-DD`. Database drivers return `date` columns as `Date` objects, and a
 * comparator that silently treats one as unparseable would manufacture a
 * conflict that does not exist.
 */
export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1]! : null;
}

function dateVerdict(a: string | Date, b: string | Date, toleranceDays: number): ComparisonVerdict {
  const sa = toIsoDate(a);
  const sb = toIsoDate(b);
  if (sa === null || sb === null) return 'incomparable';
  const ta = Date.parse(`${sa}T00:00:00Z`);
  const tb = Date.parse(`${sb}T00:00:00Z`);
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
  // document.* are document-scoped and are never compared; the entries exist so
  // the record is total, and they return `incomparable` defensively.
  'document.date': {
    factType: 'document.date',
    version: 'v1',
    compare: () => 'incomparable',
  },
  'document.issuing_facility': {
    factType: 'document.issuing_facility',
    version: 'v1',
    compare: () => 'incomparable',
  },
  'document.type_as_written': {
    factType: 'document.type_as_written',
    version: 'v1',
    compare: () => 'incomparable',
  },
  'procedure.recorded': {
    factType: 'procedure.recorded',
    version: 'v2',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'procedure' || b.value.kind !== 'procedure') {
        return 'incomparable';
      }
      const named =
        a.value.code && b.value.code
          ? a.value.code === b.value.code
            ? 'agree'
            : 'disagree'
          : normalizedEqual(a.value.name, b.value.name);
      if (named === 'disagree') return 'disagree';
      // Same procedure: the two documents may still disagree about when it
      // happened, which is the contradiction the reconciliation room exists for.
      if (a.observedOn && b.observedOn) return dateVerdict(a.observedOn, b.observedOn, 0);
      return 'agree';
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
    version: 'v2',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'procedure' || b.value.kind !== 'procedure') {
        return 'incomparable';
      }
      const named =
        a.value.code && b.value.code
          ? a.value.code === b.value.code
            ? 'agree'
            : 'disagree'
          : normalizedEqual(a.value.name, b.value.name);
      if (named === 'disagree') return 'disagree';
      if (a.observedOn && b.observedOn) return dateVerdict(a.observedOn, b.observedOn, 0);
      return 'agree';
    },
  },
  'radiation.recorded': {
    factType: 'radiation.recorded',
    version: 'v2',
    compare(a, b) {
      if (kindMismatch(a.value, b.value) || a.value.kind !== 'procedure' || b.value.kind !== 'procedure') {
        return 'incomparable';
      }
      const named = normalizedEqual(a.value.name, b.value.name);
      if (named === 'disagree') return 'disagree';
      if (a.observedOn && b.observedOn) return dateVerdict(a.observedOn, b.observedOn, 0);
      return 'agree';
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
