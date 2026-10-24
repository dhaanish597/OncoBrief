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
  // Run seed to populate synthetic oncology fixtures
  summary = await seed();
  org1 = summary.orgs[0]!;
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Task 2.1 — Oncology Demo Data and Readiness Seed', () => {
  it('seeds DEMO-001 (Breast Oncology) with baseline, serial labs, and pending instruction', async () => {
    const c = await orgClient();
    try {
      const patientRes = await c.query<{
        id: string;
        demo_code: string;
        last_consultation_date: string | null;
      }>(
        `SELECT id, demo_code, last_consultation_date::text FROM patient WHERE org_id = $1 AND demo_code = 'DEMO-001'`,
        [org1],
      );
      expect(patientRes.rows).toHaveLength(1);
      const p1 = patientRes.rows[0]!;
      expect(p1.last_consultation_date).toBe('2025-07-05');

      const docsRes = await c.query<{ original_filename: string }>(
        `SELECT original_filename FROM document WHERE patient_id = $1 ORDER BY original_filename`,
        [p1.id],
      );
      const docNames = docsRes.rows.map((d) => d.original_filename);

      // Must have referral, pathology, surgery, serial CBCs (at least 2 on different dates), chemo, appointment
      expect(docNames).toContain('referral-letter.pdf');
      expect(docNames).toContain('histopathology-report.pdf');
      expect(docNames).toContain('discharge-summary.pdf');
      expect(docNames).toContain('cbc-report.pdf');
      expect(docNames).toContain('cbc-baseline.pdf');

      // Check serial CBC facts on different dates
      const cbcFacts = await c.query<{ observed_on: string | null; value_json: Record<string, unknown> }>(
        `SELECT observed_on::text, value_json FROM evidence_fact WHERE patient_id = $1 AND fact_type = 'lab_result.as_written' ORDER BY observed_on`,
        [p1.id],
      );
      expect(cbcFacts.rows.length).toBeGreaterThanOrEqual(2);
      const dates = new Set(cbcFacts.rows.map((r) => r.observed_on));
      expect(dates.size).toBeGreaterThanOrEqual(2);

      // Check pending / instruction fact extracted
      const instructionFacts = await c.query<{ fact_type: string; verbatim_quote: string }>(
        `SELECT fact_type, verbatim_quote FROM evidence_fact WHERE patient_id = $1 AND fact_type IN ('instruction.recorded', 'pending_investigation.recorded')`,
        [p1.id],
      );
      expect(instructionFacts.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await c.end();
    }
  });

  it('seeds DEMO-002 (Medical Oncology) with chemotherapy records, dated labs, and baseline', async () => {
    const c = await orgClient();
    try {
      const patientRes = await c.query<{
        id: string;
        demo_code: string;
        last_consultation_date: string | null;
      }>(
        `SELECT id, demo_code, last_consultation_date::text FROM patient WHERE org_id = $1 AND demo_code = 'DEMO-002'`,
        [org1],
      );
      expect(patientRes.rows).toHaveLength(1);
      const p2 = patientRes.rows[0]!;
      expect(p2.last_consultation_date).toBe('2025-06-10');

      const docsRes = await c.query<{ original_filename: string }>(
        `SELECT original_filename FROM document WHERE patient_id = $1 ORDER BY original_filename`,
        [p2.id],
      );
      const docNames = docsRes.rows.map((d) => d.original_filename);

      // Must have chemotherapy administration, dated labs, and instruction
      expect(docNames).toContain('chemotherapy-administration.pdf');
      expect(docNames).toContain('cbc-pre-chemo.pdf');

      // Chemotherapy facts present
      const chemoFacts = await c.query<{ fact_type: string; verbatim_quote: string }>(
        `SELECT fact_type, verbatim_quote FROM evidence_fact WHERE patient_id = $1 AND (fact_type = 'medication.recorded' OR fact_type = 'procedure.recorded')`,
        [p2.id],
      );
      expect(chemoFacts.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await c.end();
    }
  });

  it('seeds DEMO-003 (Radiation Oncology) with radiation completion summary, baseline, and reminder', async () => {
    const c = await orgClient();
    try {
      const patientRes = await c.query<{
        id: string;
        demo_code: string;
        last_consultation_date: string | null;
      }>(
        `SELECT id, demo_code, last_consultation_date::text FROM patient WHERE org_id = $1 AND demo_code = 'DEMO-003'`,
        [org1],
      );
      expect(patientRes.rows).toHaveLength(1);
      const p3 = patientRes.rows[0]!;
      expect(p3.last_consultation_date).toBe('2025-03-15');

      const docsRes = await c.query<{ original_filename: string }>(
        `SELECT original_filename FROM document WHERE patient_id = $1 ORDER BY original_filename`,
        [p3.id],
      );
      const docNames = docsRes.rows.map((d) => d.original_filename);
      expect(docNames).toContain('radiation-completion-summary.pdf');

      // Check approved reminder message
      const msgRes = await c.query<{ id: string; status: string }>(
        `SELECT id, status FROM patient_message WHERE patient_id = $1 AND status = 'delivered'`,
        [p3.id],
      );
      expect(msgRes.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await c.end();
    }
  });

  it('seeds the three oncology checklist templates with document readiness items', async () => {
    const c = await orgClient();
    try {
      const tplsRes = await c.query<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM checklist_template WHERE org_id = $1 ORDER BY code`,
        [org1],
      );
      const tplCodes = tplsRes.rows.map((t) => t.code);
      expect(tplCodes).toContain('ncg_oncology_intake');
      expect(tplCodes).toContain('ncg_tumor_board_prep');
      expect(tplCodes).toContain('ncg_oncology_followup');

      for (const tpl of tplsRes.rows.filter((t) => t.code.startsWith('ncg_'))) {
        const itemsRes = await c.query<{ code: string; required_document_type: string; requirement_kind: string }>(
          `SELECT code, required_document_type, requirement_kind FROM checklist_item WHERE template_id = $1 ORDER BY ordinal`,
          [tpl.id],
        );
        expect(itemsRes.rows.length).toBeGreaterThanOrEqual(3);
        for (const item of itemsRes.rows) {
          expect(['required', 'expected', 'conditional']).toContain(item.requirement_kind);
        }
      }
    } finally {
      await c.end();
    }
  });

  it('seeds oncology OPD slots and waitlist examples with valid constraints', async () => {
    const c = await orgClient();
    try {
      const slotsRes = await c.query<{ id: string; status: string; priority_tag: string; room_label: string }>(
        `SELECT id, status, priority_tag, room_label FROM opd_appointment_slot WHERE org_id = $1`,
        [org1],
      );
      expect(slotsRes.rows.length).toBeGreaterThanOrEqual(3);

      expect((await c.query("SELECT id FROM opd_appointment_slot WHERE status='checked_in' AND checked_in_at IS NULL")).rowCount).toBe(0);

      const waitlistRes = await c.query<{ id: string; status: string }>(
        `SELECT id, status FROM opd_waitlist_entry WHERE org_id = $1`,
        [org1],
      );
      expect(waitlistRes.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await c.end();
    }
  });

  it('seeds version-pinned institutional demo SOP guidelines with non-fabricated geometry', async () => {
    const c = await orgClient();
    try {
      const guideRes = await c.query<{ id: string; code: string; content_sha256: Buffer }>(
        `SELECT id, code, content_sha256 FROM guideline_document WHERE org_id = $1`,
        [org1],
      );
      expect(guideRes.rows.length).toBeGreaterThanOrEqual(1);
      for (const g of guideRes.rows) {
        expect(g.content_sha256.length).toBe(32);

        const spansRes = await c.query<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number; verbatim_text: string }>(
          `SELECT bbox_x, bbox_y, bbox_w, bbox_h, verbatim_text FROM guideline_span WHERE guideline_document_id = $1`,
          [g.id],
        );
        expect(spansRes.rows.length).toBeGreaterThanOrEqual(1);
        for (const span of spansRes.rows) {
          expect(span.bbox_x).toBeGreaterThanOrEqual(0);
          expect(span.bbox_y).toBeGreaterThanOrEqual(0);
          expect(span.bbox_x + span.bbox_w).toBeLessThanOrEqual(1);
          expect(span.bbox_y + span.bbox_h).toBeLessThanOrEqual(1);
          expect(span.verbatim_text.trim().length).toBeGreaterThan(0);
        }
      }
    } finally {
      await c.end();
    }
  });
});

