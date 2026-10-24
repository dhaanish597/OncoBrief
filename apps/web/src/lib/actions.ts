'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  can,
  isDocumentType,
  isTaskKind,
  isTaskOriginKind,
  isTaskStatus,
  type Permission,
  type Role,
  type TaskStatus,
} from '@oncobrief/domain';
import {
  approveMessage,
  approvePacket,
  assignTask,
  changeTaskStatus,
  commentTask,
  composeMessage,
  confirmDocumentType,
  createPacket,
  createTask,
  computeAndPersistReadiness,
  deliverMessage,
  correctEvidence,
  getDelivery,
  getStorage,
  rejectEvidence,
  reinstateEvidence,
  resolveConflict,
  submitPacket,
  supersedeEvidence,
  verifyEvidence,
  waiveGap,
  withdrawPacket,
  type ValidatedSession,
  type VariableInput,
} from '@oncobrief/db';
import { withSession } from './session';

/**
 * Server actions. Every mutation goes through a domain service under the
 * caller's tenant context, and every action checks the caller's permission
 * before calling it. Layer 2 of the three enforcement layers (architecture
 * §13.2); RLS is Layer 3 and is the backstop.
 */

function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`forbidden:${permission}`);
  }
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function optionalStr(fd: FormData, key: string): string | null {
  const v = str(fd, key).trim();
  return v.length > 0 ? v : null;
}

function patientPath(fd: FormData, sub: string): string {
  return `/patients/${str(fd, 'patientId')}/${sub}`;
}

// --- evidence --------------------------------------------------------------

export async function verifyEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:verify');
    await verifyEvidence(q, { factId, actor: { kind: 'human', userId: s.userId, role: s.role } });
  });
  revalidatePath(patientPath(fd, 'evidence'));
}

export async function correctEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId');
  const patientId = str(fd, 'patientId');
  const reason = str(fd, 'reason');
  const valueText = str(fd, 'valueText');
  const verbatimQuote = str(fd, 'verbatimQuote');

  if (!reason || reason.trim().length < 3) {
    throw new Error('reason_required');
  }
  if (!valueText || valueText.trim().length === 0) {
    throw new Error('value_required');
  }

  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:correct');
    const existing = await q.query<{ fact_type: string; value_json: unknown; org_id: string; patient_id: string }>(
      'SELECT fact_type, value_json, org_id, patient_id FROM evidence_fact WHERE id = $1',
      [factId],
    );
    const row = existing.rows[0];
    if (!row || row.org_id !== s.orgId || row.patient_id !== patientId) {
      throw new Error('fact_not_found');
    }
    const prior = row.value_json as { kind: string };
    const kind = prior?.kind as 'text' | 'date' | 'facility' | 'cycle' | 'identifier';
    let value: unknown;
    if (kind === 'date') value = { kind, date: valueText.trim() };
    else if (kind === 'facility') value = { kind, name: valueText.trim() };
    else if (kind === 'cycle') value = { kind, label: valueText.trim() };
    else if (kind === 'identifier') {
      value = { ...(prior as object), value: valueText.trim() };
    } else value = { kind: 'text', text: valueText.trim() };

    await correctEvidence(q, {
      factId,
      actor: { kind: 'human', userId: s.userId, role: s.role },
      value: value as never,
      verbatimQuote,
      reason: reason.trim(),
    });
    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });
  revalidatePath(patientPath(fd, 'evidence'));
  revalidatePath(patientPath(fd, 'conflicts'));
  revalidatePath(patientPath(fd, 'record-map'));
}

