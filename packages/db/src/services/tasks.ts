import {
  can,
  isTaskKind,
  transitionTask,
  type Permission,
  type Role,
  type TaskKind,
  type TaskStatus,
} from '@oncobrief/domain';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';

/**
 * Source-backed administrative tasks (architecture §10).
 *
 * `task_must_have_source` (DB CHECK) is the anti-Kanban constraint: the
 * database refuses to store a task that is not anchored to evidence, a gap, a
 * conflict or a document. There is no "add task" affordance anywhere in the UI.
 */

export type TaskOrigin =
  | { kind: 'evidence'; evidenceFactId: string }
  | { kind: 'record_gap'; recordGapId: string }
  | { kind: 'conflict'; conflictSetId: string }
  | { kind: 'document'; documentId: string };

export interface CreateTaskInput {
  orgId: string;
  patientId: string;
  title: string;
  detail?: string | null;
  taskKind: TaskKind;
  dueOn?: string | null;
  origin: TaskOrigin;
  createdBy: string;
  assignedTo?: string | null;
}

export async function createTask(q: Querier, input: CreateTaskInput): Promise<string> {
  validateTaskDueDate(input.dueOn);
  if (!isTaskKind(input.taskKind)) throw new Error(`unknown_task_kind:${input.taskKind}`);

  const context = await q.query<{ app_user: string | null; db_user: string }>(
    `SELECT nullif(current_setting('app.user_id',true),'') AS app_user,current_user AS db_user`,
  );
  if (context.rows[0]?.app_user || context.rows[0]?.db_user === 'oncobrief_app') {
    const actor = await requireTaskActor(q, input.createdBy, 'task:create');
    if (actor.org_id !== input.orgId) throw new Error('forbidden');
  }
  const patient = await q.query('SELECT id FROM patient WHERE id=$1 AND org_id=$2 FOR UPDATE', [
    input.patientId,
    input.orgId,
  ]);
  if (!patient.rows[0]) throw new Error('patient_not_found');
  const source =
    input.origin.kind === 'evidence'
      ? {
          table: 'evidence_fact',
          id: input.origin.evidenceFactId,
          column: 'origin_evidence_fact_id',
        }
      : input.origin.kind === 'record_gap'
        ? {
            table: 'record_gap',
            id: input.origin.recordGapId,
            column: 'origin_record_gap_id',
          }
        : input.origin.kind === 'conflict'
          ? {
              table: 'conflict_set',
              id: input.origin.conflictSetId,
              column: 'origin_conflict_set_id',
            }
          : {
              table: 'document',
              id: input.origin.documentId,
              column: 'origin_document_id',
            };
  const sourceRow = await q.query(
    `SELECT id FROM ${source.table} WHERE id=$1 AND org_id=$2 AND patient_id=$3`,
    [source.id, input.orgId, input.patientId],
  );
  if (!sourceRow.rows[0]) throw new Error('task_source_not_accessible');
  if (
    input.assignedTo &&
    !(await listPermittedTaskAssignees(q)).some((m) => m.userId === input.assignedTo)
  )
    throw new Error('invalid_assignee');
  if (input.origin.kind === 'evidence' || input.origin.kind === 'record_gap') {
    const existing = await q.query<{ id: string }>(
      `SELECT id FROM admin_task WHERE org_id=$1 AND patient_id=$2 AND ${source.column}=$3 ORDER BY created_at,id LIMIT 1`,
      [input.orgId, input.patientId, source.id],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const origin = input.origin;
  const res = await q.query<{ id: string }>(
    `INSERT INTO admin_task
       (org_id, patient_id, title, detail, task_kind, due_on, origin_kind,
        origin_evidence_fact_id, origin_record_gap_id, origin_conflict_set_id, origin_document_id,
        created_by, assigned_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      input.orgId,
      input.patientId,
      input.title,
      input.detail ?? null,
      input.taskKind,
      input.dueOn ?? null,
      origin.kind,
      origin.kind === 'evidence' ? origin.evidenceFactId : null,
      origin.kind === 'record_gap' ? origin.recordGapId : null,
      origin.kind === 'conflict' ? origin.conflictSetId : null,
      origin.kind === 'document' ? origin.documentId : null,
      input.createdBy,
      input.assignedTo ?? null,
    ],
  );
  const taskId = res.rows[0]!.id;

  await q.query(
    `INSERT INTO task_event (org_id, task_id, action, to_status, actor_user_id, note)
     VALUES ($1,$2,'created','open',$3,$4)`,
    [input.orgId, taskId, input.createdBy, `Origin: ${origin.kind}`],
  );

  if (input.assignedTo) {
    await q.query(
      `INSERT INTO task_event (org_id, task_id, action, from_status, to_status, actor_user_id)
       VALUES ($1,$2,'assigned','open','assigned',$3)`,
      [input.orgId, taskId, input.createdBy],
    );
    await q.query(`UPDATE admin_task SET status = 'assigned' WHERE id = $1`, [taskId]);
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.createdBy, role: null },
    action: 'task.created',
    entityKind: 'admin_task',
    entityId: taskId,
    outcome: 'success',
    metadata: { task_kind: input.taskKind, origin_kind: origin.kind },
  });

  return taskId;
}

export async function assignTask(
  q: Querier,
  input: {
    taskId: string;
    assigneeId: string;
    actorId: string;
    expectedAssigneeId?: string | null;
    dueOn?: string | null;
  },
): Promise<void> {
  const actor = await requireTaskActor(q, input.actorId, 'task:assign');
  validateTaskDueDate(input.dueOn);
  const cur = await q.query<{
    org_id: string;
    status: TaskStatus;
    assigned_to: string | null;
    due_on: string | null;
  }>(
    'SELECT org_id, status, assigned_to, due_on::text AS due_on FROM admin_task WHERE id = $1 FOR UPDATE',
    [input.taskId],
  );
  const row = cur.rows[0];
  if (!row) throw new Error('task_not_found');
  if (row.org_id !== actor.org_id) throw new Error('forbidden');
  if (['done', 'cancelled'].includes(row.status)) throw new Error('task_closed');
  if (input.expectedAssigneeId !== undefined && row.assigned_to !== input.expectedAssigneeId)
    throw new Error('task_assignment_stale');
  const assignees = await listPermittedTaskAssignees(q);
  if (!assignees.some((m) => m.userId === input.assigneeId)) throw new Error('invalid_assignee');
  if (
    row.assigned_to === input.assigneeId &&
    (input.dueOn === undefined || input.dueOn === row.due_on)
  )
    return;
  const next: TaskStatus = row.status === 'open' ? 'assigned' : row.status;

  await q.query(
    `UPDATE admin_task SET assigned_to = $2, status = $3, due_on = CASE WHEN $4 THEN $5::date ELSE due_on END WHERE id = $1`,
    [input.taskId, input.assigneeId, next, input.dueOn !== undefined, input.dueOn ?? null],
  );
  await q.query(
    `INSERT INTO task_event (org_id, task_id, action, from_status, to_status, actor_user_id)
     VALUES ($1,$2,'assigned',$3,$4,$5)`,
    [row.org_id, input.taskId, row.status, next, input.actorId],
  );
  await appendAuditEvent(q, {
    orgId: row.org_id,
    actor: { userId: input.actorId, role: actor.role },
    action: 'task.assigned',
    entityKind: 'admin_task',
    entityId: input.taskId,
    outcome: 'success',
    metadata: {
      assignee_id: input.assigneeId,
      previous_assignee_id: row.assigned_to,
      due_on: input.dueOn ?? null,
    },
  });
}

export async function changeTaskStatus(
  q: Querier,
  input: {
    taskId: string;
    toStatus: TaskStatus;
    actorId: string;
    note?: string;
  },
): Promise<void> {
  const cur = await q.query<{
    org_id: string;
    status: TaskStatus;
    patient_id: string;
  }>('SELECT org_id, status, patient_id FROM admin_task WHERE id = $1', [input.taskId]);
  const row = cur.rows[0];
  if (!row) throw new Error('task_not_found');

  const t = transitionTask(row.status, input.toStatus);
  if (!t.ok) throw new Error(`invalid_task_transition:${row.status}->${input.toStatus}:${t.code}`);

  const closed = input.toStatus === 'done' || input.toStatus === 'cancelled';
  await q.query(
    `UPDATE admin_task SET status = $2, closed_at = CASE WHEN $3 THEN now() ELSE closed_at END,
       closure_note = COALESCE($4, closure_note) WHERE id = $1`,
    [input.taskId, input.toStatus, closed, input.note ?? null],
  );
  await q.query(
    `INSERT INTO task_event (org_id, task_id, action, from_status, to_status, actor_user_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      row.org_id,
      input.taskId,
      closed ? 'closed' : 'status_changed',
      row.status,
      input.toStatus,
      input.actorId,
      input.note ?? null,
    ],
  );
  await appendAuditEvent(q, {
    orgId: row.org_id,
    actor: { userId: input.actorId, role: null },
    action: 'task.status_changed',
    entityKind: 'admin_task',
    entityId: input.taskId,
    outcome: 'success',
    metadata: { from: row.status, to: input.toStatus },
  });
}

export async function commentTask(
  q: Querier,
  input: { taskId: string; actorId: string; note: string },
): Promise<void> {
  const cur = await q.query<{ org_id: string }>('SELECT org_id FROM admin_task WHERE id = $1', [
    input.taskId,
  ]);
  const orgId = cur.rows[0]?.org_id;
  if (!orgId) throw new Error('task_not_found');
  await q.query(
    `INSERT INTO task_event (org_id, task_id, action, actor_user_id, note) VALUES ($1,$2,'commented',$3,$4)`,
    [orgId, input.taskId, input.actorId, input.note],
  );
}

/** Enforce the authenticated, current membership rather than trusting posted actors. */
export async function requireTaskActor(q: Querier, userId: string, permission: Permission) {
  const result = await q.query<{ org_id: string; role: Role }>(
    `SELECT m.org_id, m.role FROM membership m JOIN app_user u ON u.id=m.user_id
      WHERE m.user_id=$1 AND m.user_id=nullif(current_setting('app.user_id',true),'')::uuid
        AND m.org_id=nullif(current_setting('app.org_id',true),'')::uuid
        AND m.role=current_setting('app.role',true) AND u.is_active`,
    [userId],
  );
  const row = result.rows[0];
  if (!row || !can(row.role, permission)) throw new Error('forbidden');
  return row;
}

export function validateTaskDueDate(value?: string | null) {
  if (value === null || value === undefined) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('invalid_due_date');
}

export async function listPermittedTaskAssignees(q: Querier) {
  const res = await q.query<{
    user_id: string;
    display_name: string;
    role: Role;
  }>(
    `SELECT m.user_id,u.display_name,m.role FROM membership m JOIN app_user u ON u.id=m.user_id
      WHERE u.is_active AND m.role IN ('clinician','coordinator','records_officer') ORDER BY u.display_name,m.user_id`,
  );
  return res.rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
  }));
}

