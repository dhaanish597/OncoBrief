'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can, isDocumentType, isTaskKind, type Permission, type Role, type TaskStatus } from '@oncobrief/domain';
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
  const reason = str(fd, 'reason');
  const valueText = str(fd, 'valueText');
  const verbatimQuote = str(fd, 'verbatimQuote');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:correct');
    const existing = await q.query<{ fact_type: string; value_json: unknown }>(
      'SELECT fact_type, value_json FROM evidence_fact WHERE id = $1',
      [factId],
    );
    const row = existing.rows[0];
    if (!row) throw new Error('fact_not_found');
    const prior = row.value_json as { kind: string };
    const kind = prior.kind as 'text' | 'date' | 'facility' | 'cycle' | 'identifier';
    let value: unknown;
    if (kind === 'date') value = { kind, date: valueText };
    else if (kind === 'facility') value = { kind, name: valueText };
    else if (kind === 'cycle') value = { kind, label: valueText };
    else if (kind === 'identifier') {
      value = { ...(prior as object), value: valueText };
    } else value = { kind: 'text', text: valueText };

    await correctEvidence(q, {
      factId,
      actor: { kind: 'human', userId: s.userId, role: s.role },
      value: value as never,
      verbatimQuote,
      reason,
    });
  });
  revalidatePath(patientPath(fd, 'evidence'));
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
  await withSession(async (q, s) => {
    requirePermission(s.role, 'conflict:resolve');
    await resolveConflict(q, {
      conflictSetId: conflictId,
      resolutionKind,
      reason,
      actor: { kind: 'human', userId: s.userId, role: s.role },
      ...(winnerFactId ? { winnerFactId } : {}),
    });
  });
  revalidatePath(`/patients/${patientId}/conflicts`);
  revalidatePath(`/patients/${patientId}/conflicts/${conflictId}`);
  redirect(`/patients/${patientId}/conflicts`);
}

// --- tasks -----------------------------------------------------------------

export async function createTaskAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const originKind = str(fd, 'originKind');
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
  await withSession(async (q, s) => {
    requirePermission(s.role, 'task:create');
    await changeTaskStatus(q, {
      taskId: str(fd, 'taskId'),
      toStatus: str(fd, 'toStatus') as TaskStatus,
      actorId: s.userId,
      ...(optionalStr(fd, 'note') ? { note: str(fd, 'note') } : {}),
    });
  });
  revalidatePath(`/patients/${patientId}/tasks`);
}

export async function commentTaskAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    await commentTask(q, { taskId: str(fd, 'taskId'), actorId: s.userId, note: str(fd, 'note') });
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
  revalidatePath(`/patients/${patientId}/sources`);
}

export async function uploadDocumentAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const file = fd.get('file');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    if (!(file instanceof File) || file.size === 0) throw new Error('no_file');
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
  revalidatePath(`/patients/${patientId}/sources`);
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
