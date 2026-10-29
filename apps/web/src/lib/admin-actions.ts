'use server';

import { revalidatePath } from 'next/cache';
import { can, type Role } from '@oncobrief/domain';
import {
  createDepartment,
  createFacility,
  createClinician,
  updateClinician,
  createStaffInvitation,
  acceptStaffInvitation,
  updateUserRole,
  toggleUserStatus,
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

export async function createFacilityAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'department:manage')) {
    throw new Error('forbidden');
  }

  const name = str(fd, 'name');
  const code = str(fd, 'code');
  const address = optionalStr(fd, 'address');

  await withSession(async (q, s) => {
    await createFacility(
      q,
      {
        orgId: s.orgId,
        name,
        code,
        address,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/departments');
  revalidatePath('/admin');
}

export async function createDepartmentAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'department:manage')) {
    throw new Error('forbidden');
  }

  const name = str(fd, 'name');
  const code = str(fd, 'code');
  const facilityId = optionalStr(fd, 'facilityId');
  const specialty = optionalStr(fd, 'specialty');

  await withSession(async (q, s) => {
    await createDepartment(
      q,
      {
        orgId: s.orgId,
        name,
        code,
        facilityId,
        specialty,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/departments');
  revalidatePath('/admin/clinicians');
  revalidatePath('/admin');
}

export async function createClinicianAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'clinician:manage')) {
    throw new Error('forbidden');
  }

  const email = str(fd, 'email');
  const displayName = str(fd, 'displayName');
  const specialty = str(fd, 'specialty');
  const subSpecialty = optionalStr(fd, 'subSpecialty');
  const licenseNumber = optionalStr(fd, 'licenseNumber');
  const departmentId = optionalStr(fd, 'departmentId');
  const consultationRoom = optionalStr(fd, 'consultationRoom');
  const password = optionalStr(fd, 'password') ?? 'oncobrief-clinician';

  await withSession(async (q, s) => {
    await createClinician(
      q,
      {
        orgId: s.orgId,
        email,
        displayName,
        specialty,
        subSpecialty,
        licenseNumber,
        departmentId,
        consultationRoom,
        password,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/clinicians');
  revalidatePath('/admin/users');
  revalidatePath('/admin');
}

export async function updateClinicianAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'clinician:manage')) {
    throw new Error('forbidden');
  }

  const clinicianProfileId = str(fd, 'clinicianProfileId');
  const specialty = optionalStr(fd, 'specialty') ?? undefined;
  const subSpecialty = optionalStr(fd, 'subSpecialty');
  const licenseNumber = optionalStr(fd, 'licenseNumber');
  const departmentId = optionalStr(fd, 'departmentId');
  const consultationRoom = optionalStr(fd, 'consultationRoom');

  await withSession(async (q, s) => {
    await updateClinician(
      q,
      {
        orgId: s.orgId,
        clinicianProfileId,
        specialty,
        subSpecialty,
        licenseNumber,
        departmentId,
        consultationRoom,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/clinicians');
  revalidatePath('/admin');
}

export async function inviteStaffAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'user:manage')) {
    throw new Error('forbidden');
  }

  const email = str(fd, 'email');
  const displayName = str(fd, 'displayName');
  const role = str(fd, 'role') as Role;
  const departmentId = optionalStr(fd, 'departmentId');
  const specialty = optionalStr(fd, 'specialty');

  await withSession(async (q, s) => {
    await createStaffInvitation(
      q,
      {
        orgId: s.orgId,
        email,
        displayName,
        role,
        departmentId,
        specialty,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/users');
  revalidatePath('/admin');
}

export async function updateUserRoleAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'user:manage')) {
    throw new Error('forbidden');
  }

  const userId = str(fd, 'userId');
  const newRole = str(fd, 'newRole') as Role;

  await withSession(async (q, s) => {
    await updateUserRole(
      q,
      {
        orgId: s.orgId,
        userId,
        newRole,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/users');
  revalidatePath('/admin/clinicians');
  revalidatePath('/admin');
}

export async function toggleUserStatusAction(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'user:manage')) {
    throw new Error('forbidden');
  }

  const userId = str(fd, 'userId');
  const isActive = fd.get('isActive') === 'true';

  await withSession(async (q, s) => {
    await toggleUserStatus(
      q,
      {
        orgId: s.orgId,
        userId,
        isActive,
      },
      { userId: s.userId, role: s.role },
    );
  });

  revalidatePath('/admin/users');
  revalidatePath('/admin/clinicians');
  revalidatePath('/admin');
}

export async function acceptInvitationAction(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const token = str(fd, 'token');
  const password = str(fd, 'password');

  try {
    const { getMigratorPool } = await import('@oncobrief/db');
    const pool = getMigratorPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await acceptStaffInvitation(client, { token, password });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
