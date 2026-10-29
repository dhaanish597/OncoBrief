import { randomBytes } from 'node:crypto';
import type { Role } from '@oncobrief/domain';
import type { Querier } from '../client';
import { appendAuditEvent, type AuditActor, type AuditRequestMeta } from './audit';
import { hashPassword } from './auth';

export interface FacilityRecord {
  id: string;
  orgId: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface DepartmentRecord {
  id: string;
  orgId: string;
  facilityId: string | null;
  facilityName?: string | null;
  name: string;
  code: string;
  specialty: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ClinicianRecord {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  specialty: string;
  subSpecialty: string | null;
  licenseNumber: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  consultationRoom: string | null;
  isActive: boolean;
  assignedPatientCount: number;
  createdAt: Date;
}

export interface StaffMemberRecord {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  isDemoFixture: boolean;
  createdAt: Date;
  specialty?: string | null;
  departmentName?: string | null;
}

export interface UserInvitationRecord {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  role: Role;
  departmentId: string | null;
  departmentName?: string | null;
  specialty: string | null;
  token: string;
  invitedBy: string;
  invitedByName?: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  isExpired: boolean;
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export async function listFacilities(q: Querier): Promise<FacilityRecord[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    name: string;
    code: string;
    address: string | null;
    is_active: boolean;
    created_at: Date;
  }>(
    `SELECT id, org_id, name, code, address, is_active, created_at
     FROM facility
     ORDER BY name ASC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    code: r.code,
    address: r.address,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function createFacility(
  q: Querier,
  input: {
    orgId: string;
    name: string;
    code: string;
    address?: string | null;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<{ id: string }> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new Error('facility_name_required');
  if (!code) throw new Error('facility_code_required');

  const res = await q.query<{ id: string }>(
    `INSERT INTO facility (org_id, name, code, address)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.orgId, name, code, input.address?.trim() ?? null],
  );
  const id = res.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'facility.created',
    entityKind: 'facility',
    entityId: id,
    outcome: 'success',
    metadata: { name, code },
    request,
  });

  return { id };
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function listDepartments(q: Querier): Promise<DepartmentRecord[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    facility_id: string | null;
    facility_name: string | null;
    name: string;
    code: string;
    specialty: string | null;
    is_active: boolean;
    created_at: Date;
  }>(
    `SELECT d.id, d.org_id, d.facility_id, f.name AS facility_name,
            d.name, d.code, d.specialty, d.is_active, d.created_at
     FROM department d
     LEFT JOIN facility f ON f.id = d.facility_id
     ORDER BY d.name ASC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    facilityId: r.facility_id,
    facilityName: r.facility_name,
    name: r.name,
    code: r.code,
    specialty: r.specialty,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function createDepartment(
  q: Querier,
  input: {
    orgId: string;
    name: string;
    code: string;
    facilityId?: string | null;
    specialty?: string | null;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<{ id: string }> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new Error('department_name_required');
  if (!code) throw new Error('department_code_required');

  const res = await q.query<{ id: string }>(
    `INSERT INTO department (org_id, name, code, facility_id, specialty)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.orgId,
      name,
      code,
      input.facilityId ?? null,
      input.specialty?.trim() ?? null,
    ],
  );
  const id = res.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'department.created',
    entityKind: 'department',
    entityId: id,
    outcome: 'success',
    metadata: { name, code, specialty: input.specialty },
    request,
  });

  return { id };
}

// ---------------------------------------------------------------------------
// Clinicians
// ---------------------------------------------------------------------------

