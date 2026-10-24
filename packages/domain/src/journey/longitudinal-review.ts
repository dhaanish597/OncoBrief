import type { EvidenceStateValue } from '../evidence/state';
import type { FactType } from '../vocab/fact-types';
import type { FactValue } from '../vocab/fact-value';
import { toIsoDate } from '../vocab/observation-date';

/** A ledger read model, never a new clinical record or a source of truth. */
export interface TimelineFactInput {
  evidenceFactId: string;
  factType: FactType;
  value: FactValue;
  observedOn: string | null;
  state: EvidenceStateValue;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  verbatimQuote: string;
  createdAt: string;
  updatedAt?: string | null;
  ledgerSeq?: number;
  replacedByFactId?: string | null;
}

export interface DocumentMetaInput {
  documentId: string;
  uploadedAt: string;
}
export interface ConflictMetaInput {
  conflictSetId: string;
  status: 'open' | 'resolved' | 'dismissed';
  detectedAt: string;
  reopenedAt?: string | null;
  ledgerSeq?: number;
}
export interface IntervalDeltaSummary {
  baselineDate: string | null;
  newDocumentsCount: number;
  newFacts: TimelineFactInput[];
  reopenedOrNewConflictsCount: number;
  /** Current documented items, not inferred unmet clinical requirements. */
  pendingInvestigations: TimelineFactInput[];
  documentedInstructions: TimelineFactInput[];
}
export interface IntervalDeltaOptions {
  baselineLedgerSeq?: number;
  conflicts?: readonly ConflictMetaInput[];
}

function visible(fact: TimelineFactInput): boolean {
  return (
    fact.state !== 'rejected' &&
    fact.state !== 'superseded' &&
    !fact.replacedByFactId
  );
}

/** Dates are exclusive calendar-day boundaries; packet timestamps are exact instants. */
function boundary(value: string | null): number | null {
  if (value === null) return null;
  if (!toIsoDate(value)) throw new Error('invalid_baseline_date');
  const time = Date.parse(
    value.length === 10 ? `${value}T23:59:59.999Z` : value,
  );
  if (!Number.isFinite(time)) throw new Error('invalid_baseline_date');
  return time;
}
function after(
  value: string | null | undefined,
  since: number | null,
): boolean {
  if (!value || !toIsoDate(value)) return false;
  return since === null || Date.parse(value) > since;
}

export function computeIntervalDelta(
  facts: readonly TimelineFactInput[],
  documents: readonly DocumentMetaInput[],
  baselineDate: string | null,
  options: IntervalDeltaOptions = {},
): IntervalDeltaSummary {
  const since = boundary(baselineDate);
  const afterSequence = (seq?: number) =>
    options.baselineLedgerSeq !== undefined &&
    seq !== undefined &&
    seq > options.baselineLedgerSeq;
  const current = facts.filter(visible);
  const newFacts = current.filter(
    (f) =>
      since === null ||
      after(f.observedOn, since) ||
      after(f.createdAt, since) ||
      after(f.updatedAt, since) ||
      afterSequence(f.ledgerSeq),
  );
  const conflicts = (options.conflicts ?? []).filter(
    (c) =>
      c.status === 'open' &&
      (since === null ||
        after(c.detectedAt, since) ||
        after(c.reopenedAt, since) ||
        afterSequence(c.ledgerSeq)),
  );
  return {
    baselineDate,
    newDocumentsCount: new Set(
      documents
        .filter((d) => since === null || after(d.uploadedAt, since))
        .map((d) => d.documentId),
    ).size,
    newFacts,
    reopenedOrNewConflictsCount: new Set(conflicts.map((c) => c.conflictSetId))
      .size,
    pendingInvestigations: current.filter(
      (f) => f.factType === 'pending_investigation.recorded',
    ),
    documentedInstructions: current.filter(
      (f) => f.factType === 'instruction.recorded',
    ),
  };
}