export async function supersedeEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId');
  const patientId = str(fd, 'patientId');
  const reason = str(fd, 'reason');
  const supersedingFactId = optionalStr(fd, 'supersedingFactId');

  if (!reason || reason.trim().length < 3) {
    throw new Error('reason_required');
  }

  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:correct');
    const existing = await q.query<{ org_id: string; patient_id: string }>(
      'SELECT org_id, patient_id FROM evidence_fact WHERE id = $1',
      [factId],
    );
    const row = existing.rows[0];
    if (!row || row.org_id !== s.orgId || row.patient_id !== patientId) {
      throw new Error('fact_not_found');
    }

    await supersedeEvidence(q, {
      factId,
      reason: reason.trim(),
      actor: { kind: 'human', userId: s.userId, role: s.role },
      ...(supersedingFactId ? { supersedingFactId } : {}),
    });
    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });
  revalidatePath(patientPath(fd, 'evidence'));
  revalidatePath(patientPath(fd, 'conflicts'));
  revalidatePath(patientPath(fd, 'record-map'));
}

export async function rejectEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId');
  const reason = str(fd, 'reason');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:reject');
    await rejectEvidence(q, { factId, reason, actor: { kind: 'human', userId: s.userId, role: s.role } });
  });
  revalidatePath(patientPath(fd, 'evidence'));
}

export async function reinstateEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId');
  const reason = str(fd, 'reason');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:reject');
    await reinstateEvidence(q, { factId, reason, actor: { kind: 'human', userId: s.userId, role: s.role } });
  });
  revalidatePath(patientPath(fd, 'evidence'));
}

// --- conflicts -------------------------------------------------------------

