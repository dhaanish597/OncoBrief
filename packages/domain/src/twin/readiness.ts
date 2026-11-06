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

export const WORKLIST_BAND_FILTER_VALUES = ['all', 'ready', 'gaps', 'blocked', 'none'] as const;
export type WorklistBandFilter = (typeof WORKLIST_BAND_FILTER_VALUES)[number];

export interface WorklistPatientFilterable {
  id: string;
  displayName: string;
  mrn?: string | null;
  demoCode?: string | null;
  readinessBand: string | null;
  primaryClinicianName?: string | null;
  departmentName?: string | null;
  openConflicts?: number;
  unverifiedFacts?: number;
}

export interface WorklistFilterCriteria {
  search?: string;
  band?: string;
  clinician?: string;
  department?: string;
}

export interface WorklistReadinessSummary {
  totalPatients: number;
  readyCount: number;
  gapsCount: number;
  blockedCount: number;
  unassessedCount: number;
  totalConflicts: number;
  totalUnverified: number;
}

export function computeWorklistReadinessSummary(
  patients: readonly WorklistPatientFilterable[],
): WorklistReadinessSummary {
  let readyCount = 0;
  let gapsCount = 0;
  let blockedCount = 0;
  let unassessedCount = 0;
  let totalConflicts = 0;
  let totalUnverified = 0;

  for (const p of patients) {
    if (p.readinessBand === 'ready') readyCount += 1;
    else if (p.readinessBand === 'gaps') gapsCount += 1;
    else if (p.readinessBand === 'blocked') blockedCount += 1;
    else unassessedCount += 1;

    totalConflicts += p.openConflicts ?? 0;
    totalUnverified += p.unverifiedFacts ?? 0;
  }

  return {
    totalPatients: patients.length,
    readyCount,
    gapsCount,
    blockedCount,
    unassessedCount,
    totalConflicts,
    totalUnverified,
  };
}

export function filterWorklistPatients<T extends WorklistPatientFilterable>(
  patients: readonly T[],
  criteria: WorklistFilterCriteria,
): T[] {
  const searchFilter = criteria.search?.trim().toLowerCase() ?? '';
  const bandFilter = criteria.band?.trim().toLowerCase() || 'all';
  const clinicianFilter = criteria.clinician?.trim().toLowerCase() ?? '';
  const departmentFilter = criteria.department?.trim().toLowerCase() ?? '';

  return patients.filter((p) => {
    if (searchFilter) {
      const matchName = p.displayName.toLowerCase().includes(searchFilter);
      const matchMrn = p.mrn?.toLowerCase().includes(searchFilter) ?? false;
      const matchDemo = p.demoCode?.toLowerCase().includes(searchFilter) ?? false;
      if (!matchName && !matchMrn && !matchDemo) return false;
    }
    if (bandFilter !== 'all') {
      if (bandFilter === 'none') {
        if (p.readinessBand !== null && p.readinessBand !== '') return false;
      } else if ((p.readinessBand ?? '').toLowerCase() !== bandFilter) {
        return false;
      }
    }
    if (clinicianFilter) {
      if (!p.primaryClinicianName || !p.primaryClinicianName.toLowerCase().includes(clinicianFilter)) {
        return false;
      }
    }
    if (departmentFilter) {
      if (!p.departmentName || !p.departmentName.toLowerCase().includes(departmentFilter)) {
        return false;
      }
    }
    return true;
  });
}

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
