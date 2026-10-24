import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools, getMigratorPool } from '../src/client';
import { seed, type SeedSummary } from '../src/seed';
import { appClientForOrg } from './helpers';
import { verifyEvidenceBatch, BatchVerificationError } from '../src/services/ledger';

let summary: SeedSummary;
let org1: string;
let clinicianId: string;
let p1: string;
let p3: string;

async function orgClient(): Promise<Client> {
  return appClientForOrg(org1, clinicianId, 'clinician');
}

beforeAll(async () => {
  summary = await seed();
  org1 = summary.orgs[0]!;
  p1 = summary.patients[0]!;
  p3 = summary.patients[2]!;
  const clinCred = summary.credentials.find((c) => c.role === 'clinician')!;
  const pool = getMigratorPool();
  const userRes = await pool.query<{ id: string }>(
    `SELECT id FROM app_user WHERE email = $1`,
    [clinCred.email],
  );
  clinicianId = userRes.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Task 2.2 — Batch Evidence Verification', () => {
  it('verifies eligible high-confidence facts atomically with individual ledger entries and audit event', async () => {
    const c = await orgClient();
    try {
      // Find extracted facts with confidence_raw >= 0.90 or confidence_band = 'high' that are NOT in conflict
      const candidateFacts = await c.query<{ id: string }>(
        `SELECT ef.id FROM evidence_fact ef
          LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
          LEFT JOIN conflict_member cm ON cm.evidence_fact_id = ef.id
          LEFT JOIN conflict_set cs ON cs.id = cm.conflict_set_id AND cs.status = 'open'
         WHERE ef.patient_id = $1
           AND coalesce(es.state, 'extracted') = 'extracted'
           AND (ef.confidence_raw >= 0.90 OR ef.confidence_band = 'high')
           AND cs.id IS NULL
         LIMIT 2`,
        [p1],
      );

      expect(candidateFacts.rows.length).toBe(2);
      const factIds = candidateFacts.rows.map((r) => r.id);

      const result = await verifyEvidenceBatch(c, {
        orgId: org1,
        patientId: p1,
        factIds,
        actor: { kind: 'human', userId: clinicianId, role: 'clinician' },
        reason: 'Clinician confirmed batch in review modal',
      });

      expect(result.verifiedFactIds).toEqual(factIds);
      expect(result.count).toBe(2);

      // Verify each fact state is now 'verified'
      const states = await c.query<{ state: string }>(
        `SELECT state FROM evidence_state WHERE evidence_fact_id = ANY($1::uuid[])`,
        [factIds],
      );
      expect(states.rows.every((r) => r.state === 'verified')).toBe(true);

      // Verify individual ledger entries exist for each fact
      const ledgerEntries = await c.query<{ evidence_fact_id: string; action: string }>(
        `SELECT evidence_fact_id, action FROM ledger_entry WHERE evidence_fact_id = ANY($1::uuid[]) AND action = 'fact_verified'`,
        [factIds],
      );
      expect(ledgerEntries.rows).toHaveLength(2);

      // Verify batch audit event was recorded
      const audit = await c.query<{ action: string; metadata_json: Record<string, unknown> }>(
        `SELECT action, metadata_json FROM audit_event WHERE org_id = $1 AND action = 'evidence.batch_verified' ORDER BY occurred_at DESC LIMIT 1`,
        [org1],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.action).toBe('evidence.batch_verified');
    } finally {
      await c.end();
    }
  });

  it('rejects batch if any fact has low confidence (< 0.90)', async () => {
    const c = await orgClient();
    try {
      // Create a low confidence extracted fact
      const insertRes = await c.query<{ id: string }>(
        `INSERT INTO evidence_fact
           (org_id, patient_id, fact_type, slot_key, value_json, value_normalized, verbatim_quote,
            document_id, extractor_kind, extractor_name, extractor_version, confidence_band, confidence_raw)
         SELECT org_id, patient_id, fact_type, 'temp:low_conf', value_json, value_normalized, verbatim_quote,
                document_id, extractor_kind, extractor_name, extractor_version, 'low', 0.65
           FROM evidence_fact WHERE patient_id = $1 LIMIT 1
         RETURNING id`,
        [p1],
      );
      const lowConfFactId = insertRes.rows[0]!.id;

      await expect(
        verifyEvidenceBatch(c, {
          orgId: org1,
          patientId: p1,
          factIds: [lowConfFactId],
          actor: { kind: 'human', userId: clinicianId, role: 'clinician' },
        }),
      ).rejects.toThrow(BatchVerificationError);
    } finally {
      await c.end();
    }
  });

  it('rejects batch and preserves atomicity if any fact is in an open conflict', async () => {
    const c = await orgClient();
    try {
      // Find a conflicting fact from DEMO-001
      const conflictFact = await c.query<{ id: string }>(
        `SELECT ef.id FROM evidence_fact ef
          JOIN conflict_member cm ON cm.evidence_fact_id = ef.id
          JOIN conflict_set cs ON cs.id = cm.conflict_set_id AND cs.status = 'open'
         WHERE ef.patient_id = $1 LIMIT 1`,
        [p1],
      );
      expect(conflictFact.rows.length).toBe(1);
      const conflictFactId = conflictFact.rows[0]!.id;

      // Find an eligible fact
      const eligibleFact = await c.query<{ id: string }>(
        `SELECT ef.id FROM evidence_fact ef
          LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
          LEFT JOIN conflict_member cm ON cm.evidence_fact_id = ef.id
          LEFT JOIN conflict_set cs ON cs.id = cm.conflict_set_id AND cs.status = 'open'
         WHERE ef.patient_id = $1
           AND coalesce(es.state, 'extracted') = 'extracted'
           AND (ef.confidence_raw >= 0.90 OR ef.confidence_band = 'high')
           AND cs.id IS NULL
         LIMIT 1`,
        [p1],
      );
      expect(eligibleFact.rows.length).toBe(1);
      const eligibleFactId = eligibleFact.rows[0]!.id;

      // Attempt to batch-verify [eligibleFactId, conflictFactId]
      await expect(
        verifyEvidenceBatch(c, {
          orgId: org1,
          patientId: p1,
          factIds: [eligibleFactId, conflictFactId],
          actor: { kind: 'human', userId: clinicianId, role: 'clinician' },
        }),
      ).rejects.toThrow(BatchVerificationError);

      // Verify eligibleFactId was NOT verified (atomicity preserved)
      const state = await c.query<{ state: string }>(
        `SELECT state FROM evidence_state WHERE evidence_fact_id = $1`,
        [eligibleFactId],
      );
      expect(state.rows[0]?.state ?? 'extracted').toBe('extracted');
    } finally {
      await c.end();
    }
  });

  it('rejects batch if fact belongs to a different patient or tenant', async () => {
    const c = await orgClient();
    try {
      // Fact from p3
      const p3Fact = await c.query<{ id: string }>(
        `SELECT id FROM evidence_fact WHERE patient_id = $1 LIMIT 1`,
        [p3],
      );
      expect(p3Fact.rows.length).toBe(1);

      await expect(
        verifyEvidenceBatch(c, {
          orgId: org1,
          patientId: p1, // caller says p1, but fact is for p3
          factIds: [p3Fact.rows[0]!.id],
          actor: { kind: 'human', userId: clinicianId, role: 'clinician' },
        }),
      ).rejects.toThrow(BatchVerificationError);
    } finally {
      await c.end();
    }
  });
});