export async function resolveConflictAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const conflictId = str(fd, 'conflictId');
  const resolutionKind = str(fd, 'resolutionKind') as 'retain_both' | 'mark_superseded' | 'corrected';
  const reason = str(fd, 'reason');
  const winnerFactId = optionalStr(fd, 'winnerFactId');
  if (!['retain_both', 'mark_superseded', 'corrected'].includes(resolutionKind)) {
    throw new Error('unknown_resolution_kind');
  }
  if (!reason || reason.trim().length < 3) {
    throw new Error('reason_required');
  }
  if (resolutionKind === 'mark_superseded' && !winnerFactId) {
    throw new Error('winner_required');
  }

  await withSession(async (q, s) => {
    requirePermission(s.role, 'conflict:resolve');

    let replacement: { value: never; verbatimQuote: string } | undefined;
    if (resolutionKind === 'corrected') {
      const valueText = optionalStr(fd, 'valueText');
      if (!valueText || valueText.trim().length === 0) {
        throw new Error('value_required');
      }
      const baseId = winnerFactId;
      const baseRow = baseId
        ? await q.query<{ fact_type: string; value_json: unknown; verbatim_quote: string; org_id: string; patient_id: string }>(
            'SELECT fact_type, value_json, verbatim_quote, org_id, patient_id FROM evidence_fact WHERE id = $1',
            [baseId],
          )
        : await q.query<{ fact_type: string; value_json: unknown; verbatim_quote: string; org_id: string; patient_id: string }>(
            `SELECT ef.fact_type, ef.value_json, ef.verbatim_quote, ef.org_id, ef.patient_id
               FROM conflict_member cm
               JOIN evidence_fact ef ON ef.id = cm.evidence_fact_id
              WHERE cm.conflict_set_id = $1
              ORDER BY ef.created_at LIMIT 1`,
            [conflictId],
          );
      const row = baseRow.rows[0];
      if (!row || row.org_id !== s.orgId || row.patient_id !== patientId) {
        throw new Error('base_fact_not_found');
      }
      const prior = row.value_json as { kind: string };
      const kind = prior?.kind as 'text' | 'date' | 'facility' | 'cycle' | 'identifier';
      let value: unknown;
      if (kind === 'date') value = { kind, date: valueText.trim() };
      else if (kind === 'facility') value = { kind, name: valueText.trim() };
      else if (kind === 'cycle') value = { kind, label: valueText.trim() };
      else if (kind === 'identifier') value = { ...(prior as object), value: valueText.trim() };
      else value = { kind: 'text', text: valueText.trim() };

      replacement = {
        value: value as never,
        verbatimQuote: row.verbatim_quote,
      };
    }

    await resolveConflict(q, {
      conflictSetId: conflictId,
      resolutionKind,
      reason: reason.trim(),
      actor: { kind: 'human', userId: s.userId, role: s.role },
      ...(winnerFactId ? { winnerFactId } : {}),
      ...(replacement ? { replacement } : {}),
    });

    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });

  revalidatePath(`/patients/${patientId}/conflicts`);
  revalidatePath(`/patients/${patientId}/conflicts/${conflictId}`);
  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/record-map`);
  redirect(`/patients/${patientId}/conflicts`);
}

// --- tasks -----------------------------------------------------------------

export async function createTaskAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const originKind = str(fd, 'originKind');
  if (!isTaskOriginKind(originKind)) throw new Error('unknown_origin_kind');
  const taskKind = str(fd, 'taskKind');
  if (!isTaskKind(taskKind)) throw new Error('unknown_task_kind');
  const originId = str(fd, 'originId');
  const origin =
    originKind === 'evidence'
      ? ({ kind: 'evidence', evidenceFactId: originId } as const)
      : originKind === 'record_gap'
        ? ({ kind: 'record_gap', recordGapId: originId } as const)
        : originKind === 'conflict'
          ? ({ kind: 'conflict', conflictSetId: originId } as const)
          : ({ kind: 'document', documentId: originId } as const);

  await withSession(async (q, s) => {
    requirePermission(s.role, 'task:create');
    await createTask(q, {
      orgId: s.orgId,
      patientId,
      title: str(fd, 'title'),
      detail: optionalStr(fd, 'detail'),
      taskKind,
      dueOn: optionalStr(fd, 'dueOn'),
      origin,
      createdBy: s.userId,
    });
  });
  revalidatePath(`/patients/${patientId}/tasks`);
  revalidatePath(`/patients/${patientId}/record-map`);
}

export async function assignTaskAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'task:assign');
    await assignTask(q, {
      taskId: str(fd, 'taskId'),
      assigneeId: str(fd, 'assigneeId'),
      actorId: s.userId,
    });
  });
  revalidatePath(`/patients/${patientId}/tasks`);
}

export async function taskStatusAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const taskId = str(fd, 'taskId');
  const toStatusRaw = str(fd, 'toStatus');
  if (!isTaskStatus(toStatusRaw)) {
    throw new Error('invalid_task_status');
  }
  const toStatus: TaskStatus = toStatusRaw;
  const note = optionalStr(fd, 'note');

  await withSession(async (q, s) => {
    requirePermission(s.role, 'task:create');
    await changeTaskStatus(q, {
      taskId,
      toStatus,
      actorId: s.userId,
      ...(note ? { note } : {}),
    });
  });
  revalidatePath(`/patients/${patientId}/tasks`);
}

export async function commentTaskAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const taskId = str(fd, 'taskId');
  const note = str(fd, 'note').trim();
  if (!note) {
    throw new Error('empty_note');
  }

  await withSession(async (q, s) => {
    requirePermission(s.role, 'task:create');
    await commentTask(q, { taskId, actorId: s.userId, note });
  });
  revalidatePath(`/patients/${patientId}/tasks`);
}

// --- twin ------------------------------------------------------------------

export async function waiveGapAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'checklist:author');
    await waiveGap(q, { gapId: str(fd, 'gapId'), userId: s.userId, reason: str(fd, 'reason') });
  });
  revalidatePath(`/patients/${patientId}/record-map`);
}

export async function refreshReadinessAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'checklist:author');
    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/record-map`);
}

// --- documents -------------------------------------------------------------

export async function confirmDocumentTypeAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const documentType = str(fd, 'documentType');
  if (!isDocumentType(documentType)) throw new Error('unknown_document_type');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    await confirmDocumentType(q, { documentId: str(fd, 'documentId'), documentType, userId: s.userId });
    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/sources`);
  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/clinical-context`);
  revalidatePath(`/patients/${patientId}/conflicts`);
}