export interface SourcePoint {
  factId: string;
  observedOn: string | null;
  state: EvidenceStateValue;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  verbatimQuote: string;
}
export interface LabSeriesRow {
  testName: string;
  unitText: string | null;
  points: (SourcePoint & { valueText: string; numericValue: number | null })[];
  /** Arithmetic only, without classifications or statements about response. */
  deltaText: string | null;
}
function source(f: TimelineFactInput): SourcePoint {
  return {
    factId: f.evidenceFactId,
    observedOn: toIsoDate(f.observedOn),
    state: f.state,
    documentId: f.documentId,
    documentName: f.documentName,
    pageNumber: f.pageNumber,
    verbatimQuote: f.verbatimQuote,
  };
}
function order(a: SourcePoint, b: SourcePoint): number {
  return (
    (a.observedOn ?? '9999-99-99').localeCompare(
      b.observedOn ?? '9999-99-99',
    ) || a.factId.localeCompare(b.factId)
  );
}
function numeric(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replaceAll(',', ''));
  return Number.isFinite(value) ? value : null;
}
function key(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildLongitudinalLabFlowsheet(
  facts: readonly TimelineFactInput[],
): LabSeriesRow[] {
  const rows = new Map<string, LabSeriesRow>();
  for (const f of facts) {
    if (
      !visible(f) ||
      (f.factType !== 'lab_result.as_written' &&
        f.factType !== 'vital_sign.as_written') ||
      f.value.kind !== 'lab'
    )
      continue;
    const value = f.value;
    const unit = value.unitText?.trim() || null;
    // Preserve exact units: no normalization across unit systems or clinical conversion.
    const rowKey = JSON.stringify([f.factType, key(value.name), unit]);
    let row = rows.get(rowKey);
    if (!row) {
      row = {
        testName: value.name,
        unitText: unit,
        points: [],
        deltaText: null,
      };
      rows.set(rowKey, row);
    }
    row.points.push({
      ...source(f),
      valueText: value.valueText,
      numericValue: numeric(value.valueText),
    });
  }
  for (const row of rows.values()) {
    row.points.sort(order);
    const dated = row.points.filter((p) => p.observedOn !== null);
    const dates = [...new Set(dated.map((p) => p.observedOn!))];
    if (dates.length < 2 || row.unitText === null) continue;
    const latest = dated.filter((p) => p.observedOn === dates.at(-1));
    const prior = dated.filter((p) => p.observedOn === dates.at(-2));
    if (latest.length !== 1 || prior.length !== 1) continue;
    const a = prior[0]!;
    const b = latest[0]!;
    if (
      a.numericValue === null ||
      b.numericValue === null ||
      a.state === 'conflicting' ||
      b.state === 'conflicting'
    )
      continue;
    const difference = Number((b.numericValue - a.numericValue).toFixed(10));
    if (!Number.isFinite(difference)) continue;
    const date = new Date(`${a.observedOn}T00:00:00Z`);
    const formatted = `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    row.deltaText = `${difference > 0 ? '+' : ''}${difference}${row.unitText ? ` ${row.unitText}` : ''} since ${formatted}`;
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.testName.localeCompare(b.testName) ||
      (a.unitText ?? '').localeCompare(b.unitText ?? ''),
  );
}
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface MedicationHistoryRow {
  medicationName: string;
  points: (SourcePoint & { doseText: string | null })[];
}
/** Recorded mentions only: never infers active, stopped, start/end, or recommended doses. */
export function buildMedicationHistory(
  facts: readonly TimelineFactInput[],
): MedicationHistoryRow[] {
  const rows = new Map<string, MedicationHistoryRow>();
  for (const f of facts) {
    if (
      !visible(f) ||
      f.factType !== 'medication.recorded' ||
      f.value.kind !== 'medication'
    )
      continue;
    const name = key(f.value.name);
    let row = rows.get(name);
    if (!row) {
      row = { medicationName: f.value.name, points: [] };
      rows.set(name, row);
    }
    row.points.push({ ...source(f), doseText: f.value.doseText ?? null });
  }
  for (const row of rows.values()) row.points.sort(order);
  return [...rows.values()].sort((a, b) =>
    a.medicationName.localeCompare(b.medicationName),
  );
}
