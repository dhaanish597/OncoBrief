import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { setupFixtures, appClientForOrg, withSuperuser, type Fixtures } from './helpers';
import {
  createPatient,
  getPatient,
  updatePatient,
  archivePatient,
  reactivatePatient,
  addCareTeamMember,
  removeCareTeamMember,
  listCareTeam,
  checkDuplicatePatient,
  searchAndFilterPatients,
  listFacilities,
  listDepartments,
  createClinician,
  updateClinician,
  listClinicians,
  createStaffInvitation,
  getInvitationByToken,
  acceptStaffInvitation,
  bootstrapDemo,
  seed,
} from '../src';

describe('Milestone A: Foundation, Users, Clinicians, Patients & RLS', () => {
  let fx: Fixtures;
  let clientOrg1: Client;
  let clientOrg2: Client;
  let clientAdmin: Client;

  beforeAll(async () => {
    fx = await setupFixtures();
    clientOrg1 = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    clientOrg2 = await appClientForOrg(fx.org2, fx.clinicians.clinician, 'clinician');
    clientAdmin = await appClientForOrg(fx.org1, fx.clinicians.org_admin, 'org_admin');
  });

  afterAll(async () => {
    if (clientOrg1) await clientOrg1.end();
    if (clientOrg2) await clientOrg2.end();
    if (clientAdmin) await clientAdmin.end();

    await withSuperuser(async (su) => {
      await su.query('DELETE FROM record_gap WHERE patient_id IN (SELECT id FROM patient WHERE is_demo_fixture IS NOT TRUE)');
      await su.query('DELETE FROM patient_checklist WHERE patient_id IN (SELECT id FROM patient WHERE is_demo_fixture IS NOT TRUE)');
      await su.query('DELETE FROM record_readiness_snapshot WHERE patient_id IN (SELECT id FROM patient WHERE is_demo_fixture IS NOT TRUE)');
      await su.query('DELETE FROM patient_care_team WHERE patient_id IN (SELECT id FROM patient WHERE is_demo_fixture IS NOT TRUE)');
      await su.query('DELETE FROM patient_identifier WHERE patient_id IN (SELECT id FROM patient WHERE is_demo_fixture IS NOT TRUE)');
      await su.query('DELETE FROM patient WHERE is_demo_fixture IS NOT TRUE');
      await su.query('DELETE FROM user_invitation WHERE org_id = $1', [fx?.org1]);
      await su.query('UPDATE app_user SET is_demo_fixture = true WHERE is_demo_fixture IS NOT TRUE');
      await su.query('UPDATE membership SET is_demo_fixture = true WHERE is_demo_fixture IS NOT TRUE');
    });
  });

  describe('1. Patient Registry & Demographics CRUD', () => {
    it('creates a new patient with complete administrative fields', async () => {
      const mrn = `TEST-MRN-${Date.now()}`;
      const res = await createPatient(
        clientOrg1,
        {
          orgId: fx.org1,
          displayName: 'Lakshmi Narayanan',
          mrn,
          dob: '1968-04-15',
          gender: 'female',
          phone: '+919876543210',
          email: 'lakshmi.n@example.org',
          address: '42 MG Road, Bengaluru',
          primaryLanguage: 'kn-IN',
          referralSource: 'District General Hospital',
          referralNotes: 'Referred for multimodality evaluation',
          clinicalContextNote: 'Administrative registration only. Source records pending upload.',
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      expect(res.patientId).toBeDefined();

      const patient = await getPatient(clientOrg1, res.patientId);
      expect(patient).not.toBeNull();
      expect(patient?.displayName).toBe('Lakshmi Narayanan');
      expect(patient?.mrn).toBe(mrn);
      expect(patient?.dob).toBe('1968-04-15');
      expect(patient?.gender).toBe('female');
      expect(patient?.phone).toBe('+919876543210');
      expect(patient?.email).toBe('lakshmi.n@example.org');
      expect(patient?.status).toBe('active');
      expect(patient?.isDemoFixture).toBe(false);
    });

    it('updates patient demographics and contact details', async () => {
      const mrn = `TEST-UPD-${Date.now()}`;
      const created = await createPatient(
        clientOrg1,
        {
          orgId: fx.org1,
          displayName: 'Karan Mehra',
          mrn,
          phone: '+919000000000',
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      await updatePatient(
        clientOrg1,
        {
          orgId: fx.org1,
          patientId: created.patientId,
          displayName: 'Karan Mehra (Updated)',
          phone: '+919111111111',
          email: 'karan.updated@example.org',
          address: '77 Indiranagar, Bengaluru',
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      const updated = await getPatient(clientOrg1, created.patientId);
      expect(updated?.displayName).toBe('Karan Mehra (Updated)');
      expect(updated?.phone).toBe('+919111111111');
      expect(updated?.email).toBe('karan.updated@example.org');
      expect(updated?.address).toBe('77 Indiranagar, Bengaluru');
    });

    it('searches and filters patients by query string and status', async () => {
      const query = 'Fragmented';
      const result = await searchAndFilterPatients(clientOrg1, {
        search: query,
        status: 'active',
      });

      expect(result.patients.length).toBeGreaterThanOrEqual(1);
      expect(result.patients[0]?.displayName).toContain('DEMO-001');
    });
  });

  describe('2. Duplicate MRN Detection & Prevention', () => {
    it('detects duplicate MRN in checkDuplicatePatient within same tenant', async () => {
      const dupCheck = await checkDuplicatePatient(clientOrg1, {
        orgId: fx.org1,
        mrn: 'SUN-448120',
      });
      expect(dupCheck.hasDuplicate).toBe(true);
      expect(dupCheck.existingPatient?.mrn).toBe('SUN-448120');
    });

    it('rejects duplicate MRN creation in same tenant', async () => {
      await expect(
        createPatient(
          clientOrg1,
          {
            orgId: fx.org1,
            displayName: 'Colliding Patient',
            mrn: 'SUN-448120',
          },
          { userId: fx.clinicians.clinician, role: 'clinician' },
        ),
      ).rejects.toThrow('duplicate_patient_mrn');
    });

    it('allows same MRN in different hospital tenant (tenant-scoped MRN)', async () => {
      const scopedMrn = `SCOPED-MRN-${Date.now()}`;
      const p1 = await createPatient(
        clientOrg1,
        {
          orgId: fx.org1,
          displayName: 'Tenant 1 Patient',
          mrn: scopedMrn,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      const p2 = await createPatient(
        clientOrg2,
        {
          orgId: fx.org2,
          displayName: 'Tenant 2 Patient',
          mrn: scopedMrn,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      expect(p1.patientId).not.toBe(p2.patientId);
    });
  });

  describe('3. Clinician Profiles & Oncology Specialties', () => {
    it('creates clinician profile with oncology specialty and department', async () => {
      const email = `dr.test.${Date.now()}@rci.demo`;
      const depts = await listDepartments(clientAdmin);
      const surgDept = depts.find((d) => d.code === 'SURG-ONC') || depts[0];

      const res = await createClinician(
        clientAdmin,
        {
          orgId: fx.org1,
          email,
          displayName: 'Dr. Vivek Swamy',
          specialty: 'Surgical Oncology',
          subSpecialty: 'Gastrointestinal & HPB',
          licenseNumber: 'MCI-99887',
          departmentId: surgDept?.id,
          consultationRoom: 'OPD-104',
        },
        { userId: fx.clinicians.org_admin, role: 'org_admin' },
      );

      expect(res.userId).toBeDefined();
      expect(res.clinicianProfileId).toBeDefined();

      const clinicians = await listClinicians(clientAdmin);
      const found = clinicians.find((c) => c.userId === res.userId);
      expect(found).toBeDefined();
      expect(found?.displayName).toBe('Dr. Vivek Swamy');
      expect(found?.specialty).toBe('Surgical Oncology');
      expect(found?.licenseNumber).toBe('MCI-99887');
      expect(found?.departmentName).toBe(surgDept?.name);
    });

    it('updates clinician profile information', async () => {
      const email = `dr.upd.${Date.now()}@rci.demo`;
      const created = await createClinician(
        clientAdmin,
        {
          orgId: fx.org1,
          email,
          displayName: 'Dr. Shalini Roy',
          specialty: 'Medical Oncology',
        },
        { userId: fx.clinicians.org_admin, role: 'org_admin' },
      );

      await updateClinician(
        clientAdmin,
        {
          orgId: fx.org1,
          clinicianProfileId: created.clinicianProfileId,
          specialty: 'Medical Oncology',
          subSpecialty: 'Thoracic Oncology',
          licenseNumber: 'MCI-11223',
          consultationRoom: 'Room 205',
        },
        { userId: fx.clinicians.org_admin, role: 'org_admin' },
      );

      const clinicians = await listClinicians(clientAdmin);
      const found = clinicians.find((c) => c.id === created.clinicianProfileId);
      expect(found?.subSpecialty).toBe('Thoracic Oncology');
      expect(found?.licenseNumber).toBe('MCI-11223');
      expect(found?.consultationRoom).toBe('Room 205');
    });
  });

  describe('4. Multidisciplinary Care Team Management', () => {
    it('assigns and removes care team members for a patient', async () => {
      const patient = await createPatient(
        clientOrg1,
        {
          orgId: fx.org1,
          displayName: 'Care Team Test Patient',
          mrn: `TEAM-MRN-${Date.now()}`,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      // Add Anita (Coordinator)
      await addCareTeamMember(
        clientOrg1,
        {
          orgId: fx.org1,
          patientId: patient.patientId,
          userId: fx.clinicians.coordinator,
          roleInTeam: 'care_coordinator',
          notes: 'Assigned for navigation',
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      let team = await listCareTeam(clientOrg1, patient.patientId);
      expect(team.length).toBe(1);
      expect(team[0]?.userId).toBe(fx.clinicians.coordinator);
      expect(team[0]?.roleInTeam).toBe('care_coordinator');

      // Remove care team member
      await removeCareTeamMember(
        clientOrg1,
        {
          orgId: fx.org1,
          patientId: patient.patientId,
          userId: fx.clinicians.coordinator,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      team = await listCareTeam(clientOrg1, patient.patientId);
      expect(team.length).toBe(0);
    });
  });

  describe('5. Soft-Delete Archival & Reactivation (Preserving History)', () => {
    it('archives patient without cascading deletion of records or documents', async () => {
      const patient = await createPatient(
        clientOrg1,
        {
          orgId: fx.org1,
          displayName: 'Archival Patient',
          mrn: `ARCH-${Date.now()}`,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      // Archive
      await archivePatient(
        clientOrg1,
        {
          orgId: fx.org1,
          patientId: patient.patientId,
          reason: 'Transferred care to regional oncology center in Chennai',
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      const archived = await getPatient(clientOrg1, patient.patientId);
      expect(archived?.status).toBe('archived');
      expect(archived?.archivedAt).toBeDefined();
      expect(archived?.archivalReason).toBe('Transferred care to regional oncology center in Chennai');

      // Reactivate
      await reactivatePatient(
        clientOrg1,
        {
          orgId: fx.org1,
          patientId: patient.patientId,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      const reactivated = await getPatient(clientOrg1, patient.patientId);
      expect(reactivated?.status).toBe('active');
      expect(reactivated?.archivedAt).toBeNull();
      expect(reactivated?.archivalReason).toBeNull();
    });
  });

  describe('6. Staff Invitations & Account Activation', () => {
    it('creates an invitation, looks up token, and activates staff account', async () => {
      const email = `invitee.${Date.now()}@rci.demo`;
      const inv = await createStaffInvitation(
        clientAdmin,
        {
          orgId: fx.org1,
          email,
          displayName: 'Dr. Neha Kulkarni',
          role: 'clinician',
          specialty: 'Radiation Oncology',
        },
        { userId: fx.clinicians.org_admin, role: 'org_admin' },
      );

      expect(inv.id).toBeDefined();
      expect(inv.token).toBeDefined();

      // Lookup invitation by token
      const found = await getInvitationByToken(clientAdmin, inv.token);
      expect(found).not.toBeNull();
      expect(found?.email).toBe(email);
      expect(found?.role).toBe('clinician');

      // Accept invitation
      const accepted = await acceptStaffInvitation(clientAdmin, {
        token: inv.token,
        password: 'secure-activation-password-123',
      });

      expect(accepted.userId).toBeDefined();
      expect(accepted.orgId).toBe(fx.org1);
      expect(accepted.role).toBe('clinician');

      // Duplicate acceptance fails
      await expect(
        acceptStaffInvitation(clientAdmin, {
          token: inv.token,
          password: 'secure-activation-password-123',
        }),
      ).rejects.toThrow('invitation_already_accepted');
    });
  });

  describe('7. Forced PostgreSQL Row-Level Security on New Entities', () => {
    it('isolates facilities between tenants', async () => {
      const fac1 = await listFacilities(clientOrg1);
      const fac2 = await listFacilities(clientOrg2);

      expect(fac1.length).toBeGreaterThan(0);
      expect(fac2.length).toBeGreaterThan(0);

      // Verify no overlap
      const ids1 = new Set(fac1.map((f) => f.id));
      for (const f of fac2) {
        expect(ids1.has(f.id)).toBe(false);
      }
    });

    it('isolates departments between tenants', async () => {
      const dep1 = await listDepartments(clientOrg1);
      const dep2 = await listDepartments(clientOrg2);

      const ids1 = new Set(dep1.map((d) => d.id));
      for (const d of dep2) {
        expect(ids1.has(d.id)).toBe(false);
      }
    });

    it('isolates clinicians between tenants', async () => {
      const clin1 = await listClinicians(clientOrg1);
      const clin2 = await listClinicians(clientOrg2);

      const emails1 = new Set(clin1.map((c) => c.email));
      for (const c of clin2) {
        expect(emails1.has(c.email)).toBe(false);
      }
    });
  });

  describe('8. Safe Idempotent Demo Bootstrap', () => {
    it('runs bootstrapDemo without wiping user-created records', async () => {
      // 1. Create a non-demo user patient
      const userPatient = await createPatient(
        clientOrg1,
        {
          orgId: fx.org1,
          displayName: 'Real Hospital Patient (Non-Demo)',
          mrn: `REAL-MRN-${Date.now()}`,
        },
        { userId: fx.clinicians.clinician, role: 'clinician' },
      );

      // 2. Run bootstrapDemo()
      const summary = await bootstrapDemo();
      expect(summary.orgs.length).toBeGreaterThan(0);

      // 3. Verify user patient STILL EXISTS!
      const check = await getPatient(clientOrg1, userPatient.patientId);
      expect(check).not.toBeNull();
      expect(check?.displayName).toBe('Real Hospital Patient (Non-Demo)');

      // 4. Verify seed() continues to protect non-synthetic data by throwing
      await expect(seed()).rejects.toThrow('demo_reset_non_synthetic_data');

      // Clean up the non-demo patient to restore fixture database state
      await withSuperuser(async (su) => {
        await su.query('DELETE FROM record_gap WHERE patient_id = $1', [userPatient.patientId]);
        await su.query('DELETE FROM patient_checklist WHERE patient_id = $1', [userPatient.patientId]);
        await su.query('DELETE FROM record_readiness_snapshot WHERE patient_id = $1', [userPatient.patientId]);
        await su.query('DELETE FROM patient_care_team WHERE patient_id = $1', [userPatient.patientId]);
        await su.query('DELETE FROM patient_identifier WHERE patient_id = $1', [userPatient.patientId]);
        await su.query('DELETE FROM patient WHERE id = $1', [userPatient.patientId]);
      });
    });
  });
});
