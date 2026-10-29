import { describe, expect, it } from 'vitest';
import { can, TASK_ORIGIN_KINDS } from '@oncobrief/domain';

describe('Milestone B: Oncology Operations RBAC & Clinical Governance', () => {

  describe('1. Appointment Management & Scheduling RBAC', () => {
    it('allows receptionists, coordinators, and clinicians to schedule appointments', () => {
      expect(can('receptionist', 'appointment:create')).toBe(true);
      expect(can('coordinator', 'appointment:create')).toBe(true);
      expect(can('clinician', 'appointment:create')).toBe(true);
      expect(can('org_admin', 'appointment:create')).toBe(true);
    });

    it('allows receptionists, coordinators, and clinicians to reschedule or update appointments', () => {
      expect(can('receptionist', 'appointment:update')).toBe(true);
      expect(can('coordinator', 'appointment:update')).toBe(true);
      expect(can('clinician', 'appointment:update')).toBe(true);
      expect(can('org_admin', 'appointment:update')).toBe(true);
    });

    it('strictly forbids auditors from creating or updating appointments', () => {
      expect(can('auditor', 'appointment:create')).toBe(false);
      expect(can('auditor', 'appointment:update')).toBe(false);
    });
  });

  describe('2. Consultation Encounter & Note Authoring Clinical Boundary', () => {
    it('allows clinicians to initiate clinical consultation encounters', () => {
      expect(can('clinician', 'encounter:create')).toBe(true);
    });

    it('allows coordinators to initialize administrative encounter shells', () => {
      expect(can('coordinator', 'encounter:create')).toBe(true);
    });

    it('STRICT CLINICAL BOUNDARY: only clinicians may author, finalize, and amend clinical encounter notes', () => {
      expect(can('clinician', 'encounter:note')).toBe(true);

      // Non-clinicians MUST NEVER sign or author clinical notes
      expect(can('receptionist', 'encounter:note')).toBe(false);
      expect(can('coordinator', 'encounter:note')).toBe(false);
      expect(can('tumor_board_coordinator', 'encounter:note')).toBe(false);
      expect(can('org_admin', 'encounter:note')).toBe(false);
      expect(can('platform_admin', 'encounter:note')).toBe(false);
      expect(can('auditor', 'encounter:note')).toBe(false);
    });

    it('strictly forbids receptionists and auditors from initiating encounters', () => {
      expect(can('receptionist', 'encounter:create')).toBe(false);
      expect(can('auditor', 'encounter:create')).toBe(false);
    });
  });

  describe('3. Tumor Board Management RBAC', () => {
    it('allows tumor board coordinators, clinicians, coordinators, and org admins to manage multidisciplinary meetings', () => {
      expect(can('tumor_board_coordinator', 'tumor_board:manage')).toBe(true);
      expect(can('clinician', 'tumor_board:manage')).toBe(true);
      expect(can('coordinator', 'tumor_board:manage')).toBe(true);
      expect(can('org_admin', 'tumor_board:manage')).toBe(true);
    });

    it('strictly forbids receptionists and auditors from managing tumor board cases or meetings', () => {
      expect(can('receptionist', 'tumor_board:manage')).toBe(false);
      expect(can('auditor', 'tumor_board:manage')).toBe(false);
    });
  });

  describe('4. Administrative Task Handoff & Encounter Origin Integration', () => {
    it('includes encounter as an authorized origin kind for administrative care-coordination tasks', () => {
      expect(TASK_ORIGIN_KINDS).toContain('encounter');
      expect(TASK_ORIGIN_KINDS).toContain('evidence');
      expect(TASK_ORIGIN_KINDS).toContain('record_gap');
      expect(TASK_ORIGIN_KINDS).toContain('conflict');
      expect(TASK_ORIGIN_KINDS).toContain('document');
    });

    it('allows coordinators, clinicians, and tumor board coordinators to create administrative tasks', () => {
      expect(can('coordinator', 'task:create')).toBe(true);
      expect(can('coordinator', 'task:assign')).toBe(true);

      expect(can('clinician', 'task:create')).toBe(true);
      expect(can('tumor_board_coordinator', 'task:create')).toBe(true);
      expect(can('tumor_board_coordinator', 'task:assign')).toBe(true);
    });
  });
});
