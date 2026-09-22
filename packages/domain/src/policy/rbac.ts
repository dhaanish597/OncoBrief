/**
 * Roles and the permission matrix (architecture §13.3).
 *
 * This table is the single source of truth: the implementation reads it, and
 * the unit test asserts it cell by cell, so the two cannot drift.
 *
 * Three properties are load-bearing and are asserted in tests:
 *  - `packet:approve` and `message:approve` are clinician-only. These are the
 *    two points where information leaves the system toward a care decision or a
 *    patient, so the accountable professional signs.
 *  - `auditor` is read-only by construction — it holds no mutating permission.
 *  - `org_admin` cannot verify, correct or approve. Administering a tenant is
 *    not the same authority as attesting to a clinical record.
 */

export const ROLES = ['clinician', 'coordinator', 'records_officer', 'org_admin', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'patient:read',
  'document:upload',
  'document:read_page',
  'evidence:verify',
  'evidence:correct',
  'evidence:reject',
  'conflict:resolve',
  'task:create',
  'task:assign',
  'packet:draft',
  'packet:approve',
  'message:compose',
  'message:approve',
  'packet:export',
  'checklist:author',
  'audit:read',
  'user:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const M: Record<Permission, readonly Role[]> = {
  'patient:read': ['clinician', 'coordinator', 'records_officer', 'org_admin', 'auditor'],
  'document:upload': ['clinician', 'coordinator', 'records_officer', 'org_admin'],
  'document:read_page': ['clinician', 'coordinator', 'records_officer', 'org_admin', 'auditor'],
  'evidence:verify': ['clinician', 'coordinator', 'records_officer'],
  'evidence:correct': ['clinician', 'records_officer'],
  'evidence:reject': ['clinician', 'records_officer'],
  'conflict:resolve': ['clinician', 'records_officer'],
  'task:create': ['clinician', 'coordinator', 'records_officer'],
  'task:assign': ['coordinator', 'records_officer', 'org_admin'],
  'packet:draft': ['clinician', 'coordinator'],
  'packet:approve': ['clinician'],
  'message:compose': ['coordinator', 'records_officer'],
  'message:approve': ['clinician'],
  'packet:export': ['clinician', 'coordinator', 'org_admin'],
  'checklist:author': ['records_officer', 'org_admin'],
  'audit:read': ['org_admin', 'auditor'],
  'user:manage': ['org_admin'],
};

export function can(role: Role, permission: Permission): boolean {
  return M[permission].includes(role);
}

/** The full matrix, for the docs table and the test that pins it. */
export function permissionMatrix(): Record<Permission, readonly Role[]> {
  return M;
}