export async function uploadDocumentAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const file = fd.get('file');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 MB
    if (!(file instanceof File) || file.size === 0) throw new Error('no_file');
    if (file.size > MAX_UPLOAD_SIZE) throw new Error('file_too_large');
    const bytes = Buffer.from(await file.arrayBuffer());
    const { createDocument, ingestDocument } = await import('@oncobrief/db');
    const { documentId } = await createDocument(q, getStorage(), {
      orgId: s.orgId,
      patientId,
      uploadedBy: s.userId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      content: bytes,
      sourceKind: 'upload',
    });
    // No OCR adapter for arbitrary scans is available offline, so an upload
    // with no text layer lands in `quarantined` with manual_transcription_required
    // rather than being guessed at (architecture §16.2).
    await ingestDocument(q, { storage: getStorage(), ocr: await ocrPort(), extractor: await extractorPort() }, documentId);
  });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/sources`);
  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/clinical-context`);
  revalidatePath(`/patients/${patientId}/conflicts`);
}

async function ocrPort() {
  const { FixtureOcrAdapter } = await import('@oncobrief/adapters');
  return new FixtureOcrAdapter();
}
async function extractorPort() {
  const { RuleBasedExtractor } = await import('@oncobrief/adapters');
  return new RuleBasedExtractor();
}

// --- packets ---------------------------------------------------------------

export async function createPacketAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  let packetId = '';
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:draft');
    const res = await createPacket(q, {
      orgId: s.orgId,
      patientId,
      encounterLabel: str(fd, 'encounterLabel') || 'Consultation',
      userId: s.userId,
    });
    packetId = res.packetId;
  });
  revalidatePath(`/patients/${patientId}/packet`);
  if (packetId) redirect(`/patients/${patientId}/packet`);
}

export async function submitPacketAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:draft');
    await submitPacket(q, { packetId: str(fd, 'packetId'), userId: s.userId });
  });
  revalidatePath(`/patients/${patientId}/packet`);
}

export async function approvePacketAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:approve');
    await approvePacket(q, {
      packetId: str(fd, 'packetId'),
      userId: s.userId,
      approvalNote: optionalStr(fd, 'approvalNote'),
    });
  });
  revalidatePath(`/patients/${patientId}/packet`);
}

export async function withdrawPacketAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:draft');
    await withdrawPacket(q, {
      packetId: str(fd, 'packetId'),
      userId: s.userId,
      reason: str(fd, 'reason'),
    });
  });
  revalidatePath(`/patients/${patientId}/packet`);
}

// --- messages --------------------------------------------------------------

export async function composeMessageAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const templateId = str(fd, 'templateId');
  const value = str(fd, 'appointmentDate');
  const evidenceFactId = str(fd, 'appointmentFactId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:compose');
    const variables: VariableInput[] = [
      { name: 'appointment_date', value, source: { kind: 'evidence', evidenceFactId } },
      {
        name: 'appointment_location',
        value: str(fd, 'appointmentLocation') || 'Surgical Oncology OPD',
        source: { kind: 'literal' },
      },
      {
        name: 'records_office_phone',
        value: str(fd, 'recordsOfficePhone') || '+91 00000 00000',
        source: { kind: 'literal' },
      },
    ];
    await composeMessage(q, {
      orgId: s.orgId,
      patientId,
      packetId: optionalStr(fd, 'packetId'),
      templateId,
      variables,
      composedBy: s.userId,
    });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

export async function approveMessageAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:approve');
    await approveMessage(q, { messageId: str(fd, 'messageId'), userId: s.userId });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

export async function deliverMessageAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:approve');
    await deliverMessage(q, getDelivery(), { messageId: str(fd, 'messageId'), userId: s.userId });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

export type { ValidatedSession };