export async function listClinicians(q: Querier): Promise<ClinicianRecord[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    user_id: string;
    email: string;
    display_name: string;
    role: Role;
    specialty: string;
    sub_specialty: string | null;
    license_number: string | null;
    department_id: string | null;
    department_name: string | null;
    consultation_room: string | null;
    is_active: boolean;
    assigned_patient_count: string;
    created_at: Date;
  }>(
    `SELECT cp.id, cp.org_id, cp.user_id, u.email, u.display_name, m.role,
            cp.specialty, cp.sub_specialty, cp.license_number,
            cp.department_id, d.name AS department_name,
            cp.consultation_room, cp.is_active,
            (SELECT count(*)::text FROM patient p WHERE p.primary_clinician_id = u.id AND p.status = 'active') AS assigned_patient_count,
            cp.created_at
     FROM clinician_profile cp
     JOIN app_user u ON u.id = cp.user_id
     JOIN membership m ON m.user_id = u.id AND m.org_id = cp.org_id
     LEFT JOIN department d ON d.id = cp.department_id
     ORDER BY u.display_name ASC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    specialty: r.specialty,
    subSpecialty: r.sub_specialty,
    licenseNumber: r.license_number,
    departmentId: r.department_id,
    departmentName: r.department_name,
    consultationRoom: r.consultation_room,
    isActive: r.is_active,
    assignedPatientCount: Number(r.assigned_patient_count || '0'),
    createdAt: r.created_at,
  }));
}

export async function createClinician(
  q: Querier,
  input: {
    orgId: string;
    email: string;
    displayName: string;
    specialty: string;
    subSpecialty?: string | null;
    licenseNumber?: string | null;
    departmentId?: string | null;
    consultationRoom?: string | null;
    password?: string;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<{ clinicianProfileId: string; userId: string }> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const specialty = input.specialty.trim();
  if (!email) throw new Error('email_required');
  if (!displayName) throw new Error('display_name_required');
  if (!specialty) throw new Error('specialty_required');

  // Check if user already exists
  let userId: string;
  const existingUser = await q.query<{ id: string }>(
    `SELECT id FROM app_user WHERE lower(email) = lower($1)`,
    [email],
  );

  if (existingUser.rows[0]) {
    userId = existingUser.rows[0].id;
    // Ensure membership exists
    await q.query(
      `INSERT INTO membership (org_id, user_id, role)
       VALUES ($1, $2, 'clinician')
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'clinician'`,
      [input.orgId, userId],
    );
  } else {
    const rawPass = input.password || 'oncobrief-clinician';
    const passwordHash = await hashPassword(rawPass);
    const userRes = await q.query<{ id: string }>(
      `INSERT INTO app_user (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [email, displayName, passwordHash],
    );
    userId = userRes.rows[0]!.id;

    await q.query(
      `INSERT INTO membership (org_id, user_id, role)
       VALUES ($1, $2, 'clinician')`,
      [input.orgId, userId],
    );
  }

  // Create or upsert clinician profile
  const profileRes = await q.query<{ id: string }>(
    `INSERT INTO clinician_profile (org_id, user_id, specialty, sub_specialty, license_number, department_id, consultation_room, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (org_id, user_id) DO UPDATE SET
       specialty = EXCLUDED.specialty,
       sub_specialty = EXCLUDED.sub_specialty,
       license_number = EXCLUDED.license_number,
       department_id = EXCLUDED.department_id,
       consultation_room = EXCLUDED.consultation_room,
       is_active = true,
       updated_at = now()
     RETURNING id`,
    [
      input.orgId,
      userId,
      specialty,
      input.subSpecialty?.trim() ?? null,
      input.licenseNumber?.trim() ?? null,
      input.departmentId ?? null,
      input.consultationRoom?.trim() ?? null,
    ],
  );
  const clinicianProfileId = profileRes.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'clinician.created',
    entityKind: 'clinician_profile',
    entityId: clinicianProfileId,
    outcome: 'success',
    metadata: { userId, email, displayName, specialty },
    request,
  });

  return { clinicianProfileId, userId };
}

export async function updateClinician(
  q: Querier,
  input: {
    orgId: string;
    clinicianProfileId: string;
    specialty?: string;
    subSpecialty?: string | null;
    licenseNumber?: string | null;
    departmentId?: string | null;
    consultationRoom?: string | null;
    isActive?: boolean;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<void> {
  const current = await q.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM clinician_profile WHERE id = $1 AND org_id = $2`,
    [input.clinicianProfileId, input.orgId],
  );
  if (!current.rows[0]) throw new Error('clinician_not_found');

  await q.query(
    `UPDATE clinician_profile
     SET specialty = COALESCE($3::text, specialty),
         sub_specialty = CASE WHEN $4::text IS NOT NULL THEN $4::text ELSE sub_specialty END,
         license_number = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE license_number END,
         department_id = CASE WHEN $6::uuid IS NOT NULL THEN $6::uuid ELSE department_id END,
         consultation_room = CASE WHEN $7::text IS NOT NULL THEN $7::text ELSE consultation_room END,
         is_active = COALESCE($8::boolean, is_active),
         updated_at = now()
     WHERE id = $1 AND org_id = $2`,
    [
      input.clinicianProfileId,
      input.orgId,
      input.specialty ? input.specialty.trim() : null,
      input.subSpecialty !== undefined ? input.subSpecialty?.trim() ?? null : null,
      input.licenseNumber !== undefined ? input.licenseNumber?.trim() ?? null : null,
      input.departmentId !== undefined ? input.departmentId : null,
      input.consultationRoom !== undefined ? input.consultationRoom?.trim() ?? null : null,
      input.isActive !== undefined ? input.isActive : null,
    ],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'clinician.updated',
    entityKind: 'clinician_profile',
    entityId: input.clinicianProfileId,
    outcome: 'success',
    metadata: input as Record<string, unknown>,
    request,
  });
}

// ---------------------------------------------------------------------------
// Staff & User Management
// ---------------------------------------------------------------------------

export async function listStaff(q: Querier): Promise<StaffMemberRecord[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    user_id: string;
    email: string;
    display_name: string;
    role: Role;
    is_active: boolean;
    is_demo_fixture: boolean;
    created_at: Date;
    specialty: string | null;
    department_name: string | null;
  }>(
    `SELECT m.id, m.org_id, u.id AS user_id, u.email, u.display_name, m.role,
            u.is_active, m.is_demo_fixture, m.created_at,
            cp.specialty, d.name AS department_name
     FROM membership m
     JOIN app_user u ON u.id = m.user_id
     LEFT JOIN clinician_profile cp ON cp.user_id = u.id AND cp.org_id = m.org_id
     LEFT JOIN department d ON d.id = cp.department_id
     ORDER BY u.display_name ASC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    isActive: r.is_active,
    isDemoFixture: r.is_demo_fixture,
    createdAt: r.created_at,
    specialty: r.specialty,
    departmentName: r.department_name,
  }));
}

