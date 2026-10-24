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
  generateStudioDraft,
  validateDeidentification,
  type StudioArtifactKind,
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
  getAbdmGateway,
  flushAbdmSimulation,
  rejectEvidence,
  reinstateEvidence,
  resolveConflict,
  submitPacket,
  supersedeEvidence,
  verifyEvidence,
  verifyEvidenceBatch,
  waiveGap,
  withdrawPacket,
  upsertAbdmPatientLink,
  linkApprovedPacketCareContext,
  initiateHiuConsent,
  requestHealthInfoPull,
  purgeConsentData,
  createStudioArtifact,
  updateStudioArtifact,
  approveStudioArtifact,
  getStudioArtifact,
  registerCaregiver,
  updateCaregiverPreferences,
  revokeCaregiverConsent,
  recordMessageAttendance,
  type AttendanceResponseStatus,
  type ValidatedSession,
  type VariableInput,
} from '@oncobrief/db';
import { withSession } from './session';
import { loadStudioDraftInput, validateBoundStudioBody } from './studio-validation';

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
  const factId = str(fd, 'factId') || str(fd, 'evidenceFactId');
  if (!factId || factId.trim().length === 0) {
    throw new Error('fact_id_required');
  }
  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:verify');
    await verifyEvidence(q, { factId: factId.trim(), actor: { kind: 'human', userId: s.userId, role: s.role } });
  });
  revalidatePath(patientPath(fd, 'evidence'));
}

