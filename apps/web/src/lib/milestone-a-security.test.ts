import { describe, expect, it } from 'vitest';
import { can } from '@oncobrief/domain';

describe('Milestone A: RBAC Matrix & Clinical Boundary Protections', () => {

  describe('1. Receptionist Permissions & Restrictions', () => {
    it('allows receptionist to register patients', () => {
      expect(can('receptionist', 'patient:create')).toBe(true);
      expect(can('receptionist', 'patient:read')).toBe(true);
    });

    it('allows receptionist to upload documents', () => {
      expect(can('receptionist', 'document:upload')).toBe(true);
    });

    it('strictly forbids receptionist from verifying evidence facts (clinical boundary)', () => {
      expect(can('receptionist', 'evidence:verify')).toBe(false);
      expect(can('receptionist', 'evidence:correct')).toBe(false);
      expect(can('receptionist', 'evidence:reject')).toBe(false);
    });

    it('strictly forbids receptionist from resolving evidence conflicts', () => {
      expect(can('receptionist', 'conflict:resolve')).toBe(false);
    });

    it('strictly forbids receptionist from approving consultation packets', () => {
      expect(can('receptionist', 'packet:approve')).toBe(false);
    });

    it('strictly forbids receptionist from managing staff users or departments', () => {
      expect(can('receptionist', 'user:manage')).toBe(false);
      expect(can('receptionist', 'clinician:manage')).toBe(false);
      expect(can('receptionist', 'department:manage')).toBe(false);
    });
  });

  describe('2. Platform Administrator Restrictions', () => {
    it('allows platform admin to manage users, clinicians, and departments', () => {
      expect(can('platform_admin', 'user:manage')).toBe(true);
      expect(can('platform_admin', 'clinician:manage')).toBe(true);
      expect(can('platform_admin', 'department:manage')).toBe(true);
    });

    it('strictly forbids platform admin from verifying clinical evidence (boundary principle)', () => {
      expect(can('platform_admin', 'evidence:verify')).toBe(false);
      expect(can('platform_admin', 'evidence:correct')).toBe(false);
    });

    it('strictly forbids platform admin from approving consultation packets', () => {
      expect(can('platform_admin', 'packet:approve')).toBe(false);
    });

    it('strictly forbids platform admin from resolving clinical conflicts', () => {
      expect(can('platform_admin', 'conflict:resolve')).toBe(false);
    });
  });

  describe('3. Hospital Org Administrator Boundaries', () => {
    it('allows org admin to manage administrative entities', () => {
      expect(can('org_admin', 'user:manage')).toBe(true);
      expect(can('org_admin', 'clinician:manage')).toBe(true);
      expect(can('org_admin', 'department:manage')).toBe(true);
      expect(can('org_admin', 'patient:create')).toBe(true);
      expect(can('org_admin', 'patient:update')).toBe(true);
      expect(can('org_admin', 'patient:archive')).toBe(true);
    });

    it('strictly forbids org admin from verifying clinical facts', () => {
      expect(can('org_admin', 'evidence:verify')).toBe(false);
      expect(can('org_admin', 'evidence:correct')).toBe(false);
    });

    it('strictly forbids org admin from approving clinical packets', () => {
      expect(can('org_admin', 'packet:approve')).toBe(false);
    });
  });

  describe('4. Clinician & Oncologist Permissions', () => {
    it('allows clinician full evidence verification and clinical packet approval', () => {
      expect(can('clinician', 'evidence:verify')).toBe(true);
      expect(can('clinician', 'evidence:correct')).toBe(true);
      expect(can('clinician', 'evidence:reject')).toBe(true);
      expect(can('clinician', 'conflict:resolve')).toBe(true);
      expect(can('clinician', 'packet:approve')).toBe(true);
      expect(can('clinician', 'patient:read')).toBe(true);
      expect(can('clinician', 'patient:update')).toBe(true);
    });

    it('forbids clinician from managing system users or deleting tenant departments', () => {
      expect(can('clinician', 'user:manage')).toBe(false);
      expect(can('clinician', 'department:manage')).toBe(false);
    });
  });

  describe('5. Auditor Read-Only Boundaries', () => {
    it('allows auditor read access to audit logs and patient records', () => {
      expect(can('auditor', 'audit:read')).toBe(true);
      expect(can('auditor', 'patient:read')).toBe(true);
    });

    it('strictly forbids auditor from mutating patients, documents, or evidence', () => {
      expect(can('auditor', 'patient:create')).toBe(false);
      expect(can('auditor', 'patient:update')).toBe(false);
      expect(can('auditor', 'patient:archive')).toBe(false);
      expect(can('auditor', 'document:upload')).toBe(false);
      expect(can('auditor', 'evidence:verify')).toBe(false);
      expect(can('auditor', 'packet:approve')).toBe(false);
    });
  });

  describe('6. Tumor Board Coordinator Permissions', () => {
    it('allows tumor board coordinator to read patients, draft packets, and manage tasks', () => {
      expect(can('tumor_board_coordinator', 'patient:read')).toBe(true);
      expect(can('tumor_board_coordinator', 'packet:draft')).toBe(true);
      expect(can('tumor_board_coordinator', 'task:create')).toBe(true);
      expect(can('tumor_board_coordinator', 'task:assign')).toBe(true);
    });

    it('strictly forbids tumor board coordinator from approving packets, correcting facts, or resolving conflicts', () => {
      expect(can('tumor_board_coordinator', 'packet:approve')).toBe(false);
      expect(can('tumor_board_coordinator', 'evidence:correct')).toBe(false);
      expect(can('tumor_board_coordinator', 'conflict:resolve')).toBe(false);
    });
  });
});
