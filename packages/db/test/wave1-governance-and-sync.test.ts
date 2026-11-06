import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, withTenant } from '../src/client';
import { createAppointment, changeAppointmentStatus } from '../src/services/appointments';
import { updateOpdSlotStatus } from '../src/services/opd-flow';
import { startEncounter, saveEncounterNoteDraft } from '../src/services/encounters';
import { createTumorBoardMeeting, registerTumorBoardCase } from '../src/services/tumor-board';
import { setupFixtures, type Fixtures } from './helpers';

/**
 * Wave 1 Integration Suite (TASK-004, TASK-005, TASK-007)
 *
 * Verifies:
 *  - TASK-004: Encounter Notes and Tumor Board cases enforce non-clinical boundary
 *    guardrails (`scanForBoundaryViolation`) and anchor to verified Evidence Ledger facts.
 *  - TASK-005: `ingestNormalizedPages` executes `createDocumentIngestionWorkflowGraph`
 *    and persists `visited_nodes` and `execution_trace` on `document.ingested` audit events.
 *  - TASK-007: `createAppointment` and `changeAppointmentStatus` synchronize bidirectionally
 *    with `opd_appointment_slot` via `appointment_id`.
 */

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Wave 1 Integration: TASK-004, TASK-005 & TASK-007', () => {
  it('TASK-005: records WorkflowStateGraph visited_nodes and execution_trace on document.ingested audit events', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const res = await q.query<{
        metadata_json: {
          visited_nodes?: string[];
          execution_trace?: { nodeId: string; outcome: string }[];
          subpackets?: number;
        };
      }>(
        `SELECT metadata_json
           FROM audit_event
          WHERE org_id = $1 AND action = 'document.ingested'
          ORDER BY seq DESC
          LIMIT 1`,
        [fx.org1],
      );

      expect(res.rows[0]).toBeDefined();
      const meta = res.rows[0]!.metadata_json;
      expect(meta.visited_nodes).toEqual([
        'intake_routing_node',
        'segment_packet_node',
        'persist_spans_node',
        'classify_node',
        'extract_candidates_node',
        'two_stage_span_gate_node',
        'conflict_and_delta_node',
        'human_review_interrupt_gate',
      ]);
      expect(Array.isArray(meta.execution_trace)).toBe(true);
      expect(meta.execution_trace!.length).toBe(8);
    });
  });

  it('TASK-004: enforces clinical boundary checks and ledger provenance on Encounter Notes and Tumor Board Cases', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const encounterId = await startEncounter(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        clinicianId: fx.clinicians.clinician,
        actorId: fx.clinicians.clinician,
      });

      // Valid ledger-anchored draft
      const noteId = await saveEncounterNoteDraft(q, {
        orgId: fx.org1,
        encounterId,
        title: 'Wave 1 Governed Note',
        clinicalAssessment: 'Reviewed verified pathology and staging documentation.',
        citedFactIds: [fx.readyFactId],
        actorId: fx.clinicians.clinician,
      });
      expect(noteId).toBeDefined();

      // Rejects forbidden algorithmic clinical inference tokens
      await expect(
        saveEncounterNoteDraft(q, {
          orgId: fx.org1,
          encounterId,
          title: 'Forbidden Boundary Note',
          clinicalAssessment: 'Computed 5-year survival rate and recist_response progression.',
          actorId: fx.clinicians.clinician,
        }),
      ).rejects.toThrow(/clinical_boundary_violation/);

      const meetingId = await createTumorBoardMeeting(q, {
        orgId: fx.org1,
        title: 'Wave 1 Governed MDT',
        meetingDate: '2026-12-15',
        startTime: '15:00:00',
        endTime: '16:00:00',
        location: 'Room 2',
        actorId: fx.clinicians.clinician,
      });

      await expect(
        registerTumorBoardCase(q, {
          orgId: fx.org1,
          meetingId,
          patientId: fx.patients.demo3,
          clinicalStaging: 'trial_eligibility_score = 0.95',
          actorId: fx.clinicians.clinician,
        }),
      ).rejects.toThrow(/clinical_boundary_violation/);
    });
  });

  it('TASK-007: synchronizes appointment creation and status transitions bidirectionally with opd_appointment_slot', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const apptId = await createAppointment(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        clinicianId: fx.clinicians.clinician,
        scheduledStart: '2026-12-20T04:00:00.000Z', // 09:30 Asia/Kolkata
        scheduledEnd: '2026-12-20T04:30:00.000Z',   // 10:00 Asia/Kolkata
        roomLabel: 'Wave 1 Sync Room 101',
        actorId: fx.clinicians.clinician,
      });

      const slotRes = await q.query<{ id: string; status: string; appointment_id: string }>(
        `SELECT id, status, appointment_id
           FROM opd_appointment_slot
          WHERE org_id = $1 AND appointment_id = $2`,
        [fx.org1, apptId],
      );
      expect(slotRes.rows[0]).toBeDefined();
      expect(slotRes.rows[0]!.status).toBe('scheduled');

      // Transition appointment -> checked_in and verify OPD slot syncs
      await changeAppointmentStatus(q, {
        orgId: fx.org1,
        appointmentId: apptId,
        toStatus: 'checked_in',
        reason: 'Patient arrived at front desk',
        actorId: fx.clinicians.clinician,
      });

      const afterCheckIn = await q.query<{ status: string }>(
        `SELECT status FROM opd_appointment_slot WHERE org_id = $1 AND id = $2`,
        [fx.org1, slotRes.rows[0]!.id],
      );
      expect(afterCheckIn.rows[0]!.status).toBe('checked_in');

      // Transition OPD slot -> in_consult and verify appointment syncs to in_consultation
      await updateOpdSlotStatus(q, {
        orgId: fx.org1,
        actorId: fx.clinicians.clinician,
        slotId: slotRes.rows[0]!.id,
        requestId: 'wave1-sync-req-001',
        expectedStatus: 'checked_in',
        toStatus: 'in_consult',
      });

      const apptAfterConsult = await q.query<{ status: string }>(
        `SELECT status FROM appointment WHERE org_id = $1 AND id = $2`,
        [fx.org1, apptId],
      );
      expect(apptAfterConsult.rows[0]!.status).toBe('in_consultation');
    });
  });
});
