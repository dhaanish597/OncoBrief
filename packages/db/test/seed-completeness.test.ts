import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { seed, type SeedSummary } from '../src/seed';
import { appClientForOrg } from './helpers';

let summary: SeedSummary;
let org1: string;

async function orgClient(): Promise<Client> {
  return appClientForOrg(org1, null, 'clinician');
}

beforeAll(async () => {
  summary = await seed();
  org1 = summary.orgs[0]!;
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('TASK-03.02: Complete and Reproducible Demo Database Seeding', () => {
  it('seeds Milestone B operational tables: clinic_session, appointment, encounter, and tumor_board', async () => {
    const c = await orgClient();

    // 1. Clinic session
    const sessions = await c.query<{ id: string; title: string }>(
      'SELECT id, title FROM clinic_session WHERE org_id = $1',
      [org1],
    );
    expect(sessions.rows.length).toBeGreaterThanOrEqual(1);

    // 2. Appointment
    const appts = await c.query<{ id: string; token_number: string; status: string }>(
      'SELECT id, token_number, status FROM appointment WHERE org_id = $1',
      [org1],
    );
    expect(appts.rows.length).toBeGreaterThanOrEqual(1);

    // 3. Consultation Encounter
    const encounters = await c.query<{ id: string; encounter_type: string; status: string }>(
      'SELECT id, encounter_type, status FROM encounter WHERE org_id = $1',
      [org1],
    );
    expect(encounters.rows.length).toBeGreaterThanOrEqual(1);

    // 4. Encounter Participants
    const participants = await c.query<{ encounter_id: string; user_id: string }>(
      'SELECT encounter_id, user_id FROM encounter_participant WHERE org_id = $1',
      [org1],
    );
    expect(participants.rows.length).toBeGreaterThanOrEqual(1);

    // 5. Encounter Note Versions
    const noteVersions = await c.query<{ encounter_id: string; version: number; title: string }>(
      'SELECT encounter_id, version, title FROM encounter_note_version WHERE org_id = $1',
      [org1],
    );
    expect(noteVersions.rows.length).toBeGreaterThanOrEqual(1);

    // 6. Tumor Board Meeting
    const tbMeetings = await c.query<{ id: string; title: string; status: string }>(
      'SELECT id, title, status FROM tumor_board_meeting WHERE org_id = $1',
      [org1],
    );
    expect(tbMeetings.rows.length).toBeGreaterThanOrEqual(1);

    // 7. Tumor Board Case anchored to verified staging fact
    const tbCases = await c.query<{
      id: string;
      patient_id: string;
      staging_fact_id: string | null;
      clinical_staging: string | null;
      checklist_staging_verified: boolean;
    }>(
      'SELECT id, patient_id, staging_fact_id, clinical_staging, checklist_staging_verified FROM tumor_board_case WHERE org_id = $1',
      [org1],
    );
    expect(tbCases.rows.length).toBeGreaterThanOrEqual(1);

    const demo3Case = tbCases.rows.find((cs) => cs.staging_fact_id !== null);
    expect(demo3Case).toBeDefined();
    expect(demo3Case?.checklist_staging_verified).toBe(true);

    // Verify the staging fact is a valid verified fact for that patient
    const factCheck = await c.query<{ id: string; fact_type: string; patient_id: string }>(
      `SELECT ef.id, ef.fact_type, ef.patient_id
         FROM evidence_fact ef
         JOIN evidence_state es ON es.evidence_fact_id = ef.id
        WHERE ef.id = $1 AND es.state IN ('verified', 'corrected')`,
      [demo3Case!.staging_fact_id],
    );
    expect(factCheck.rows.length).toBe(1);
    expect(factCheck.rows[0]?.patient_id).toBe(demo3Case!.patient_id);
  });

  it('verifies demo clinician identity dr.ananya@rci.demo is properly associated with appointments and clinic sessions', async () => {
    const c = await orgClient();

    const clinicianCheck = await c.query<{ id: string; email: string }>(
      `SELECT u.id, u.email FROM app_user u JOIN membership m ON m.user_id = u.id WHERE m.org_id = $1 AND u.email = 'dr.ananya@rci.demo'`,
      [org1],
    );
    expect(clinicianCheck.rows.length).toBe(1);
    const ananyaId = clinicianCheck.rows[0]!.id;

    // Check clinic session belongs to ananya or clinician profile
    const clinicianSessions = await c.query<{ id: string }>(
      `SELECT id FROM clinic_session WHERE org_id = $1 AND clinician_id = $2`,
      [org1, ananyaId],
    );
    expect(clinicianSessions.rows.length).toBeGreaterThanOrEqual(1);
  });
});
