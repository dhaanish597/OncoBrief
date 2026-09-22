import { describe, expect, it } from 'vitest';
import {
  ROLES,
  PERMISSIONS,
  can,
  permissionMatrix,
  type Permission,
  type Role,
} from '../src/index.js';

/**
 * The matrix is pinned cell by cell against architecture §13.3. If the
 * implementation drifts, this test fails.
 */
const EXPECTED: Record<Permission, readonly Role[]> = {
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

describe('RBAC matrix', () => {
  for (const permission of PERMISSIONS) {
    for (const role of ROLES) {
      const expected = EXPECTED[permission].includes(role);
      it(`${role} ${expected ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
      });
    }
  }

  it('permissionMatrix() matches the pinned table', () => {
    expect(permissionMatrix()).toEqual(EXPECTED);
  });

  it('packet and message approval are clinician-only', () => {
    expect(can('clinician', 'packet:approve')).toBe(true);
    expect(can('clinician', 'message:approve')).toBe(true);
    for (const role of ROLES) {
      if (role === 'clinician') continue;
      expect(can(role, 'packet:approve')).toBe(false);
      expect(can(role, 'message:approve')).toBe(false);
    }
  });

  it('auditor holds no mutating permission', () => {
    const mutating = PERMISSIONS.filter((p) => !p.endsWith(':read') && !p.endsWith(':read_page'));
    for (const p of mutating) {
      expect(can('auditor', p)).toBe(false);
    }
  });

  it('org_admin cannot verify, correct, reject or approve', () => {
    expect(can('org_admin', 'evidence:verify')).toBe(false);
    expect(can('org_admin', 'evidence:correct')).toBe(false);
    expect(can('org_admin', 'evidence:reject')).toBe(false);
    expect(can('org_admin', 'conflict:resolve')).toBe(false);
    expect(can('org_admin', 'packet:approve')).toBe(false);
    expect(can('org_admin', 'message:approve')).toBe(false);
  });
});
