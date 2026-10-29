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
import { requireSession, withSession } from '@/lib/session';

export async function createTumorBoardMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor board management permission');
  }

  const title = String(formData.get('title') || '').trim();
  const meetingDate = String(formData.get('meetingDate') || '').trim();
  const startTime = String(formData.get('startTime') || '').trim();
  const endTime = String(formData.get('endTime') || '').trim();
  const location = String(formData.get('location') || '').trim();
  const moderatorUserId = String(formData.get('moderatorUserId') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;

  if (!title) throw new Error('Title is required');
  if (!meetingDate) throw new Error('Date is required');
  if (!startTime || !endTime) throw new Error('Start and end time are required');
  if (!location) throw new Error('Location is required');

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

export async function registerTumorBoardCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor board management permission');
  }

  const meetingId = String(formData.get('meetingId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const packetId = String(formData.get('packetId') || '').trim() || null;
  const presenterUserId = String(formData.get('presenterUserId') || '').trim() || null;
  const clinicalStaging = String(formData.get('clinicalStaging') || '').trim() || null;

  if (!meetingId || !patientId) throw new Error('Meeting and Patient are required');

  await withSession(async (q, s) => {
    return registerTumorBoardCase(q, {
      orgId: s.orgId,
      meetingId,
      patientId,
      packetId,
      presenterUserId,
      clinicalStaging,
      actorId: s.userId,
    });
  });

  revalidatePath('/tumor-board');
}

export async function updateTumorBoardCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor board management permission');
  }

  const meetingId = String(formData.get('meetingId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const status = (String(formData.get('status') || 'scheduled') as CaseStatus);
  const discussionSummary = String(formData.get('discussionSummary') || '').trim() || null;
  const recommendationNotes = String(formData.get('recommendationNotes') || '').trim() || null;

  const histology = formData.get('checklist_histology') === 'on';
  const imaging = formData.get('checklist_imaging') === 'on';
  const staging = formData.get('checklist_staging') === 'on';
  const genomics = formData.get('checklist_genomics') === 'on';

  if (!meetingId || !patientId) throw new Error('Meeting and Patient are required');

  await withSession(async (q, s) => {
    return updateTumorBoardCase(q, {
      orgId: s.orgId,
      meetingId,
      patientId,
      status,
      discussionSummary,
      recommendationNotes,
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
}

export async function updateTumorBoardMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'tumor_board:manage')) {
    throw new Error('forbidden: User role lacks tumor board management permission');
  }

  const meetingId = String(formData.get('meetingId') || '').trim();
  const status = (String(formData.get('status') || 'scheduled') as TumorBoardStatus);

  if (!meetingId) throw new Error('Meeting is required');

  await withSession(async (q, s) => {
    return updateTumorBoardMeeting(q, {
      orgId: s.orgId,
      meetingId,
      status,
      actorId: s.userId,
    });
  });

  revalidatePath('/tumor-board');
}