export async function verifyEvidenceBatchAction(
  fd: FormData,
): Promise<{ ok: boolean; count: number; verifiedFactIds: string[] }> {
  const patientId = str(fd, 'patientId');
  if (!patientId || patientId.trim().length === 0) {
    throw new Error('patient_id_required');
  }

  const factIdsFromAll = fd
    .getAll('factId')
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const factIdsJson = str(fd, 'factIdsJson');
  const factIdsCsv = str(fd, 'factIds');

  let factIds: string[] = [];
  if (factIdsFromAll.length > 0) {
    factIds = factIdsFromAll;
  } else if (factIdsJson) {
    try {
      const parsed = JSON.parse(factIdsJson);
      if (Array.isArray(parsed)) factIds = parsed.map(String).filter((s) => s.trim().length > 0);
    } catch {
      throw new Error('invalid_fact_ids_json');
    }
  } else if (factIdsCsv) {
    factIds = factIdsCsv.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  if (factIds.length === 0) {
    throw new Error('no_facts_selected');
  }

  const reason = optionalStr(fd, 'reason') ?? 'Clinician confirmed batch in review modal';

  let result = { verifiedFactIds: [] as string[], count: 0 };

  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:verify');
    result = await verifyEvidenceBatch(q, {
      orgId: s.orgId,
      patientId: patientId.trim(),
      factIds,
      actor: { kind: 'human', userId: s.userId, role: s.role },
      reason,
    });
  });

  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/record-map`);
  revalidatePath(`/patients/${patientId}/packet`);

  return { ok: true, count: result.count, verifiedFactIds: result.verifiedFactIds };
}

export async function correctEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId') || str(fd, 'evidenceFactId');
  const patientId = str(fd, 'patientId');
  const reason = str(fd, 'reason');
  const valueText = str(fd, 'valueText');
  const verbatimQuote = str(fd, 'verbatimQuote');

  if (!factId || factId.trim().length === 0) {
    throw new Error('fact_id_required');
  }
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
  const factId = str(fd, 'factId') || str(fd, 'evidenceFactId');
  const patientId = str(fd, 'patientId');
  const reason = str(fd, 'reason');
  const supersedingFactId = optionalStr(fd, 'supersedingFactId');

  if (!factId || factId.trim().length === 0) {
    throw new Error('fact_id_required');
  }
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
  const factId = str(fd, 'factId') || str(fd, 'evidenceFactId');
  const reason = str(fd, 'reason');
  if (!factId || factId.trim().length === 0) {
    throw new Error('fact_id_required');
  }
  await withSession(async (q, s) => {
    requirePermission(s.role, 'evidence:reject');
    await rejectEvidence(q, { factId, reason, actor: { kind: 'human', userId: s.userId, role: s.role } });
  });
  revalidatePath(patientPath(fd, 'evidence'));
}

export async function reinstateEvidenceAction(fd: FormData): Promise<void> {
  const factId = str(fd, 'factId') || str(fd, 'evidenceFactId');
  const reason = str(fd, 'reason');
  if (!factId || factId.trim().length === 0) {
    throw new Error('fact_id_required');
  }
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

export async function readBoundedUploadFile(
  file: File,
  maxBytes = 25 * 1024 * 1024,
): Promise<Buffer> {
  if (file.size > maxBytes) {
    throw new Error('UPLOAD_TOO_LARGE');
  }

  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error('UPLOAD_TOO_LARGE');
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

export async function uploadDocumentAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const file = fd.get('file');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB
    if (!(file instanceof File) || file.size === 0) throw new Error('no_file');
    const bytes = await readBoundedUploadFile(file, MAX_UPLOAD_SIZE);
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
    // Use the configured OCR provider. Offline scans require human transcription.
    await ingestDocument(q, { storage: getStorage(), ocr: await ocrPort(), extractor: await extractorPort() }, documentId);
  });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/sources`);
  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/clinical-context`);
  revalidatePath(`/patients/${patientId}/conflicts`);
}

export async function importStandardBundleAction(
  fd: FormData,
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const patientId = str(fd, 'patientId');
  const bundleType = optionalStr(fd, 'bundleType');
  const file = fd.get('file');

  let bundleContent: Buffer;
  let filename: string;
  let issuingFacility: string;

  const {
    validateFhirBundle,
    createTataMemorialDiagnosticBundle,
    createAiimsMCodeBundle,
  } = await import('@oncobrief/domain');

  if (bundleType === 'tmc_diagnostic') {
    const bundleObj = createTataMemorialDiagnosticBundle(patientId);
    bundleContent = Buffer.from(JSON.stringify(bundleObj, null, 2), 'utf8');
    filename = 'Tata_Memorial_ACTREC_Diagnostic_Bundle.json';
    issuingFacility = 'Tata Memorial Hospital & ACTREC';
  } else if (bundleType === 'aiims_mcode') {
    const bundleObj = createAiimsMCodeBundle(patientId);
    bundleContent = Buffer.from(JSON.stringify(bundleObj, null, 2), 'utf8');
    filename = 'AIIMS_New_Delhi_mCODE_Bundle.json';
    issuingFacility = 'All India Institute of Medical Sciences Hospital';
  } else if (file instanceof File && file.size > 0) {
    const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;
    bundleContent = await readBoundedUploadFile(file, MAX_UPLOAD_SIZE);
    filename = file.name;
    try {
      const parsed = JSON.parse(bundleContent.toString('utf8'));
      const val = validateFhirBundle(parsed);
      if (!val.valid) {
        throw new Error(val.error ?? 'Invalid FHIR Bundle');
      }
      const orgEntry = Array.isArray(parsed.entry)
        ? parsed.entry.find((e: { resource?: { resourceType?: string } }) => e?.resource?.resourceType === 'Organization')
        : null;
      issuingFacility = (orgEntry?.resource as { name?: string })?.name || 'Outside Hospital Network';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON file';
      throw new Error(`Invalid FHIR Bundle: ${msg}`);
    }
  } else {
    throw new Error('no_bundle_selected');
  }

  let createdDocId = '';
  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    const { createDocument, ingestDocument, computeAndPersistReadiness } = await import('@oncobrief/db');
    const { documentId } = await createDocument(q, getStorage(), {
      orgId: s.orgId,
      patientId,
      uploadedBy: s.userId,
      filename,
      mimeType: 'application/fhir+json',
      content: bundleContent,
      sourceKind: 'fhir_document',
      issuingFacility,
      recordOrigin: 'external_hospital',
    });
    createdDocId = documentId;
    await ingestDocument(q, { storage: getStorage(), ocr: await ocrPort(), extractor: await extractorPort() }, documentId);
    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });

  revalidatePath(`/patients/${patientId}/sources`);
  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/record-map`);

  return { ok: true, documentId: createdDocId };
}

export async function linkExistingDocumentAction(fd: FormData): Promise<{ ok: boolean }> {
  const patientId = str(fd, 'patientId');
  const documentId = str(fd, 'documentId');
  const targetDocumentId = optionalStr(fd, 'targetDocumentId');
  const actionRaw = optionalStr(fd, 'action') ?? 'link_duplicate';
  const action = actionRaw === 'unlink' ? 'unlink' : 'link_duplicate';

  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    const { linkDocumentDuplicate, computeAndPersistReadiness } = await import('@oncobrief/db');
    await linkDocumentDuplicate(q, {
      orgId: s.orgId,
      patientId,
      documentId,
      targetDocumentId,
      action,
      userId: s.userId,
    });
    await computeAndPersistReadiness(q, { orgId: s.orgId, patientId, computedBy: s.userId });
  });

  revalidatePath(`/patients/${patientId}/sources`);
  revalidatePath(`/patients/${patientId}/evidence`);
  revalidatePath(`/patients/${patientId}/record-map`);
  return { ok: true };
}

export async function searchPatientDocumentsAction(
  patientId: string,
  query: string,
) {
  return withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    const { searchPatientDocuments } = await import('@oncobrief/db');
    return searchPatientDocuments(q, { orgId: s.orgId, patientId, query });
  });
}