export async function listTaskOwnership(q: Querier, patientId: string) {
  const result = await q.query<{
    id: string;
    assigned_to: string | null;
    role: Role | null;
    updated_at: Date;
    quote: string | null;
    document_id: string | null;
  }>(
    `SELECT t.id,t.assigned_to,m.role,coalesce(e.updated_at,t.created_at) AS updated_at,
       CASE WHEN d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired' THEN ef.verbatim_quote END AS quote,
       CASE WHEN d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired' THEN ef.document_id END AS document_id
     FROM admin_task t LEFT JOIN membership m ON m.user_id=t.assigned_to AND m.org_id=t.org_id
     LEFT JOIN evidence_fact ef ON ef.id=t.origin_evidence_fact_id LEFT JOIN document d ON d.id=ef.document_id
     LEFT JOIN LATERAL (SELECT max(occurred_at) AS updated_at FROM task_event WHERE task_id=t.id) e ON true
     WHERE t.patient_id=$1`,
    [patientId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    assignedTo: r.assigned_to,
    role: r.role,
    updatedAt: r.updated_at.toISOString(),
    quote: r.quote,
    documentId: r.document_id,
  }));
}

/** Human promotion of an exact, verified instruction; never generates an investigation order. */
export async function createInstructionTask(
  q: Querier,
  input: {
    patientId: string;
    evidenceFactId: string;
    actorId: string;
    confirmedAdministrative: boolean;
    taskKind: TaskKind;
    dueOn?: string | null;
  },
): Promise<string> {
  const actor = await requireTaskActor(q, input.actorId, 'task:create');
  if (!input.confirmedAdministrative) throw new Error('administrative_confirmation_required');
  validateTaskDueDate(input.dueOn);
  // Patient lock serializes repeated promotions and coordinates readiness-dependent operations.
  await q.query('SELECT id FROM patient WHERE id=$1 FOR UPDATE', [input.patientId]);
  const fact = await q.query<{ verbatim_quote: string }>(
    `SELECT ef.verbatim_quote FROM evidence_fact ef JOIN evidence_state es ON es.evidence_fact_id=ef.id
      JOIN document d ON d.id=ef.document_id WHERE ef.id=$1 AND ef.patient_id=$2
      AND ef.fact_type='instruction.recorded' AND es.state IN ('verified','corrected')
      AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'`,
    [input.evidenceFactId, input.patientId],
  );
  if (!fact.rows[0]) throw new Error('verified_instruction_not_accessible');
  const existing = await q.query<{ id: string }>(
    `SELECT id FROM admin_task WHERE patient_id=$1 AND origin_evidence_fact_id=$2 ORDER BY created_at,id LIMIT 1`,
    [input.patientId, input.evidenceFactId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  return createTask(q, {
    orgId: actor.org_id,
    patientId: input.patientId,
    title: 'Coordinate documented administrative instruction',
    detail: null,
    taskKind: input.taskKind,
    dueOn: input.dueOn ?? null,
    origin: { kind: 'evidence', evidenceFactId: input.evidenceFactId },
    createdBy: input.actorId,
  });
}

export async function listVerifiedInstructions(q: Querier, patientId: string) {
  const result = await q.query<{
    id: string;
    verbatim_quote: string;
    document_id: string;
  }>(
    `SELECT ef.id,ef.verbatim_quote,ef.document_id FROM evidence_fact ef
      JOIN evidence_state es ON es.evidence_fact_id=ef.id JOIN document d ON d.id=ef.document_id
      WHERE ef.patient_id=$1 AND ef.fact_type='instruction.recorded' AND es.state IN ('verified','corrected')
      AND d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'
      AND NOT EXISTS(SELECT 1 FROM admin_task t WHERE t.origin_evidence_fact_id=ef.id)
      ORDER BY ef.created_at,ef.id`,
    [patientId],
  );
  return result.rows;
}
