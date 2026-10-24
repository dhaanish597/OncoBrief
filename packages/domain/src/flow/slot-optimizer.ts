/** Operational eligibility only: never a medical clearance or urgency assessment. */
export type OpdStatus =
  | 'scheduled'
  | 'checked_in'
  | 'in_consult'
  | 'delayed_investigation'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'walk_in'
  | 'vacant';
export const OPD_TRANSITIONS: Record<OpdStatus, readonly OpdStatus[]> = {
  scheduled: ['checked_in', 'delayed_investigation', 'cancelled', 'no_show'],
  checked_in: ['in_consult', 'delayed_investigation', 'cancelled'],
  in_consult: ['completed', 'delayed_investigation'],
  delayed_investigation: ['checked_in', 'cancelled', 'vacant'],
  completed: [],
  cancelled: ['vacant'],
  no_show: ['vacant'],
  walk_in: ['in_consult', 'delayed_investigation', 'cancelled'],
  vacant: [],
};
export function canTransitionOpd(from: string, to: string): boolean {
  return (OPD_TRANSITIONS[from as OpdStatus] ?? []).includes(to as OpdStatus);
}
export interface OpdSlotInput {
  orgId: string;
  clinicDate: string;
  clinicKey: string;
  status: string;
}
export interface WaitlistCandidateInput {
  orgId: string;
  waitlistEntryId: string;
  patientId: string;
  patientName: string;
  readinessBand: string;
  clinicKey: string | null;
  priorityTag: string;
  prioritySourceQuote: string | null;
  priorityProvenance: string | null;
  requestedDate: string;
  createdAt: string;
  hasConflict: boolean;
  sourceAccessValid: boolean;
  status: string;
}
export interface BackfillCandidate {
  waitlistEntryId: string;
  patientId: string;
  patientName: string;
  readinessBand: string;
  priorityTag: string;
  prioritySourceQuote: string | null;
  priorityProvenance: string | null;
  requestedDate: string;
  rationale: string;
  eligible: true;
}
export function rankWaitlistForVacantSlot(
  slot: OpdSlotInput,
  candidates: readonly WaitlistCandidateInput[],
): BackfillCandidate[] {
  if (slot.status !== 'vacant') return [];
  // Only an explicit request for an expedited administrative slot sorts ahead.
  // Other documented labels do not establish a medical ordering.
  return candidates
    .filter(
      (c) =>
        c.orgId === slot.orgId &&
        c.clinicKey === slot.clinicKey &&
        c.readinessBand === 'ready' &&
        c.status === 'waiting' &&
        c.requestedDate <= slot.clinicDate &&
        !c.hasConflict &&
        c.sourceAccessValid,
    )
    .map((c) => ({
      ...c,
      priorityTag: c.priorityProvenance ? c.priorityTag : 'routine_followup',
    }))
    .sort(
      (a, b) =>
        Number(b.priorityTag === 'expedited_slot_requested') -
          Number(a.priorityTag === 'expedited_slot_requested') ||
        a.requestedDate.localeCompare(b.requestedDate) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.waitlistEntryId.localeCompare(b.waitlistEntryId),
    )
    .map((c) => ({
      waitlistEntryId: c.waitlistEntryId,
      patientId: c.patientId,
      patientName: c.patientName,
      readinessBand: c.readinessBand,
      priorityTag: c.priorityTag,
      prioritySourceQuote: c.prioritySourceQuote,
      priorityProvenance: c.priorityProvenance,
      requestedDate: c.requestedDate,
      eligible: true,
      rationale: `Record ready under administrative checklist; matching configured clinic; requested date reached; no overlapping appointment or active offer. ${c.priorityProvenance ? 'Priority: ' + c.priorityProvenance : 'No supported priority; routine operational order.'}`,
    }));
}
export function clinicLocalDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function operationalMetrics(x: {
  ready: number;
  scheduled: number;
  utilized: number;
  totalSlots: number;
  spanPassed: number;
  spanTotal: number;
}) {
  return {
    readyRate: x.scheduled ? x.ready / x.scheduled : null,
    utilization: x.totalSlots ? x.utilized / x.totalSlots : null,
    spanPassRate: x.spanTotal ? x.spanPassed / x.spanTotal : null,
  };
}
