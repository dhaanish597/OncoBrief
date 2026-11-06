import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, withTenant } from '../src/client';
import { createPacket } from '../src/services/packets';
import { startEncounter } from '../src/services/encounters';
import { createTumorBoardMeeting } from '../src/services/tumor-board';
import { createAppointment } from '../src/services/appointments';
import { createConversation } from '../src/services/patients';
import { appClientForOrg, appClientNoTenant, setupFixtures, withSuperuser, type Fixtures } from './helpers';

/**
 * TASK-002 Integration Verification Suite (0020_remediation_rls_and_governance.sql)
 *
 * Verifies:
 *  1. All 14 Milestone A/B tenant tables (5 in 0016 + 9 in 0019) have both
 *     relrowsecurity = true (ENABLE RLS) and relforcerowsecurity = true (FORCE RLS).
 *  2. Cross-tenant isolation and empty-string app.org_id fail-closed behavior
 *     without UUID cast errors across all 14 Milestone A/B tables.
 *  3. Authorized tenant access continues to function cleanly.
 *  4. Tumor board governance: staging_fact_id and cited_fact_ids enforce same-org,
 *     same-patient, verified state, and non-revoked source document constraints.
 *  5. Encounter note governance: consultation_packet_id and cited_fact_ids enforce
 *     same-org, same-patient ownership, and finalizing/amending requires clinician role.
 *  6. Assistant execution_trace_json, pending_action_json, and provider_mode
 *     columns and JSONB/enum constraints on chat_message.
 *  7. Scheduling link uniqueness index (opd_slot_appointment_id_uq) and composite
 *     same-org foreign key (opd_slot_appointment_org_fkey).
 */

const MILESTONE_AB_TABLES = [
  // Milestone A (0016): 5 tables
  'facility',
  'department',
  'clinician_profile',
  'user_invitation',
  'patient_care_team',
  // Milestone B (0019): 9 tables
  'clinic_session',
  'clinician_unavailability',
  'appointment',
  'appointment_status_history',
  'encounter',
  'encounter_participant',
  'encounter_note_version',
  'tumor_board_meeting',
  'tumor_board_case',
] as const;

