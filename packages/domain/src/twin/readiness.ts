/**
 * Record Readiness — operational, explicitly not clinical (architecture §9.3).
 *
 * A band, not a score. `ready` / `gaps` / `blocked` from explicit rules. A
 * 0–100 number invites reading as patient acuity; a band with a stated rule
 * cannot be mistaken for a risk score. CLAUDE.md forbids risk scoring, and the
 * safest way to honour that is to make the output shape incapable of
 * expressing it.
 */

export type ReadinessBand = 'ready' | 'gaps' | 'blocked';

export interface ReadinessInput {
  requiredItems: number;
  satisfiedItems: number;
  missingRequired: number;
  missingExpected: number;
  partialItems: number;
  unresolvedConflicts: number;
  unverifiedFacts: number;
  openTasks: number;
  overdueTasks: number;
  duplicateDocuments: number;
  staleVerifiedFacts: number;
}

export interface ReadinessResult {
  band: ReadinessBand;
  reasons: string[];
}

export const READINESS_BAND_LABEL: Record<ReadinessBand, string> = {
  ready: 'Record ready',
  gaps: 'Gaps to close',
  blocked: 'Blocked',
};

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const reasons: string[] = [];

  if (input.missingRequired > 0) {
    reasons.push(
      `${input.missingRequired} required document${plural(input.missingRequired)} missing`,
    );
  }
  if (input.unresolvedConflicts > 0) {
    reasons.push(
      `${input.unresolvedConflicts} unresolved source conflict${plural(input.unresolvedConflicts)}`,
    );
  }

  if (reasons.length > 0) {
    return { band: 'blocked', reasons };
  }

  if (input.missingExpected > 0) {
    reasons.push(`${input.missingExpected} expected document${plural(input.missingExpected)} absent`);
  }
  if (input.partialItems > 0) {
    reasons.push(`${input.partialItems} document type not yet confirmed`);
  }
  if (input.unverifiedFacts > 0) {
    reasons.push(
      `${input.unverifiedFacts} extracted fact${plural(input.unverifiedFacts)} not yet verified`,
    );
  }
  if (input.overdueTasks > 0) {
    reasons.push(`${input.overdueTasks} overdue administrative task${plural(input.overdueTasks)}`);
  }

  if (reasons.length > 0) {
    return { band: 'gaps', reasons };
  }

  return { band: 'ready', reasons: ['All required documents present; no open conflicts'] };
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}
