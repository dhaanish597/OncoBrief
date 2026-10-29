'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@oncobrief/domain';
import {
  createPatient,
  updatePatient,
  archivePatient,
  reactivatePatient,
  addCareTeamMember,
  removeCareTeamMember,
  checkDuplicatePatient,
} from '@oncobrief/db';
import { requireSession, withSession } from './session';

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`missing_required_field:${key}`);
  }
  return v.trim();
}

function optionalStr(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string' || v.trim().length === 0) return null;
  return v.trim();
}

export async function checkDuplicatePatientAction(
  mrn?: string,
  displayName?: string,
  dob?: string,
) {
  const session = await requireSession();
  if (!can(session.role, 'patient:read')) {
    throw new Error('forbidden');
  }

  return await withSession(async (q, s) => {
    return await checkDuplicatePatient(q, {
      orgId: s.orgId,
      mrn,
      displayName,
      dob,
    });
  });
}

export async function registerPatientAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'patient:create')) {
    throw new Error('forbidden');
  }

  const displayName = str(fd, 'displayName');
  const mrn = str(fd, 'mrn');
  const dob = optionalStr(fd, 'dob');
  const gender = optionalStr(fd, 'gender') as 'female' | 'male' | 'other' | 'unknown' | null;
  const phone = optionalStr(fd, 'phone');
  const email = optionalStr(fd, 'email');
  const address = optionalStr(fd, 'address');
  const primaryLanguage = optionalStr(fd, 'primaryLanguage') ?? 'en-IN';
  const referralSource = optionalStr(fd, 'referralSource');
  const referralNotes = optionalStr(fd, 'referralNotes');
  const primaryClinicianId = optionalStr(fd, 'primaryClinicianId');
  const departmentId = optionalStr(fd, 'departmentId');
  const facilityId = optionalStr(fd, 'facilityId');
  const clinicalContextNote = optionalStr(fd, 'clinicalContextNote');

  const res = await withSession(async (q, s) => {
    return await createPatient(
      q,
      {
        orgId: s.orgId,
        displayName,
        mrn,
        dob,
        gender,
        phone,
        email,
        address,
        primaryLanguage,
        referralSource,
        referralNotes,
        primaryClinicianId,
        departmentId,
        facilityId,
        clinicalContextNote,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/patients');
  revalidatePath('/workspace');
  redirect(`/patients/${res.patientId}/overview`);
}

export async function updatePatientAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'patient:update')) {
    throw new Error('forbidden');
  }

  const patientId = str(fd, 'patientId');
  const displayName = optionalStr(fd, 'displayName') ?? undefined;
  const dob = optionalStr(fd, 'dob');
  const gender = optionalStr(fd, 'gender') as 'female' | 'male' | 'other' | 'unknown' | null;
  const phone = optionalStr(fd, 'phone');
  const email = optionalStr(fd, 'email');
  const address = optionalStr(fd, 'address');
  const primaryLanguage = optionalStr(fd, 'primaryLanguage') ?? undefined;
  const referralSource = optionalStr(fd, 'referralSource');
  const referralNotes = optionalStr(fd, 'referralNotes');
  const primaryClinicianId = optionalStr(fd, 'primaryClinicianId');
  const departmentId = optionalStr(fd, 'departmentId');
  const facilityId = optionalStr(fd, 'facilityId');
  const clinicalContextNote = optionalStr(fd, 'clinicalContextNote');

  await withSession(async (q, s) => {
    await updatePatient(
      q,
      {
        orgId: s.orgId,
        patientId,
        displayName,
        dob,
        gender,
        phone,
        email,
        address,
        primaryLanguage,
        referralSource,
        referralNotes,
        primaryClinicianId,
        departmentId,
        facilityId,
        clinicalContextNote,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/overview`);
  revalidatePath(`/patients/${patientId}/care-team`);
  revalidatePath('/patients');
  revalidatePath('/workspace');
  redirect(`/patients/${patientId}/overview`);
}

export async function archivePatientAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'patient:archive')) {
    throw new Error('forbidden');
  }

  const patientId = str(fd, 'patientId');
  const reason = str(fd, 'reason');

  await withSession(async (q, s) => {
    await archivePatient(
      q,
      {
        orgId: s.orgId,
        patientId,
        reason,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/overview`);
  revalidatePath('/patients');
  revalidatePath('/workspace');
  redirect('/patients');
}

export async function reactivatePatientAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'patient:archive')) {
    throw new Error('forbidden');
  }

  const patientId = str(fd, 'patientId');

  await withSession(async (q, s) => {
    await reactivatePatient(
      q,
      {
        orgId: s.orgId,
        patientId,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/overview`);
  revalidatePath('/patients');
  revalidatePath('/workspace');
  redirect(`/patients/${patientId}/overview`);
}

export async function assignCareTeamAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'task:assign')) {
    throw new Error('forbidden');
  }

  const patientId = str(fd, 'patientId');
  const userId = str(fd, 'userId');
  const roleInTeam = str(fd, 'roleInTeam');
  const notes = optionalStr(fd, 'notes');

  await withSession(async (q, s) => {
    await addCareTeamMember(
      q,
      {
        orgId: s.orgId,
        patientId,
        userId,
        roleInTeam,
        notes,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/overview`);
  revalidatePath(`/patients/${patientId}/care-team`);
}

export async function removeCareTeamAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'task:assign')) {
    throw new Error('forbidden');
  }

  const patientId = str(fd, 'patientId');
  const userId = str(fd, 'userId');

  await withSession(async (q, s) => {
    await removeCareTeamMember(
      q,
      {
        orgId: s.orgId,
        patientId,
        userId,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/overview`);
  revalidatePath(`/patients/${patientId}/care-team`);
}
