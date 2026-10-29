import { describe, expect, it } from 'vitest';
import {
  ROLES,
  PERMISSIONS,
  can,
  permissionMatrix,
  type Permission,
  type Role,
} from '../src/index';

/**
 * The matrix is pinned cell by cell against architecture §13.3. If the
 * implementation drifts, this test fails.
 */
const EXPECTED: Record<Permission, readonly Role[]> = {
  'patient:read': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'auditor',
    'receptionist',
    'tumor_board_coordinator',
  ],
  'patient:create': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'receptionist',
  ],
  'patient:update': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'receptionist',
  ],
  'patient:archive': ['records_officer', 'org_admin'],
  'document:upload': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'receptionist',
  ],
  'document:read_page': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'auditor',
    'receptionist',
    'tumor_board_coordinator',
  ],
  'evidence:verify': [
    'clinician',
    'coordinator',
    'records_officer',
    'tumor_board_coordinator',
  ],
  'evidence:correct': ['clinician', 'records_officer'],
  'evidence:reject': ['clinician', 'records_officer'],
  'conflict:resolve': ['clinician', 'records_officer'],
  'task:create': [
    'clinician',
    'coordinator',
    'records_officer',
    'receptionist',
    'tumor_board_coordinator',
  ],
  'task:assign': [
    'coordinator',
    'records_officer',
    'org_admin',
    'tumor_board_coordinator',
  ],
  'packet:draft': ['clinician', 'coordinator', 'tumor_board_coordinator'],
  'packet:approve': ['clinician'],
  'message:compose': ['coordinator', 'records_officer', 'receptionist'],
  'message:approve': ['clinician'],
  'packet:export': [
    'clinician',
    'coordinator',
    'org_admin',
    'tumor_board_coordinator',
  ],
  'checklist:author': ['records_officer', 'org_admin'],
  'audit:read': ['org_admin', 'auditor', 'platform_admin'],
  'user:manage': ['org_admin', 'platform_admin'],
  'clinician:manage': ['org_admin', 'platform_admin'],
  'department:manage': ['org_admin', 'platform_admin'],
  'opd:manage': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'receptionist',
  ],
  'appointment:create': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'receptionist',
  ],
  'appointment:update': [
    'clinician',
    'coordinator',
    'records_officer',
    'org_admin',
    'receptionist',
  ],
  'encounter:create': ['clinician', 'coordinator'],
  'encounter:note': ['clinician'],
  'tumor_board:manage': [
    'clinician',
    'coordinator',
    'tumor_board_coordinator',
    'org_admin',
  ],
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
    const mutating = PERMISSIONS.filter(
      (p) => !p.endsWith(':read') && !p.endsWith(':read_page'),
    );
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

  it('platform_admin has no routine clinical patient access or verification authority', () => {
    expect(can('platform_admin', 'patient:read')).toBe(false);
    expect(can('platform_admin', 'patient:create')).toBe(false);
    expect(can('platform_admin', 'evidence:verify')).toBe(false);
    expect(can('platform_admin', 'packet:approve')).toBe(false);
    expect(can('platform_admin', 'user:manage')).toBe(true);
    expect(can('platform_admin', 'audit:read')).toBe(true);
  });

  it('receptionist can register patients and upload docs but cannot verify evidence', () => {
    expect(can('receptionist', 'patient:create')).toBe(true);
    expect(can('receptionist', 'patient:read')).toBe(true);
    expect(can('receptionist', 'document:upload')).toBe(true);
    expect(can('receptionist', 'evidence:verify')).toBe(false);
    expect(can('receptionist', 'evidence:correct')).toBe(false);
    expect(can('receptionist', 'packet:approve')).toBe(false);
  });
});
