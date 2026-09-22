export const EVIDENCE_STATES = [
  'extracted',
  'verified',
  'conflicting',
  'corrected',
  'rejected',
  'superseded',
] as const;

export type EvidenceStateValue = (typeof EVIDENCE_STATES)[number];

export const LEDGER_ACTIONS = [
  'fact_extracted',
  'fact_verified',
  'fact_corrected',
  'fact_rejected',
  'fact_flagged_conflicting',
  'conflict_resolved',
  'fact_superseded',
  'fact_reinstated',
] as const;

export type LedgerAction = (typeof LEDGER_ACTIONS)[number];

export const RESOLUTION_KINDS = ['retain_both', 'mark_superseded', 'corrected'] as const;
export type ResolutionKind = (typeof RESOLUTION_KINDS)[number];

export const EXTRACTOR_KINDS = ['rule', 'llm', 'human', 'fixture'] as const;
export type ExtractorKind = (typeof EXTRACTOR_KINDS)[number];

export const CONFIDENCE_BANDS = ['high', 'medium', 'low'] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const EVIDENCE_STATE_LABEL: Record<EvidenceStateValue, string> = {
  extracted: 'Extracted — not yet verified',
  verified: 'Verified',
  conflicting: 'Conflicting — two sources disagree',
  corrected: 'Corrected — original preserved',
  rejected: 'Rejected — retained for audit',
  superseded: 'Superseded — source retained',
};

/** States from which no further transition is possible. */
export const TERMINAL_STATES: readonly EvidenceStateValue[] = ['corrected', 'superseded'];

/** A state that renders as unfinished rather than settled. */
export function isSettled(state: EvidenceStateValue): boolean {
  return state === 'verified' || state === 'corrected';
}