async function ocrPort() {
  const { getOcr } = await import('@oncobrief/db');
  return getOcr();
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

export async function registerCaregiverAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const fullName = str(fd, 'fullName');
  const relationship = str(fd, 'relationship');
  const phoneNumber = str(fd, 'phoneNumber');
  const preferredLocale = optionalStr(fd, 'preferredLocale') ?? 'hi-IN';
  const prefersVoiceNote = fd.get('prefersVoiceNote') !== 'false' && fd.get('prefersVoiceNote') !== null;
  const syncReminders = fd.get('syncReminders') !== 'false' && fd.get('syncReminders') !== null;

  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:compose');
    await registerCaregiver(q, {
      orgId: s.orgId,
      patientId,
      fullName,
      relationship,
      phoneNumber,
      preferredLocale,
      prefersVoiceNote,
      syncReminders,
      consentRecordedBy: s.userId,
    });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

export async function updateCaregiverPreferencesAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const caregiverId = str(fd, 'caregiverId');
  const preferredLocale = optionalStr(fd, 'preferredLocale') ?? undefined;
  const prefersVoiceNote = fd.has('prefersVoiceNote') ? fd.get('prefersVoiceNote') === 'true' : undefined;
  const syncReminders = fd.get('syncReminders') === 'true';

  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:compose');
    await updateCaregiverPreferences(q, {
      orgId: s.orgId,
      caregiverId,
      preferredLocale,
      prefersVoiceNote,
      syncReminders,
      actorUserId: s.userId,
    });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

export async function revokeCaregiverConsentAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const caregiverId = str(fd, 'caregiverId');
  const reason = optionalStr(fd, 'reason') ?? 'Patient or caregiver requested notification withdrawal';

  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:compose');
    await revokeCaregiverConsent(q, {
      orgId: s.orgId,
      caregiverId,
      actorUserId: s.userId,
      reason,
    });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

export async function recordAttendanceAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const messageId = str(fd, 'messageId');
  const status = str(fd, 'status') as AttendanceResponseStatus;
  const channel = optionalStr(fd, 'channel') ?? 'sms';
  const responder = optionalStr(fd, 'responder') ?? 'patient';
  const note = optionalStr(fd, 'note');

  await withSession(async (q, s) => {
    requirePermission(s.role, 'message:compose');
    await recordMessageAttendance(q, {
      orgId: s.orgId,
      messageId,
      status,
      channel,
      responder,
      note,
      actorUserId: s.userId,
    });
  });
  revalidatePath(`/patients/${patientId}/continuity`);
}

// --- ABDM M2 HIP & M3 HIU Actions ------------------------------------------

