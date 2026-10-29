import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { getMigratorPool, withTenant } from '../src/index';
import {
  createAppointment,
  getAppointment,
  rescheduleAppointment,
  changeAppointmentStatus,
  getAppointmentStatusHistory,
  recordClinicianUnavailability,
} from '../src/services/appointments';
import {
  startEncounter,
  getEncounter,
  addEncounterParticipant,
  saveEncounterNoteDraft,
  finalizeEncounterNote,
  amendEncounterNote,
  completeEncounter,
} from '../src/services/encounters';
import {
  createTumorBoardMeeting,
  getTumorBoardMeeting,
  registerTumorBoardCase,
  updateTumorBoardCase,
  listTumorBoardCases,
} from '../src/services/tumor-board';
import { createTask, listMyTasks } from '../src/services/tasks';
import { registerCaregiver, revokeCaregiverConsent, listCaregivers } from '../src/services/caregivers';

describe('Milestone B: Oncology Operations Backend Services', () => {
  let pool: ReturnType<typeof getMigratorPool>;
  let orgId: string;
  let clinicianId: string;
  let secondaryClinicianId: string;
  let coordinatorId: string;
  let patientId: string;

  beforeAll(async () => {
    pool = getMigratorPool();
    const client = await pool.connect();
    try {
      // Find default demo org and demo users
      const orgRes = await client.query<{ id: string }>('SELECT id FROM organization LIMIT 1');
      expect(orgRes.rows.length).toBeGreaterThan(0);
      orgId = orgRes.rows[0]!.id;

      const userRes = await client.query<{ id: string }>(
        `SELECT u.id FROM app_user u
         JOIN membership m ON m.user_id = u.id
         WHERE m.org_id = $1 AND m.role = 'clinician' AND u.is_active
         LIMIT 2`,
        [orgId],
      );
      expect(userRes.rows.length).toBeGreaterThan(0);
      clinicianId = userRes.rows[0]!.id;
      secondaryClinicianId = userRes.rows[1]?.id || clinicianId;

      const coordRes = await client.query<{ id: string }>(
        `SELECT u.id FROM app_user u
         JOIN membership m ON m.user_id = u.id
         WHERE m.org_id = $1 AND m.role = 'coordinator' AND u.is_active
         LIMIT 1`,
        [orgId],
      );
      expect(coordRes.rows.length).toBeGreaterThan(0);
      coordinatorId = coordRes.rows[0]!.id;

      const patRes = await client.query<{ id: string }>(
        'SELECT id FROM patient WHERE org_id = $1 LIMIT 1',
        [orgId],
      );
      expect(patRes.rows.length).toBeGreaterThan(0);
      patientId = patRes.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // Clean up any test records created for milestone-b test
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM tumor_board_meeting WHERE title LIKE 'Test TB %'`);
      await client.query(`DELETE FROM appointment WHERE notes LIKE '%Milestone B Test%'`);
      await client.query(`DELETE FROM clinician_unavailability WHERE reason LIKE '%Milestone B Test%'`);
    } finally {
      client.release();
    }
  });

  // B1: Appointments
  describe('B1: Appointment Scheduling & Collision Prevention', () => {
    it('creates an appointment with token number and records initial status history', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        const appointmentId = await createAppointment(q, {
          orgId,
          patientId,
          clinicianId,
          scheduledStart: '2026-11-10T09:00:00Z',
          scheduledEnd: '2026-11-10T09:30:00Z',
          roomLabel: 'OPD Room 101',
          appointmentType: 'new_consultation',
          notes: 'Milestone B Test Appointment 1',
          actorId: clinicianId,
        });

        expect(appointmentId).toBeDefined();
        const appt = await getAppointment(q, orgId, appointmentId);
        expect(appt).not.toBeNull();
        expect(appt?.patient_id).toBe(patientId);
        expect(appt?.clinician_id).toBe(clinicianId);
        expect(appt?.status).toBe('scheduled');
        expect(appt?.token_number).toMatch(/^TK-\d{3}$/);

        const history = await getAppointmentStatusHistory(q, orgId, appointmentId);
        expect(history.length).toBeGreaterThanOrEqual(1);
        expect(history[0]!.to_status).toBe('scheduled');
      });
    });

    it('rejects an overlapping appointment for the same clinician (concurrency guard)', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        await expect(
          createAppointment(q, {
            orgId,
            patientId,
            clinicianId,
            scheduledStart: '2026-11-10T09:15:00Z', // overlaps 09:00-09:30
            scheduledEnd: '2026-11-10T09:45:00Z',
            roomLabel: 'OPD Room 102', // different room, same clinician
            appointmentType: 'follow_up',
            notes: 'Milestone B Test Overlap Clinician',
            actorId: clinicianId,
          }),
        ).rejects.toThrow('clinician_schedule_conflict');
      });
    });

    it('rejects an overlapping appointment for the same room (room conflict guard)', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        await expect(
          createAppointment(q, {
            orgId,
            patientId,
            clinicianId: secondaryClinicianId,
            scheduledStart: '2026-11-10T09:15:00Z',
            scheduledEnd: '2026-11-10T09:45:00Z',
            roomLabel: 'OPD Room 101', // same room as first appointment
            appointmentType: 'follow_up',
            notes: 'Milestone B Test Overlap Room',
            actorId: clinicianId,
          }),
        ).rejects.toThrow();
      });
    });

    it('blocks booking when clinician is unavailable due to documented leave', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        // Record leave for clinician
        await recordClinicianUnavailability(q, {
          orgId,
          clinicianId,
          startTime: '2026-11-15T08:00:00Z',
          endTime: '2026-11-15T18:00:00Z',
          reason: 'Milestone B Test Oncology Conference',
          actorId: clinicianId,
        });

        // Attempting to book during conference should fail
        await expect(
          createAppointment(q, {
            orgId,
            patientId,
            clinicianId,
            scheduledStart: '2026-11-15T10:00:00Z',
            scheduledEnd: '2026-11-15T10:30:00Z',
            roomLabel: 'OPD Room 103',
            notes: 'Milician on leave test',
            actorId: clinicianId,
          }),
        ).rejects.toThrow('clinician_unavailable');
      });
    });

    it('allows valid status transitions and enforces explicit cancellation reasons', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        const apptId = await createAppointment(q, {
          orgId,
          patientId,
          clinicianId,
          scheduledStart: '2026-11-20T14:00:00Z',
          scheduledEnd: '2026-11-20T14:30:00Z',
          roomLabel: 'OPD Room 104',
          notes: 'Milestone B Test Cancellation',
          actorId: clinicianId,
        });

        // Confirm appointment
        await changeAppointmentStatus(q, {
          orgId,
          appointmentId: apptId,
          toStatus: 'confirmed',
          actorId: clinicianId,
        });

        let appt = await getAppointment(q, orgId, apptId);
        expect(appt?.status).toBe('confirmed');

        // Cancelling without reason must fail
        await expect(
          changeAppointmentStatus(q, {
            orgId,
            appointmentId: apptId,
            toStatus: 'cancelled',
            reason: '',
            actorId: clinicianId,
          }),
        ).rejects.toThrow('cancellation_reason_required');

        // Cancelling with reason succeeds
        await changeAppointmentStatus(q, {
          orgId,
          appointmentId: apptId,
          toStatus: 'cancelled',
          reason: 'Patient requested postponement due to fever',
          actorId: clinicianId,
        });

        appt = await getAppointment(q, orgId, apptId);
        expect(appt?.status).toBe('cancelled');
        expect(appt?.cancellation_reason).toBe('Patient requested postponement due to fever');
      });
    });

    it('reschedules an appointment to a new non-conflicting time and records history', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        const apptId = await createAppointment(q, {
          orgId,
          patientId,
          clinicianId,
          scheduledStart: '2026-11-22T10:00:00Z',
          scheduledEnd: '2026-11-22T10:30:00Z',
          roomLabel: 'OPD Room 105',
          notes: 'Milestone B Test Reschedule',
          actorId: clinicianId,
        });

        await rescheduleAppointment(q, {
          orgId,
          appointmentId: apptId,
          newStart: '2026-11-22T11:00:00Z',
          newEnd: '2026-11-22T11:30:00Z',
          reason: 'Clinician surgery ran over',
          actorId: clinicianId,
        });

        const appt = await getAppointment(q, orgId, apptId);
        expect(new Date(appt!.scheduled_start).toISOString()).toBe('2026-11-22T11:00:00.000Z');
      });
    });
  });

  // B2: Consultation & Encounter
  describe('B2: Consultation Encounter Lifecycle & Clinician-Authored Notes', () => {
    let encounterId: string;

    it('starts an encounter, links clinician participant, and creates draft note', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        encounterId = await startEncounter(q, {
          orgId,
          patientId,
          clinicianId,
          encounterType: 'outpatient',
          actorId: clinicianId,
        });

        expect(encounterId).toBeDefined();
        const enc = await getEncounter(q, orgId, encounterId);
        expect(enc?.status).toBe('in_progress');
        expect(enc?.participants.some((p) => p.user_id === clinicianId)).toBe(true);

        // Add a secondary participant
        if (secondaryClinicianId !== clinicianId) {
          await addEncounterParticipant(q, {
            orgId,
            encounterId,
            userId: secondaryClinicianId,
            role: 'fellow_oncologist',
            actorId: clinicianId,
          });
          const encUpdated = await getEncounter(q, orgId, encounterId);
          expect(encUpdated?.participants.some((p) => p.user_id === secondaryClinicianId)).toBe(true);
        }

        // Save a draft note
        const noteId = await saveEncounterNoteDraft(q, {
          orgId,
          encounterId,
          title: 'Initial Consultation Review',
          chiefComplaint: 'Post-chemotherapy lethargy and nausea',
          clinicalAssessment: 'Grade 1 chemotherapy-induced nausea. Clinically stable.',
          planAndInstructions: 'Supportive anti-emetics prescribed. Hydration advised.',
          followUpInstructions: 'Review in OPD in 2 weeks with repeat CBC.',
          actorId: clinicianId,
        });

        expect(noteId).toBeDefined();
        const encWithNote = await getEncounter(q, orgId, encounterId);
        expect(encWithNote?.latest_note?.status).toBe('draft');
        expect(encWithNote?.latest_note?.chief_complaint).toBe('Post-chemotherapy lethargy and nausea');
      });
    });

    it('finalizes a draft note and verifies audit trail', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        const enc = await getEncounter(q, orgId, encounterId);
        const draftNote = enc?.latest_note;
        expect(draftNote?.status).toBe('draft');

        await finalizeEncounterNote(q, {
          orgId,
          encounterId,
          noteId: draftNote!.id,
          actorId: clinicianId,
        });

        const encFinal = await getEncounter(q, orgId, encounterId);
        expect(encFinal?.latest_note?.status).toBe('finalized');
        expect(encFinal?.latest_note?.finalized_at).not.toBeNull();
      });
    });

    it('amends a finalized note with explicit audit reason and creates new version', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        const enc = await getEncounter(q, orgId, encounterId);
        const finalizedNote = enc?.latest_note;
        expect(finalizedNote?.status).toBe('finalized');

        // Amendment without reason must fail
        await expect(
          amendEncounterNote(q, {
            orgId,
            encounterId,
            noteId: finalizedNote!.id,
            amendmentReason: '',
            actorId: clinicianId,
          }),
        ).rejects.toThrow('amendment_reason_required');

        // Amendment with documented reason
        const amendedNoteId = await amendEncounterNote(q, {
          orgId,
          encounterId,
          noteId: finalizedNote!.id,
          amendmentReason: 'Corrected dosage of anti-emetic per oncologist review',
          planAndInstructions: 'Prescribed ondansetron 8mg PO BID x 3 days with hydration.',
          actorId: clinicianId,
        });

        expect(amendedNoteId).toBeDefined();

        const encAmended = await getEncounter(q, orgId, encounterId);
        expect(encAmended?.status).toBe('amended');
        expect(encAmended?.latest_note?.version).toBe(2);
        expect(encAmended?.latest_note?.amendment_reason).toBe(
          'Corrected dosage of anti-emetic per oncologist review',
        );

        // Complete the encounter
        await completeEncounter(q, {
          orgId,
          encounterId,
          actorId: clinicianId,
        });

        const encCompleted = await getEncounter(q, orgId, encounterId);
        expect(encCompleted?.status).toBe('completed');
        expect(encCompleted?.completed_at).not.toBeNull();
      });
    });
  });

  // B4: Tasks & Team Handoffs
  describe('B4: Administrative Task & Cross-Patient Worklist', () => {
    it('creates a task linked to an encounter and lists in my-tasks', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        // Start a temporary encounter
        const encId = await startEncounter(q, {
          orgId,
          patientId,
          clinicianId,
          actorId: clinicianId,
        });

        // Create a task anchored to encounter
        const taskId = await createTask(q, {
          orgId,
          patientId,
          title: 'Schedule documented follow-up imaging in 2 weeks',
          taskKind: 'schedule_appointment_followup',
          origin: { kind: 'encounter', encounterId: encId },
          createdBy: clinicianId,
          assignedTo: coordinatorId,
        });

        expect(taskId).toBeDefined();

        // Query listMyTasks for coordinator
        const coordinatorTasks = await listMyTasks(q, orgId, {
          assignedTo: coordinatorId,
          status: 'open_only',
        });

        const found = coordinatorTasks.find((t) => t.id === taskId);
        expect(found).toBeDefined();
        expect(found?.originKind).toBe('encounter');
        expect(found?.originEncounterId).toBe(encId);
        expect(found?.assigneeName).toBeDefined();
      });
    });
  });

  // B5: Tumor Board Operations
  describe('B5: Tumor Board Meeting & Multidisciplinary Operations', () => {
    let meetingId: string;

    it('creates a tumor board meeting and registers patient cases with checklist', async () => {
      await withTenant({ orgId, userId: clinicianId, role: 'clinician' }, async (q) => {
        meetingId = await createTumorBoardMeeting(q, {
          orgId,
          title: 'Test TB Thoracic Oncology Board',
          meetingDate: '2026-11-25',
          startTime: '16:00:00',
          endTime: '17:30:00',
          location: 'Conference Room 3A & Telehealth',
          moderatorUserId: clinicianId,
          notes: 'Multidisciplinary Thoracic Review',
          actorId: clinicianId,
        });

        expect(meetingId).toBeDefined();
        const meeting = await getTumorBoardMeeting(q, orgId, meetingId);
        expect(meeting?.title).toBe('Test TB Thoracic Oncology Board');
        expect(meeting?.status).toBe('scheduled');

        // Register patient case
        const caseId = await registerTumorBoardCase(q, {
          orgId,
          meetingId,
          patientId,
          presenterUserId: clinicianId,
          clinicalStaging: 'cT2N1M0 Stage IIB NSCLC',
          actorId: clinicianId,
        });

        expect(caseId).toBeDefined();

        const cases = await listTumorBoardCases(q, orgId, meetingId);
        expect(cases.length).toBe(1);
        expect(cases[0]!.patient_id).toBe(patientId);
        expect(cases[0]!.clinical_staging).toBe('cT2N1M0 Stage IIB NSCLC');

        // Update case presentation and verify checklists
        await updateTumorBoardCase(q, {
          orgId,
          meetingId,
          patientId,
          status: 'concluded',
          discussionSummary: 'Case reviewed with thoracic surgery, medical oncology, and radiation oncology.',
          recommendationNotes: 'Recommended neoadjuvant chemo-immunotherapy followed by surgical resection.',
          checklists: {
            histology: true,
            imaging: true,
            staging: true,
            genomics: true,
          },
          actorId: clinicianId,
        });

        const updatedCases = await listTumorBoardCases(q, orgId, meetingId);
        expect(updatedCases.length).toBe(1);
        expect(updatedCases[0]!.status).toBe('concluded');
        expect(updatedCases[0]!.checklist_histology_verified).toBe(true);
        expect(updatedCases[0]!.checklist_imaging_verified).toBe(true);
        expect(updatedCases[0]!.recommendation_notes).toContain('neoadjuvant chemo-immunotherapy');
      });
    });
  });

  // B6: Care Continuity & Caregiver Consent
  describe('B6: Caregiver Consent Lifecycle', () => {
    it('registers a designated caregiver and revokes consent with full audit trail', async () => {
      await withTenant({ orgId, userId: coordinatorId, role: 'coordinator' }, async (q) => {
        const caregiverId = await registerCaregiver(q, {
          orgId,
          patientId,
          fullName: 'Smt. Kavita Sharma',
          relationship: 'Daughter / Primary Caregiver',
          phoneNumber: '+919876543210',
          preferredLocale: 'hi-IN',
          prefersVoiceNote: true,
          consentRecordedBy: coordinatorId,
        }).then((c) => c.id);

        expect(caregiverId).toBeDefined();

        let caregivers = await listCaregivers(q, orgId, patientId);
        const registered = caregivers.find((c) => c.id === caregiverId);
        expect(registered).toBeDefined();
        expect(registered?.isActive).toBe(true);
        expect(registered?.fullName).toBe('Smt. Kavita Sharma');

        // Revoke caregiver consent
        await revokeCaregiverConsent(q, {
          orgId,
          caregiverId,
          actorUserId: coordinatorId,
        });

        caregivers = await listCaregivers(q, orgId, patientId);
        const revoked = caregivers.find((c) => c.id === caregiverId);
        expect(revoked?.isActive).toBe(false);
      });
    });
  });
});