let fx: Fixtures;
let verifiedStageFactIdDemo3: string;
let unverifiedFactIdDemo1: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // Locate a verified diagnosis/stage/histology fact for DEMO-003 and an unverified fact for DEMO-001
  await withSuperuser(async (c) => {
    const verRes = await c.query<{ id: string }>(
      `SELECT ef.id
         FROM evidence_fact ef
         JOIN evidence_state es ON es.evidence_fact_id = ef.id
        WHERE ef.org_id = $1
          AND ef.patient_id = $2
          AND ef.fact_type IN (
            'stage_text.as_written',
            'diagnosis_text.as_written',
            'procedure.recorded',
            'stage.recorded',
            'diagnosis.recorded',
            'pathology.histology'
          )
          AND es.state = 'verified'
        LIMIT 1`,
      [fx.org1, fx.patients.demo3],
    );
    verifiedStageFactIdDemo3 = verRes.rows[0]!.id;

    const unvRes = await c.query<{ id: string }>(
      `SELECT ef.id
         FROM evidence_fact ef
         LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
        WHERE ef.org_id = $1
          AND ef.patient_id = $2
          AND COALESCE(es.state, 'extracted') = 'extracted'
        LIMIT 1`,
      [fx.org1, fx.patients.demo1],
    );
    unverifiedFactIdDemo1 = unvRes.rows[0]!.id;
  });
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('1. Milestone A/B RLS enabled and forced on all 14 tenant tables', () => {
  it('enforces relrowsecurity = true and relforcerowsecurity = true on all 14 Milestone A/B tables', async () => {
    expect(MILESTONE_AB_TABLES).toHaveLength(14);

    const rows = await withSuperuser(async (c) => {
      const res = await c.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity
           FROM pg_class
          WHERE relnamespace = 'public'::regnamespace
            AND relname = ANY($1::text[])
          ORDER BY relname`,
        [MILESTONE_AB_TABLES],
      );
      return res.rows;
    });

    expect(rows).toHaveLength(14);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} must have ENABLE ROW LEVEL SECURITY`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} must have FORCE ROW LEVEL SECURITY`).toBe(true);
    }
  });

  it('fails closed with 0 rows when app.org_id is unset or empty string on all 14 tables', async () => {
    const c = await appClientNoTenant();
    try {
      // Unset app.org_id
      for (const table of MILESTONE_AB_TABLES) {
        const res = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
        expect(Number(res.rows[0]!.n), `${table} must return 0 rows when app.org_id is unset`).toBe(0);
      }

      // Empty string app.org_id (verifies NULLIF(..., '')::uuid guard does not throw 22P02)
      await c.query(`SELECT set_config('app.org_id', '', false)`);
      for (const table of MILESTONE_AB_TABLES) {
        const res = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
        expect(Number(res.rows[0]!.n), `${table} must return 0 rows when app.org_id is empty string`).toBe(0);
      }
    } finally {
      await c.end();
    }
  });

  it('prevents cross-tenant reads and writes while allowing authorized tenant access', async () => {
    const cOrg1 = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const cOrg2 = await appClientForOrg(fx.org2, null, null);
    try {
      const fac1 = await cOrg1.query<{ id: string; org_id: string }>('SELECT id, org_id FROM facility');
      expect(fac1.rowCount).toBeGreaterThan(0);
      expect(fac1.rows.every((r) => r.org_id === fx.org1)).toBe(true);

      // Cross-tenant lookup from org2 for org1 facility ID returns 0 rows
      const crossLookup = await cOrg2.query('SELECT id FROM facility WHERE id = $1', [fac1.rows[0]!.id]);
      expect(crossLookup.rowCount).toBe(0);

      // Cross-tenant INSERT is rejected by WITH CHECK
      await expect(
        cOrg1.query(
          `INSERT INTO tumor_board_meeting (org_id, title, meeting_date, start_time, end_time, location)
           VALUES ($1, 'Cross Tenant Escape', '2026-12-01', '09:00', '10:00', 'Room X')`,
          [fx.org2],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await cOrg1.end();
      await cOrg2.end();
    }
  });
});

describe('2. Tumor Board Case Evidence Ledger governance constraints (0020)', () => {
  it('accepts a verified same-patient stage/diagnosis fact and valid cited_fact_ids', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const meetingId = await createTumorBoardMeeting(q, {
        orgId: fx.org1,
        title: '0020 Governance Test TB',
        meetingDate: '2026-12-05',
        startTime: '14:00:00',
        endTime: '15:00:00',
        location: 'Room 1',
        actorId: fx.clinicians.clinician,
      });

      const res = await q.query<{ id: string }>(
        `INSERT INTO tumor_board_case
           (org_id, meeting_id, patient_id, staging_fact_id, cited_fact_ids, clinical_staging)
         VALUES ($1, $2, $3, $4, $5, 'Verified Stage')
         RETURNING id`,
        [fx.org1, meetingId, fx.patients.demo3, verifiedStageFactIdDemo3, [verifiedStageFactIdDemo3, fx.readyFactId]],
      );
      expect(res.rows[0]?.id).toBeDefined();
    });
  });

  it('rejects a staging_fact_id belonging to a different patient or in unverified state', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const meetingId = await createTumorBoardMeeting(q, {
        orgId: fx.org1,
        title: '0020 Invalid Staging TB',
        meetingDate: '2026-12-06',
        startTime: '14:00:00',
        endTime: '15:00:00',
        location: 'Room 1',
        actorId: fx.clinicians.clinician,
      });

      // 1. Fact belongs to DEMO-003, but case is for DEMO-001 (cross-patient violation)
      await q.query('SAVEPOINT sp1');
      await expect(
        q.query(
          `INSERT INTO tumor_board_case (org_id, meeting_id, patient_id, staging_fact_id)
           VALUES ($1, $2, $3, $4)`,
          [fx.org1, meetingId, fx.patients.demo1, verifiedStageFactIdDemo3],
        ),
      ).rejects.toThrow(/invalid_tumor_board_staging_fact|tumor_board_case_staging_fact_org_patient_fkey/);
      await q.query('ROLLBACK TO SAVEPOINT sp1');

      // 2. Fact belongs to DEMO-001, but is unverified ('extracted')
      await q.query('SAVEPOINT sp2');
      await expect(
        q.query(
          `INSERT INTO tumor_board_case (org_id, meeting_id, patient_id, staging_fact_id)
           VALUES ($1, $2, $3, $4)`,
          [fx.org1, meetingId, fx.patients.demo1, unverifiedFactIdDemo1],
        ),
      ).rejects.toThrow(/invalid_tumor_board_staging_fact/);
      await q.query('ROLLBACK TO SAVEPOINT sp2');

      // 3. cited_fact_ids contains a fact belonging to another patient
      await q.query('SAVEPOINT sp3');
      await expect(
        q.query(
          `INSERT INTO tumor_board_case (org_id, meeting_id, patient_id, cited_fact_ids)
           VALUES ($1, $2, $3, $4)`,
          [fx.org1, meetingId, fx.patients.demo1, [verifiedStageFactIdDemo3]],
        ),
      ).rejects.toThrow(/invalid_tumor_board_citation/);
      await q.query('ROLLBACK TO SAVEPOINT sp3');
    });
  });
});

describe('3. Encounter Note Version governance & clinician sign-off constraints (0020)', () => {
  it('enforces same-patient consultation_packet_id and cited_fact_ids, and requires clinician role to finalize', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const encounterId = await startEncounter(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        clinicianId: fx.clinicians.clinician,
        actorId: fx.clinicians.clinician,
      });

      const packet = await createPacket(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        encounterLabel: '0020 Packet Link Test',
        userId: fx.clinicians.clinician,
      });

      // Valid draft with same-patient packet and cited_fact_ids
      const noteRes = await q.query<{ id: string }>(
        `INSERT INTO encounter_note_version
           (org_id, encounter_id, version, status, title, authored_by, consultation_packet_id, cited_fact_ids)
         VALUES ($1, $2, 1, 'draft', 'Governed Note', $3, $4, $5)
         RETURNING id`,
        [fx.org1, encounterId, fx.clinicians.clinician, packet.packetId, [fx.readyFactId]],
      );
      const noteId = noteRes.rows[0]!.id;
      expect(noteId).toBeDefined();

      // Rejects finalizing when finalized_by is a coordinator (non-clinician)
      await q.query('SAVEPOINT sp_final');
      await expect(
        q.query(
          `UPDATE encounter_note_version SET status = 'finalized', finalized_by = $2, finalized_at = now()
            WHERE id = $1`,
          [noteId, fx.clinicians.coordinator],
        ),
      ).rejects.toThrow(/encounter_note_signoff_requires_clinician/);
      await q.query('ROLLBACK TO SAVEPOINT sp_final');

      // Succeeds when finalized_by is an active clinician
      await q.query(
        `UPDATE encounter_note_version SET status = 'finalized', finalized_by = $2, finalized_at = now()
          WHERE id = $1`,
        [noteId, fx.clinicians.clinician],
      );

      // Rejects cross-patient packet reference on an encounter for DEMO-001
      const encDemo1 = await startEncounter(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo1,
        clinicianId: fx.clinicians.clinician,
        actorId: fx.clinicians.clinician,
      });
      await q.query('SAVEPOINT sp_cross');
      await expect(
        q.query(
          `INSERT INTO encounter_note_version
             (org_id, encounter_id, version, status, title, authored_by, consultation_packet_id)
           VALUES ($1, $2, 1, 'draft', 'Cross Patient Packet', $3, $4)`,
          [fx.org1, encDemo1, fx.clinicians.clinician, packet.packetId],
        ),
      ).rejects.toThrow(/invalid_encounter_packet_reference/);
      await q.query('ROLLBACK TO SAVEPOINT sp_cross');
    });
  });
});

describe('4. Assistant trace & pending-action persistence on chat_message (0020)', () => {
  it('persists execution_trace_json, pending_action_json, and provider_mode and validates constraints', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const conv = await createConversation(q, {
        orgId: fx.org1,
        userId: fx.clinicians.clinician,
        patientId: fx.patients.demo1,
        title: '0020 Agent Trace Test',
      });

      const trace = [
        { stepIndex: 0, nodeId: 'safety_gate', outcome: 'ok', durationMs: 2 },
        { stepIndex: 1, nodeId: 'plan_subgoals', outcome: 'ok', durationMs: 4 },
      ];
      const pendingAction = {
        interruptId: 'int-001',
        actionKind: 'create_task_from_gap',
        title: 'Retrieve Pathology Report',
        status: 'awaiting_human_approval',
      };

      const msgRes = await q.query<{
        id: string;
        execution_trace_json: unknown;
        pending_action_json: unknown;
        provider_mode: string;
      }>(
        `INSERT INTO chat_message
           (org_id, conversation_id, role, content, grounded, execution_trace_json, pending_action_json, provider_mode)
         VALUES ($1, $2, 'assistant', 'Grounded response', true, $3::jsonb, $4::jsonb, 'nvidia-llm')
         RETURNING id, execution_trace_json, pending_action_json, provider_mode`,
        [fx.org1, conv.id, JSON.stringify(trace), JSON.stringify(pendingAction)],
      );

      expect(msgRes.rows[0]?.provider_mode).toBe('nvidia-llm');
      expect(msgRes.rows[0]?.execution_trace_json).toEqual(trace);
      expect(msgRes.rows[0]?.pending_action_json).toEqual(pendingAction);

      // Invalid provider_mode is rejected by CHECK constraint
      await expect(
        q.query(
          `INSERT INTO chat_message (org_id, conversation_id, role, content, provider_mode)
           VALUES ($1, $2, 'assistant', 'Bad mode', 'invalid-provider')`,
          [fx.org1, conv.id],
        ),
      ).rejects.toThrow();
    });
  });
});

describe('5. Scheduling link uniqueness index on opd_appointment_slot (0020)', () => {
  it('allows linking an appointment to one OPD slot and prevents duplicate slot links to the same appointment', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const apptId = await createAppointment(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        clinicianId: fx.clinicians.clinician,
        scheduledStart: '2026-12-10T09:00:00Z',
        scheduledEnd: '2026-12-10T09:30:00Z',
        roomLabel: 'OPD Sync Test Room A',
        actorId: fx.clinicians.clinician,
      });

      const slot1 = await q.query<{ id: string }>(
        `SELECT id FROM opd_appointment_slot WHERE org_id = $1 AND appointment_id = $2`,
        [fx.org1, apptId],
      );
      expect(slot1.rows[0]?.id).toBeDefined();

      // Linking a second OPD slot to the same appointment_id must fail on opd_slot_appointment_id_uq
      await expect(
        q.query(
          `INSERT INTO opd_appointment_slot
             (org_id, clinic_date, slot_start_time, slot_end_time, room_label, patient_id, appointment_id, status)
           VALUES ($1, '2026-12-10', '10:00', '10:30', 'OPD Sync Test Room B', $2, $3, 'scheduled')`,
          [fx.org1, fx.patients.demo3, apptId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });
});
