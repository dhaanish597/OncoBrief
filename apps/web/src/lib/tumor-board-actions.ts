'use server';

import { revalidatePath } from 'next/cache';
import { can } from '@oncobrief/domain';
import {
  createTumorBoardMeeting,
  updateTumorBoardMeeting,
  registerTumorBoardCase,
  updateTumorBoardCase,
  type TumorBoardStatus,
  type CaseStatus,
} from '@oncobrief/db';
import { assertPatientBelongsToOrg, requireSession, withSession } from '@/lib/session';

function parseCitedFactIds(formData: FormData): string[] {
  const multi = formData
    .getAll('citedFactIds')
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
  if (multi.length > 0) return [...new Set(multi)];
  const raw = String(formData.get('citedFactIdsCsv') || formData.get('citedFactIds') || '').trim();
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

export async function createTumorBoardMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor_board:manage permission');
  }

  const title = String(formData.get('title') || '').trim();
  const meetingDate = String(formData.get('meetingDate') || '').trim();
  const startTime = String(formData.get('startTime') || '16:00').trim();
  const endTime = String(formData.get('endTime') || '17:30').trim();
  const location = String(formData.get('location') || 'Conference Room A').trim();
  const moderatorUserId = String(formData.get('moderatorUserId') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;

  if (!title) throw new Error('Meeting title is required');
  if (!meetingDate) throw new Error('Meeting date is required');

  await withSession(async (q, s) => {
    return createTumorBoardMeeting(q, {
      orgId: s.orgId,
      title,
      meetingDate,
      startTime,
      endTime,
      location,
      moderatorUserId,
      notes,
      actorId: s.userId,
    });
  });

  revalidatePath('/tumor-board');
}

export async function updateTumorBoardMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor_board:manage permission');
  }

  const meetingId = String(formData.get('meetingId') || '').trim();
  const status = (String(formData.get('status') || '') as TumorBoardStatus) || undefined;
  const notes = formData.has('notes') ? String(formData.get('notes') || '').trim() : undefined;

  if (!meetingId) throw new Error('Meeting ID is required');

  await withSession(async (q, s) => {
    return updateTumorBoardMeeting(q, {
      orgId: s.orgId,
      meetingId,
      status,
      notes,
      actorId: s.userId,
    });
  });

  revalidatePath('/tumor-board');
}

export async function registerTumorBoardCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor_board:manage permission');
  }

  const meetingId = String(formData.get('meetingId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const packetId = String(formData.get('packetId') || '').trim() || null;
  const stagingFactId = String(formData.get('stagingFactId') || '').trim() || null;
  const citedFactIds = parseCitedFactIds(formData);
  const presenterUserId = String(formData.get('presenterUserId') || '').trim() || null;
  const clinicalStaging = String(formData.get('clinicalStaging') || '').trim() || null;

  if (!meetingId) throw new Error('Meeting ID is required');
  if (!patientId) throw new Error('Patient is required');

  await withSession(async (q, s) => {
    await assertPatientBelongsToOrg(q, s.orgId, patientId);
    return registerTumorBoardCase(q, {
      orgId: s.orgId,
      meetingId,
      patientId,
      packetId,
      stagingFactId,
      citedFactIds,
      presenterUserId: presenterUserId || s.userId,
      clinicalStaging,
      actorId: s.userId,
    });
  });

  revalidatePath('/tumor-board');
  revalidatePath(`/patients/${patientId}/overview`);
}

export async function updateTumorBoardCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor_board:manage permission');
  }

  const meetingId = String(formData.get('meetingId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const status = (String(formData.get('status') || '') as CaseStatus) || undefined;
  const discussionSummary = formData.has('discussionSummary')
    ? String(formData.get('discussionSummary') || '').trim() || null
    : undefined;
  const recommendationNotes = formData.has('recommendationNotes')
    ? String(formData.get('recommendationNotes') || '').trim() || null
    : undefined;
  const clinicalStaging = formData.has('clinicalStaging')
    ? String(formData.get('clinicalStaging') || '').trim() || null
    : undefined;
  const stagingFactId = formData.has('stagingFactId')
    ? String(formData.get('stagingFactId') || '').trim() || null
    : undefined;
  const citedFactIds =
    formData.has('citedFactIds') || formData.has('citedFactIdsCsv')
      ? parseCitedFactIds(formData)
      : undefined;

  const histology =
    formData.get('checklistHistology') === 'on' ||
    formData.get('checklistHistology') === 'true' ||
    formData.get('checklist_histology') === 'on' ||
    formData.get('checklist_histology') === 'true';
  const imaging =
    formData.get('checklistImaging') === 'on' ||
    formData.get('checklistImaging') === 'true' ||
    formData.get('checklist_imaging') === 'on' ||
    formData.get('checklist_imaging') === 'true';
  const staging =
    formData.get('checklistStaging') === 'on' ||
    formData.get('checklistStaging') === 'true' ||
    formData.get('checklist_staging') === 'on' ||
    formData.get('checklist_staging') === 'true';
  const genomics =
    formData.get('checklistGenomics') === 'on' ||
    formData.get('checklistGenomics') === 'true' ||
    formData.get('checklist_genomics') === 'on' ||
    formData.get('checklist_genomics') === 'true';

  if (!meetingId || !patientId) throw new Error('Meeting ID and Patient ID are required');

  await withSession(async (q, s) => {
    await assertPatientBelongsToOrg(q, s.orgId, patientId);
    return updateTumorBoardCase(q, {
      orgId: s.orgId,
      meetingId,
      patientId,
      status,
      discussionSummary,
      recommendationNotes,
      clinicalStaging,
      ...(stagingFactId !== undefined ? { stagingFactId } : {}),
      ...(citedFactIds !== undefined ? { citedFactIds } : {}),
      checklists: {
        histology,
        imaging,
        staging,
        genomics,
      },
      actorId: s.userId,
    });
  });

  revalidatePath('/tumor-board');
  revalidatePath(`/patients/${patientId}/overview`);
}
