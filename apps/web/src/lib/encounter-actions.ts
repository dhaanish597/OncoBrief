'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@oncobrief/domain';
import {
  startEncounter,
  addEncounterParticipant,
  saveEncounterNoteDraft,
  finalizeEncounterNote,
  amendEncounterNote,
  completeEncounter,
  type EncounterType,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';

export async function startEncounterAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'encounter:create')) {
    throw new Error('forbidden: User role lacks encounter:create permission');
  }

  const patientId = String(formData.get('patientId') || '').trim();
  const appointmentId = String(formData.get('appointmentId') || '').trim() || null;
  const encounterType = (String(formData.get('encounterType') || 'outpatient') as EncounterType);

  if (!patientId) throw new Error('Patient is required');

  const id = await withSession(async (q, s) => {
    return startEncounter(q, {
      orgId: s.orgId,
      patientId,
      appointmentId,
      clinicianId: s.userId,
      encounterType,
      actorId: s.userId,
    });
  });

  revalidatePath(`/patients/${patientId}/encounters`);
  revalidatePath(`/patients/${patientId}/overview`);
  revalidatePath('/workspace');
  redirect(`/patients/${patientId}/encounters/${id}`);
}

export async function saveEncounterNoteDraftAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'encounter:note')) {
    throw new Error('forbidden: Note authoring requires clinician authority');
  }

  const encounterId = String(formData.get('encounterId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const title = String(formData.get('title') || 'Consultation Note').trim();
  const chiefComplaint = String(formData.get('chiefComplaint') || '').trim() || null;
  const historyPresentIllness = String(formData.get('historyPresentIllness') || '').trim() || null;
  const clinicalAssessment = String(formData.get('clinicalAssessment') || '').trim() || null;
  const planAndInstructions = String(formData.get('planAndInstructions') || '').trim() || null;
  const followUpInstructions = String(formData.get('followUpInstructions') || '').trim() || null;

  if (!encounterId) throw new Error('Encounter is required');

  await withSession(async (q, s) => {
    return saveEncounterNoteDraft(q, {
      orgId: s.orgId,
      encounterId,
      title,
      chiefComplaint,
      historyPresentIllness,
      clinicalAssessment,
      planAndInstructions,
      followUpInstructions,
      actorId: s.userId,
    });
  });

  if (patientId) revalidatePath(`/patients/${patientId}/encounters/${encounterId}`);
}

export async function finalizeEncounterNoteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'encounter:note')) {
    throw new Error('forbidden: Note signing requires clinician authority');
  }

  const encounterId = String(formData.get('encounterId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const noteId = String(formData.get('noteId') || '').trim();

  if (!encounterId) throw new Error('Encounter is required');
  if (!noteId) throw new Error('Note ID is required');

  await withSession(async (q, s) => {
    return finalizeEncounterNote(q, {
      orgId: s.orgId,
      encounterId,
      noteId,
      actorId: s.userId,
    });
  });

  if (patientId) {
    revalidatePath(`/patients/${patientId}/encounters/${encounterId}`);
    revalidatePath(`/patients/${patientId}/encounters`);
    revalidatePath(`/patients/${patientId}/overview`);
  }
}

export async function amendEncounterNoteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'encounter:note')) {
    throw new Error('forbidden: Note amendment requires clinician authority');
  }

  const encounterId = String(formData.get('encounterId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const noteId = String(formData.get('noteId') || '').trim();
  const amendmentReason = String(formData.get('amendmentReason') || '').trim();
  const clinicalAssessment = String(formData.get('clinicalAssessment') || '').trim() || null;
  const planAndInstructions = String(formData.get('planAndInstructions') || '').trim() || null;
  const followUpInstructions = String(formData.get('followUpInstructions') || '').trim() || null;

  if (!encounterId) throw new Error('Encounter is required');
  if (!noteId) throw new Error('Note ID is required');
  if (!amendmentReason) throw new Error('Documented amendment reason is required');

  await withSession(async (q, s) => {
    return amendEncounterNote(q, {
      orgId: s.orgId,
      encounterId,
      noteId,
      amendmentReason,
      clinicalAssessment,
      planAndInstructions,
      followUpInstructions,
      actorId: s.userId,
    });
  });

  if (patientId) {
    revalidatePath(`/patients/${patientId}/encounters/${encounterId}`);
  }
}

export async function addEncounterParticipantAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'encounter:create')) {
    throw new Error('forbidden: User role lacks encounter management permission');
  }

  const encounterId = String(formData.get('encounterId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();
  const userId = String(formData.get('userId') || '').trim();
  const role = String(formData.get('role') || 'attending').trim();

  if (!encounterId) throw new Error('Encounter is required');
  if (!userId) throw new Error('Participant User ID is required');

  await withSession(async (q, s) => {
    return addEncounterParticipant(q, {
      orgId: s.orgId,
      encounterId,
      userId,
      role,
      actorId: s.userId,
    });
  });

  if (patientId) {
    revalidatePath(`/patients/${patientId}/encounters/${encounterId}`);
  }
}

export async function completeEncounterAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'encounter:create')) {
    throw new Error('forbidden: User role lacks encounter completion permission');
  }

  const encounterId = String(formData.get('encounterId') || '').trim();
  const patientId = String(formData.get('patientId') || '').trim();

  if (!encounterId) throw new Error('Encounter is required');

  await withSession(async (q, s) => {
    return completeEncounter(q, {
      orgId: s.orgId,
      encounterId,
      actorId: s.userId,
    });
  });

  if (patientId) {
    revalidatePath(`/patients/${patientId}/encounters/${encounterId}`);
    revalidatePath(`/patients/${patientId}/encounters`);
    revalidatePath(`/patients/${patientId}/overview`);
    revalidatePath('/workspace');
  }
}
