import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { appClientForOrg, appClientNoTenant, setupFixtures, withSuperuser, type Fixtures } from './helpers';

const TABLES = ['caregiver_contact', 'opd_appointment_slot', 'opd_waitlist_entry', 'guideline_document', 'guideline_span', 'studio_artifact'] as const;
let fx: Fixtures;
let guidelineId: string;
let spanId: string;
let artifactId: string;

async function orgClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
}

beforeAll(async () => { fx = await setupFixtures(); }, 120_000);
afterAll(async () => { await closePools(); });

describe('V4 foundation schema', () => {
  it('adds patient defaults without changing existing synthetic records', async () => {
    const c = await orgClient();
    try {
      const result = await c.query('SELECT primary_language, last_consultation_date FROM patient WHERE id=$1', [fx.patients.demo1]);
      expect(result.rows[0]?.primary_language).toBe('en-IN');
      expect(result.rows[0]?.last_consultation_date).toBeDefined();
    } finally { await c.end(); }
  });

  it('stores all six tenant-scoped entities with explicit provenance and consent', async () => {
    const c = await orgClient();
    try {
      await c.query(`INSERT INTO caregiver_contact (org_id, patient_id, full_name, relationship, phone_number, consent_recorded_by) VALUES ($1,$2,'Synthetic Caregiver','family','9000000000',$3)`, [fx.org1, fx.patients.demo1, fx.clinicians.coordinator]);
      await c.query(`INSERT INTO opd_appointment_slot (org_id, patient_id, clinic_date, slot_start_time, slot_end_time) VALUES ($1,$2,'2090-01-01','09:00','09:30')`, [fx.org1, fx.patients.demo1]);
      await c.query(`INSERT INTO opd_waitlist_entry (org_id, patient_id) VALUES ($1,$2)`, [fx.org1, fx.patients.demo1]);
      const guideline = await c.query<{ id: string }>(`INSERT INTO guideline_document (org_id,code,title,issuing_body,version_label,publication_date,content_sha256,uploaded_by) VALUES ($1,'synthetic-sop','Synthetic oncology SOP','Demo Hospital','1','2026-01-01',$2,$3) RETURNING id`, [fx.org1, Buffer.alloc(32, 1), fx.clinicians.records_officer]);
      guidelineId = guideline.rows[0]!.id;
      const span = await c.query<{ id: string }>(`INSERT INTO guideline_span (org_id,guideline_document_id,page_number,section_heading,span_index,verbatim_text,bbox_x,bbox_y,bbox_w,bbox_h) VALUES ($1,$2,1,'Intake',0,'Bring existing records',0.1,0.2,0.6,0.1) RETURNING id`, [fx.org1, guidelineId]);
      spanId = span.rows[0]!.id;
      const artifact = await c.query<{ id: string }>(`INSERT INTO studio_artifact (org_id,patient_id,artifact_kind,title,markdown_body,created_by,cited_fact_ids,cited_guideline_ids) VALUES ($1,$2,'referral_letter','Synthetic draft','Source [E1]',$3,$4,$5) RETURNING id`, [fx.org1, fx.patients.demo3, fx.clinicians.clinician, [fx.readyFactId], [guidelineId]]);
      artifactId = artifact.rows[0]!.id;
      for (const table of TABLES) expect((await c.query(`SELECT id FROM ${table}`)).rowCount).toBeGreaterThan(0);
    } finally { await c.end(); }
  });

  it('fails closed without tenant context and hides tenant-one records from tenant two', async () => {
    const anon = await appClientNoTenant();
    const other = await appClientForOrg(fx.org2, null, null);
    try {
      for (const table of TABLES) {
        expect((await anon.query(`SELECT id FROM ${table}`)).rows, table).toEqual([]);
        expect((await other.query(`SELECT id FROM ${table} WHERE org_id=$1`, [fx.org1])).rows, table).toEqual([]);
      }
      const policies = await withSuperuser((q) => q.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)', [TABLES]));
      expect(policies.rows).toHaveLength(6);
      expect(policies.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    } finally { await anon.end(); await other.end(); }
  });

  it('rejects a foreign tenant row even when the caller knows its UUID', async () => {
    const c = await orgClient();
    try {
      await expect(c.query(`INSERT INTO caregiver_contact (org_id,patient_id,full_name,relationship,phone_number,consent_recorded_by) VALUES ($1,$2,'Synthetic','family','9000000000',$3)`, [fx.org2, fx.patients.otherTenant, fx.clinicians.clinician])).rejects.toMatchObject({ code: '42501' });
    } finally { await c.end(); }
  });

  it('rejects cross-tenant patient references hidden inside an owned row', async () => {
    const c = await orgClient();
    try {
      const statements = [
        [`INSERT INTO caregiver_contact (org_id,patient_id,full_name,relationship,phone_number,consent_recorded_by) VALUES ($1,$2,'Synthetic','family','9000000000',$3)`, [fx.org1, fx.patients.otherTenant, fx.clinicians.clinician]],
        [`INSERT INTO opd_appointment_slot (org_id,patient_id,slot_start_time,slot_end_time) VALUES ($1,$2,'10:00','10:30')`, [fx.org1, fx.patients.otherTenant]],
        [`INSERT INTO opd_waitlist_entry (org_id,patient_id) VALUES ($1,$2)`, [fx.org1, fx.patients.otherTenant]],
        [`INSERT INTO studio_artifact (org_id,patient_id,artifact_kind,title,markdown_body,created_by) VALUES ($1,$2,'patient_info_sheet','Synthetic','Draft',$3)`, [fx.org1, fx.patients.otherTenant, fx.clinicians.clinician]],
      ] as const;
      for (const [sql, params] of statements) await expect(c.query(sql, [...params])).rejects.toMatchObject({ code: '23503' });
    } finally { await c.end(); }
  });

  it('rejects fabricated source links and non-member consent actors', async () => {
    const c = await orgClient();
    try {
      await expect(c.query(`INSERT INTO guideline_span (org_id,guideline_document_id,page_number,section_heading,span_index,verbatim_text,bbox_x,bbox_y,bbox_w,bbox_h) VALUES ($1,$2,1,'SOP',1,'Source',0,0,1,1)`, [fx.org2, guidelineId])).rejects.toMatchObject({ code: '42501' });
      await expect(c.query(`INSERT INTO caregiver_contact (org_id,patient_id,full_name,relationship,phone_number,consent_recorded_by) VALUES ($1,$2,'Synthetic','family','9000000000',$3)`, [fx.org1, fx.patients.demo1, randomUUID()])).rejects.toMatchObject({ code: '23503' });
      await expect(c.query(`INSERT INTO opd_waitlist_entry (org_id,patient_id,priority_source_fact_id) VALUES ($1,$2,$3)`, [fx.org1, fx.patients.demo1, fx.readyFactId])).rejects.toMatchObject({ code: '23503' });
      await expect(c.query(`UPDATE studio_artifact SET cited_fact_ids=$1 WHERE id=$2`, [[randomUUID()], artifactId])).rejects.toMatchObject({ code: '23503' });
      await expect(c.query(`UPDATE studio_artifact SET cited_guideline_ids=$1 WHERE id=$2`, [[randomUUID()], artifactId])).rejects.toMatchObject({ code: '23503' });
    } finally { await c.end(); }
  });

  it('rejects invalid slots and invented source geometry', async () => {
    const c = await orgClient();
    try {
      await expect(c.query(`INSERT INTO opd_appointment_slot (org_id,slot_start_time,slot_end_time) VALUES ($1,'10:00','09:00')`, [fx.org1])).rejects.toMatchObject({ code: '23514' });
      await expect(c.query(`INSERT INTO guideline_span (org_id,guideline_document_id,page_number,section_heading,span_index,verbatim_text,bbox_x,bbox_y,bbox_w,bbox_h) VALUES ($1,$2,1,'SOP',2,'Source',0.9,0.1,0.5,0.2)`, [fx.org1, guidelineId])).rejects.toMatchObject({ code: '23514' });
      await expect(c.query(`INSERT INTO guideline_span (org_id,guideline_document_id,page_number,section_heading,span_index,verbatim_text) VALUES ($1,$2,1,'SOP',3,'Source')`, [fx.org1, guidelineId])).rejects.toMatchObject({ code: '23502' });
    } finally { await c.end(); }
  });

  it('preserves guideline source spans even for privileged accidental writes', async () => {
    const c = await orgClient();
    try {
      await expect(c.query(`UPDATE guideline_span SET verbatim_text='changed' WHERE id=$1`, [spanId])).rejects.toMatchObject({ code: '42501' });
      await expect(c.query(`DELETE FROM guideline_document WHERE id=$1`, [guidelineId])).rejects.toMatchObject({ code: '42501' });
      await expect(withSuperuser((q) => q.query(`UPDATE guideline_span SET verbatim_text='changed' WHERE id=$1`, [spanId]))).rejects.toThrow(/append_only_table/);
    } finally { await c.end(); }
  });

  it('refuses coordinator approval even with a complete snapshot', async () => {
    const c = await orgClient();
    try {
      const draft = await c.query<{ id: string }>(`INSERT INTO studio_artifact (org_id,patient_id,artifact_kind,title,markdown_body,created_by) VALUES ($1,$2,'referral_letter','Synthetic','Draft',$3) RETURNING id`, [fx.org1, fx.patients.demo1, fx.clinicians.coordinator]);
      await expect(c.query(`UPDATE studio_artifact SET status='approved',approved_by=$1,approved_at=now(),snapshot_sha256=$2 WHERE id=$3`, [fx.clinicians.coordinator, Buffer.alloc(32, 3), draft.rows[0]!.id])).rejects.toMatchObject({ code: '42501' });
    } finally { await c.end(); }
  });

  it('requires accountable approval before freezing a studio artifact', async () => {
    const c = await orgClient();
    try {
      await expect(c.query(`UPDATE studio_artifact SET status='approved' WHERE id=$1`, [artifactId])).rejects.toMatchObject({ code: '23514' });
      await c.query(`UPDATE studio_artifact SET status='approved',approved_by=$1,approved_at=now(),snapshot_sha256=$2 WHERE id=$3`, [fx.clinicians.clinician, Buffer.alloc(32, 2), artifactId]);
      await expect(c.query(`UPDATE studio_artifact SET markdown_body='silently replaced' WHERE id=$1`, [artifactId])).rejects.toMatchObject({ code: '42501' });
      await expect(c.query(`UPDATE studio_artifact SET status='draft' WHERE id=$1`, [artifactId])).rejects.toMatchObject({ code: '42501' });
    } finally { await c.end(); }
  });

  it('keeps legacy evidence and ledger mutation barriers intact', async () => {
    const c = await orgClient();
    try {
      await expect(c.query(`UPDATE evidence_fact SET verbatim_quote='changed' WHERE id=$1`, [fx.readyFactId])).rejects.toMatchObject({ code: '42501' });
      await expect(c.query(`DELETE FROM ledger_entry WHERE evidence_fact_id=$1`, [fx.readyFactId])).rejects.toMatchObject({ code: '42501' });
      await expect(c.query(`UPDATE text_span SET text='changed' WHERE id=$1`, [fx.sampleSpanId])).rejects.toMatchObject({ code: '42501' });
    } finally { await c.end(); }
  });
});
