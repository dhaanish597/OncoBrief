/**
 * Closed `task_kind` vocabulary (architecture §10.2).
 *
 * All entries are records-office actions. There is deliberately no
 * `order_test`, `escalate_urgent` or `review_priority` — those would be
 * inferred medical requirements or urgency determination (CLAUDE.md).
 *
 * Adding an entry requires a new decision record.
 */
export const TASK_KINDS = [
  'retrieve_document',
  'clarify_with_facility',
  'confirm_identifier',
  'request_authorization',
  'schedule_appointment_followup',
  'obtain_consent_form',
  'resolve_duplicate',
  'verify_evidence_batch',
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

const SET: ReadonlySet<string> = new Set(TASK_KINDS);

export function isTaskKind(value: string): value is TaskKind {
  return SET.has(value);
}

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  retrieve_document: 'Retrieve document',
  clarify_with_facility: 'Clarify with facility',
  confirm_identifier: 'Confirm identifier',
  request_authorization: 'Request authorization',
  schedule_appointment_followup: 'Schedule documented follow-up',
  obtain_consent_form: 'Obtain consent form',
  resolve_duplicate: 'Resolve duplicate',
  verify_evidence_batch: 'Verify evidence batch',
};

export const TASK_ORIGIN_KINDS = ['evidence', 'record_gap', 'conflict', 'document'] as const;
export type TaskOriginKind = (typeof TASK_ORIGIN_KINDS)[number];

export const TASK_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