export async function updatePatientAbhaAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const abhaAddress = str(fd, 'abhaAddress').trim();
  const abhaNumber = optionalStr(fd, 'abhaNumber');
  const aadhaarName = optionalStr(fd, 'aadhaarName');
  const gender = optionalStr(fd, 'gender') as 'M' | 'F' | 'O' | 'U' | null;
  const yobStr = optionalStr(fd, 'yearOfBirth');
  const yearOfBirth = yobStr ? parseInt(yobStr, 10) : null;
  const mobileLast10 = optionalStr(fd, 'mobileLast10');

  await withSession(async (q, s) => {
    requirePermission(s.role, 'patient:read');
    await upsertAbdmPatientLink(q, {
      orgId: s.orgId,
      patientId,
      abhaAddress,
      abhaNumber,
      aadhaarName,
      gender,
      yearOfBirth,
      mobileLast10,
    });
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/sources`);
}

export async function linkPacketCareContextAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const packetId = str(fd, 'packetId');

  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:export');
    await linkApprovedPacketCareContext(q, {
      orgId: s.orgId,
      patientId,
      packetId,
      gateway: getAbdmGateway(),
    });
  });

  revalidatePath(`/patients/${patientId}/packet`);
}

export async function initiateHiuConsentAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const abhaAddress = str(fd, 'abhaAddress').trim();
  const hiTypesStr = str(fd, 'hiTypes');
  const hiTypes = hiTypesStr
    ? hiTypesStr.split(',').map((t) => t.trim())
    : ['OPConsultation', 'DiagnosticReport'];
  const fromDate = str(fd, 'fromDate') || new Date(Date.now() - 365 * 86_400_000).toISOString();
  const toDate = str(fd, 'toDate') || new Date().toISOString();
  const dataEraseAt = str(fd, 'dataEraseAt') || new Date(Date.now() + 30 * 86_400_000).toISOString();
  const hipId = optionalStr(fd, 'hipId');

  const consent = await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    return initiateHiuConsent(q, {
      orgId: s.orgId,
      patientId,
      userId: s.userId,
      patientAbhaAddress: abhaAddress,
      hiTypes,
      dateRange: { from: fromDate, to: toDate },
      dataEraseAt,
      hipId,
      gateway: getAbdmGateway(),
    });
  });

  await flushAbdmSimulation(consent.abdmRequestId);
  revalidatePath(`/patients/${patientId}/sources`);
}

export async function pullAbdmRecordsAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const consentId = str(fd, 'consentId');
  const dataPushUrl =
    `${process.env.ABDM_CALLBACK_BASE_URL || 'http://localhost:3000'}/api/v3/hiu/health-information/push`;

  const transfer = await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    return requestHealthInfoPull(q, {
      orgId: s.orgId,
      userId: s.userId,
      patientId,
      consentId,
      dataPushUrl,
      gateway: getAbdmGateway(),
    });
  });

  try { await flushAbdmSimulation(transfer.abdmRequestId); }
  catch (error) {
    await withSession(async (q, s) => {
      await q.query(`UPDATE abdm_hi_transfer SET status='FAILED', error_message=$3, ephemeral_private_key_enc=NULL
        WHERE id=$1 AND org_id=$2 AND status <> 'TRANSFERRED'`,
        [transfer.transferId, s.orgId, error instanceof Error ? error.message : 'Simulated transfer failed']);
    });
    throw error;
  }
  revalidatePath(`/patients/${patientId}/sources`);
}

export async function revokeAbdmConsentAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const consentId = str(fd, 'consentId');

  await withSession(async (q, s) => {
    requirePermission(s.role, 'document:upload');
    await purgeConsentData(q, {
      orgId: s.orgId,
      userId: s.userId,
      actorRole: s.role,
      consentId,
      storage: getStorage(),
    });
  });

  revalidatePath(`/patients/${patientId}/sources`);
}

// --- Clinician Productivity Studio actions -----------------------------------

export async function createStudioArtifactAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  const kind = (str(fd, 'artifactKind') || 'referral_letter') as StudioArtifactKind;
  if (!['referral_letter', 'tumor_board_deck', 'academic_case_abstract', 'patient_info_sheet'].includes(kind)) throw new Error('invalid_artifact_kind');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:draft');
    const input = await loadStudioDraftInput(q, s, patientId, kind, fd.get('includeUnverified') === 'true');
    const draft = generateStudioDraft(input);
    await createStudioArtifact(q, { orgId: s.orgId, patientId, artifactKind: kind,
      title: draft.title, markdownBody: draft.markdownBody, citedFactIds: draft.citedFactIds,
      citedGuidelineIds: draft.citedGuidelineIds, isDeidentified: draft.isDeidentified, createdBy: s.userId });
  });
  revalidatePath(`/patients/${patientId}/packet`);
}

export async function updateStudioArtifactAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:draft');
    const artifact = await getStudioArtifact(q, s.orgId, str(fd, 'artifactId'));
    if (!artifact || artifact.patientId !== patientId) throw new Error('artifact_patient_mismatch');
    const input = await loadStudioDraftInput(q, s, artifact.patientId, artifact.artifactKind, false, artifact);
    validateBoundStudioBody(str(fd, 'markdownBody'), input, { ...artifact, title: str(fd, 'title') });
    await updateStudioArtifact(q, { orgId: s.orgId, artifactId: artifact.id,
      title: str(fd, 'title'), markdownBody: str(fd, 'markdownBody'),
      citedFactIds: artifact.citedFactIds, citedGuidelineIds: artifact.citedGuidelineIds, updatedBy: s.userId });
  });
  revalidatePath(`/patients/${patientId}/packet`);
}

export async function approveStudioArtifactAction(fd: FormData): Promise<void> {
  const patientId = str(fd, 'patientId');
  await withSession(async (q, s) => {
    requirePermission(s.role, 'packet:approve');
    const artifact = await getStudioArtifact(q, s.orgId, str(fd, 'artifactId'));
    if (!artifact || artifact.patientId !== patientId) throw new Error('artifact_patient_mismatch');
    const input = await loadStudioDraftInput(q, s, artifact.patientId, artifact.artifactKind, false, artifact);
    validateBoundStudioBody(artifact.markdownBody, input, artifact);
    if (artifact.isDeidentified) {
      const check = validateDeidentification(artifact.markdownBody, input.patient);
      if (!check.isValid) throw new Error('cannot_approve_privacy_leak');
    }
    await approveStudioArtifact(q, { orgId: s.orgId, artifactId: artifact.id,
      approvedBy: s.userId, role: s.role, approvalNote: optionalStr(fd, 'approvalNote') ?? undefined,
      expectedMarkdownBody: artifact.markdownBody, expectedCitedFactIds: artifact.citedFactIds,
      expectedCitedGuidelineIds: artifact.citedGuidelineIds });
  });
  revalidatePath(`/patients/${patientId}/packet`);
}

export type { ValidatedSession };