export async function updateUserRole(
  q: Querier,
  input: {
    orgId: string;
    userId: string;
    newRole: Role;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<void> {
  const current = await q.query<{ role: string }>(
    `SELECT role FROM membership WHERE org_id = $1 AND user_id = $2`,
    [input.orgId, input.userId],
  );
  if (!current.rows[0]) throw new Error('user_membership_not_found');

  const previousRole = current.rows[0].role;
  await q.query(
    `UPDATE membership SET role = $3 WHERE org_id = $1 AND user_id = $2`,
    [input.orgId, input.userId, input.newRole],
  );

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'user.role_changed',
    entityKind: 'membership',
    entityId: input.userId,
    outcome: 'success',
    metadata: { previousRole, newRole: input.newRole },
    request,
  });
}

export async function toggleUserStatus(
  q: Querier,
  input: {
    orgId: string;
    userId: string;
    isActive: boolean;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<void> {
  // Prevent user from deactivating themselves
  if (actor.userId === input.userId && !input.isActive) {
    throw new Error('cannot_deactivate_self');
  }

  await q.query(
    `UPDATE app_user SET is_active = $2 WHERE id = $1`,
    [input.userId, input.isActive],
  );

  // If deactivating, also revoke active sessions
  if (!input.isActive) {
    await q.query(
      `UPDATE session SET revoked_at = now() WHERE user_id = $1 AND org_id = $2 AND revoked_at IS NULL`,
      [input.userId, input.orgId],
    );
  }

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'user.status_changed',
    entityKind: 'app_user',
    entityId: input.userId,
    outcome: 'success',
    metadata: { isActive: input.isActive },
    request,
  });
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function listInvitations(q: Querier): Promise<UserInvitationRecord[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    email: string;
    display_name: string;
    role: Role;
    department_id: string | null;
    department_name: string | null;
    specialty: string | null;
    token: string;
    invited_by: string;
    invited_by_name: string | null;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
  }>(
    `SELECT ui.id, ui.org_id, ui.email, ui.display_name, ui.role,
            ui.department_id, d.name AS department_name, ui.specialty,
            ui.token, ui.invited_by, u.display_name AS invited_by_name,
            ui.expires_at, ui.accepted_at, ui.created_at
     FROM user_invitation ui
     LEFT JOIN app_user u ON u.id = ui.invited_by
     LEFT JOIN department d ON d.id = ui.department_id
     ORDER BY ui.created_at DESC`,
  );
  const now = new Date();
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    departmentId: r.department_id,
    departmentName: r.department_name,
    specialty: r.specialty,
    token: r.token,
    invitedBy: r.invited_by,
    invitedByName: r.invited_by_name ?? undefined,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
    isExpired: r.expires_at.getTime() < now.getTime() && !r.accepted_at,
  }));
}

