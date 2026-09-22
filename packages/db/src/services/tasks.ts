import { isTaskKind, transitionTask, type TaskKind, type TaskStatus } from '@oncobrief/domain';
import type { Querier } from '../client.js';
import { appendAuditEvent } from './audit.js';

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
  if (!isTaskKind(input.taskKind)) throw new Error(`unknown_task_kind:${input.taskKind}`);

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
  input: { taskId: string; assigneeId: string; actorId: string },
): Promise<void> {
  const cur = await q.query<{ org_id: string; status: TaskStatus }>(
    'SELECT org_id, status FROM admin_task WHERE id = $1',
    [input.taskId],
  );
  const row = cur.rows[0];
  if (!row) throw new Error('task_not_found');
  const next: TaskStatus = row.status === 'open' ? 'assigned' : row.status;

  await q.query(`UPDATE admin_task SET assigned_to = $2, status = $3 WHERE id = $1`, [
    input.taskId,
    input.assigneeId,
    next,
  ]);
  await q.query(
    `INSERT INTO task_event (org_id, task_id, action, from_status, to_status, actor_user_id)
     VALUES ($1,$2,'assigned',$3,$4,$5)`,
    [row.org_id, input.taskId, row.status, next, input.actorId],
  );
  await appendAuditEvent(q, {
    orgId: row.org_id,
    actor: { userId: input.actorId, role: null },
    action: 'task.assigned',
    entityKind: 'admin_task',
    entityId: input.taskId,
    outcome: 'success',
    metadata: { assignee_id: input.assigneeId },
  });
}

export async function changeTaskStatus(
  q: Querier,
  input: { taskId: string; toStatus: TaskStatus; actorId: string; note?: string },
): Promise<void> {
  const cur = await q.query<{ org_id: string; status: TaskStatus; patient_id: string }>(
    'SELECT org_id, status, patient_id FROM admin_task WHERE id = $1',
    [input.taskId],
  );
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