export async function getInvitationByToken(
  q: Querier,
  token: string,
): Promise<{
  id: string;
  email: string;
  displayName: string;
  role: Role;
  orgId: string;
  orgName: string;
  isExpired: boolean;
  acceptedAt: Date | null;
} | null> {
  const res = await q.query<{
    id: string;
    email: string;
    display_name: string;
    role: Role;
    org_id: string;
    org_name: string;
    expires_at: Date;
    accepted_at: Date | null;
  }>(
    `SELECT ui.id, ui.email, ui.display_name, ui.role, ui.org_id, o.name AS org_name,
            ui.expires_at, ui.accepted_at
     FROM user_invitation ui
     JOIN organization o ON o.id = ui.org_id
     WHERE ui.token = $1`,
    [token],
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    orgId: r.org_id,
    orgName: r.org_name,
    isExpired: new Date() > new Date(r.expires_at),
    acceptedAt: r.accepted_at,
  };
}

export async function createStaffInvitation(
  q: Querier,
  input: {
    orgId: string;
    email: string;
    displayName: string;
    role: Role;
    departmentId?: string | null;
    specialty?: string | null;
    expiresInDays?: number;
  },
  actor: AuditActor,
  request?: AuditRequestMeta,
): Promise<{ id: string; token: string }> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email) throw new Error('email_required');
  if (!displayName) throw new Error('display_name_required');
  if (!actor.userId) throw new Error('actor_user_id_required');

  const token = randomBytes(24).toString('base64url');
  const days = input.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const res = await q.query<{ id: string }>(
    `INSERT INTO user_invitation
       (org_id, email, display_name, role, department_id, specialty, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.orgId,
      email,
      displayName,
      input.role,
      input.departmentId ?? null,
      input.specialty?.trim() ?? null,
      token,
      actor.userId,
      expiresAt,
    ],
  );
  const id = res.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor,
    action: 'user.invited',
    entityKind: 'user_invitation',
    entityId: id,
    outcome: 'success',
    metadata: { email, displayName, role: input.role },
    request,
  });

  return { id, token };
}

export async function acceptStaffInvitation(
  q: Querier,
  input: {
    token: string;
    password: string;
  },
  request?: AuditRequestMeta,
): Promise<{ userId: string; orgId: string; role: Role }> {
  const password = input.password.trim();
  if (password.length < 8) throw new Error('password_too_short');

  const invRes = await q.query<{
    id: string;
    org_id: string;
    email: string;
    display_name: string;
    role: Role;
    department_id: string | null;
    specialty: string | null;
    expires_at: Date;
    accepted_at: Date | null;
  }>(
    `SELECT id, org_id, email, display_name, role, department_id, specialty, expires_at, accepted_at
     FROM user_invitation
     WHERE token = $1`,
    [input.token],
  );

  const inv = invRes.rows[0];
  if (!inv) throw new Error('invitation_not_found');
  if (inv.accepted_at) throw new Error('invitation_already_accepted');
  if (inv.expires_at.getTime() < Date.now()) throw new Error('invitation_expired');

  const passwordHash = await hashPassword(password);

  // Check if user already exists
  let userId: string;
  const existingUser = await q.query<{ id: string }>(
    `SELECT id FROM app_user WHERE lower(email) = lower($1)`,
    [inv.email],
  );

  if (existingUser.rows[0]) {
    userId = existingUser.rows[0].id;
    await q.query(
      `UPDATE app_user SET password_hash = $2, is_active = true WHERE id = $1`,
      [userId, passwordHash],
    );
  } else {
    const userRes = await q.query<{ id: string }>(
      `INSERT INTO app_user (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [inv.email, inv.display_name, passwordHash],
    );
    userId = userRes.rows[0]!.id;
  }

  // Create membership
  await q.query(
    `INSERT INTO membership (org_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [inv.org_id, userId, inv.role],
  );

  // If role is clinician, create clinician profile
  if (inv.role === 'clinician' && inv.specialty) {
    await q.query(
      `INSERT INTO clinician_profile (org_id, user_id, specialty, department_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (org_id, user_id) DO UPDATE SET
         specialty = EXCLUDED.specialty,
         department_id = EXCLUDED.department_id,
         is_active = true,
         updated_at = now()`,
      [inv.org_id, userId, inv.specialty, inv.department_id],
    );
  }

  // Mark invitation accepted
  await q.query(
    `UPDATE user_invitation SET accepted_at = now() WHERE id = $1`,
    [inv.id],
  );

  await appendAuditEvent(q, {
    orgId: inv.org_id,
    actor: { userId, role: inv.role },
    action: 'user.activated',
    entityKind: 'app_user',
    entityId: userId,
    outcome: 'success',
    metadata: { email: inv.email, role: inv.role },
    request,
  });

  return { userId, orgId: inv.org_id, role: inv.role };
}
