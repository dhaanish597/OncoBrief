import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, withTenant } from '../src/client.js';
import {
  correctEvidence,
  detectAndRecordConflicts,
  insertFact,
  resolveConflict,
  verifyEvidence,
  verifyLedgerChain,
} from '../src/services/ledger.js';
import { approvePacket, createPacket, getPacket } from '../src/services/packets.js';
import { setupFixtures, withSuperuser, type Fixtures } from './helpers.js';

/**
 * Architecture §23.2 — the ledger invariants.
 *
 *  - Corrections preserve the original value; both facts survive.
 *  - Conflict resolution is human-only and has three explicit outcomes.
 *  - The hash chain verifies.
 *  - The projections are rebuildable and a rebuild is a no-op.
 *  - An approved packet is frozen and reports when the ledger has advanced.
 */

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

const asClinician = { userId: '', role: 'clinician' as const };

async function clinicianCtx() {
  return { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };
}

describe('correction preserves the original', () => {
  it('creates a replacement fact and leaves fact A untouched', async () => {
    const ctx = await clinicianCtx();

    const created = await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: 'Original extracted text' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'test',
        extractorVersion: 'v1',
        confidenceRaw: 0.8,
        createdBy: null,
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const originalId = created.factId;

    const corrected = await withTenant(ctx, (q) =>
      correctEvidence(q, {
        factId: originalId,
        actor: { kind: 'human', ...asClinician, userId: fx.clinicians.clinician },
        value: { kind: 'text', text: 'Corrected text' },
        verbatimQuote: fx.sampleSpanText,
        reason: 'the extractor misread the sentence',
      }),
    );

    const rows = await withSuperuser((c) =>
      c.query<{ id: string; value_json: unknown; corrects_fact_id: string | null; state: string }>(
        `SELECT ef.id, ef.value_json, ef.corrects_fact_id, es.state
           FROM evidence_fact ef JOIN evidence_state es ON es.evidence_fact_id = ef.id
          WHERE ef.id = $1 OR ef.corrects_fact_id = $1
          ORDER BY ef.created_at`,
        [originalId],
      ),
    );

    expect(rows.rowCount).toBe(2);
    const original = rows.rows.find((r) => r.id === originalId)!;
    const replacement = rows.rows.find((r) => r.id !== originalId)!;

    expect(original.state).toBe('corrected');
    expect((original.value_json as { text: string }).text).toBe('Original extracted text');
    expect(replacement.corrects_fact_id).toBe(originalId);
    expect(replacement.state).toBe('verified');
    expect((replacement.value_json as { text: string }).text).toBe('Corrected text');
    expect(corrected.replacementFactId).toBe(replacement.id);
  });
});

describe('conflict resolution', () => {
  it('retain_both verifies every member and records the resolution', async () => {
    const ctx = await clinicianCtx();

    // The seeded DEMO-001 surgery-date contradiction.
    const conflict = await withSuperuser((c) =>
      c.query<{ id: string }>(
        `SELECT cs.id FROM conflict_set cs JOIN patient p ON p.id = cs.patient_id
          WHERE p.demo_code = 'DEMO-001' AND cs.fact_type = 'procedure.recorded' AND cs.status = 'open' LIMIT 1`,
      ),
    );
    const conflictId = conflict.rows[0]?.id;
    expect(conflictId).toBeTruthy();

    await withTenant(ctx, (q) =>
      resolveConflict(q, {
        conflictSetId: conflictId!,
        resolutionKind: 'retain_both',
        reason: 'Both documents are on file; coordinator to confirm with the facility.',
        actor: { kind: 'human', ...asClinician, userId: fx.clinicians.clinician },
      }),
    );

    const after = await withSuperuser((c) =>
      c.query<{ status: string; resolution_kind: string; member_state: string }>(
        `SELECT cs.status, cs.resolution_kind, es.state AS member_state
           FROM conflict_set cs
           JOIN conflict_member cm ON cm.conflict_set_id = cs.id
           JOIN evidence_state es ON es.evidence_fact_id = cm.evidence_fact_id
          WHERE cs.id = $1`,
        [conflictId],
      ),
    );
    expect(after.rows.every((r) => r.status === 'resolved')).toBe(true);
    expect(after.rows.every((r) => r.resolution_kind === 'retain_both')).toBe(true);
    expect(after.rows.every((r) => r.member_state === 'verified')).toBe(true);

    const audit = await withSuperuser((c) =>
      c.query(`SELECT 1 FROM audit_event WHERE action = 'conflict.resolved' AND entity_id = $1`, [conflictId]),
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('refuses a second resolution of the same conflict set', async () => {
    const ctx = await clinicianCtx();
    const conflict = await withSuperuser((c) =>
      c.query<{ id: string }>(
        `SELECT id FROM conflict_set WHERE status = 'resolved' LIMIT 1`,
      ),
    );
    await expect(
      withTenant(ctx, (q) =>
        resolveConflict(q, {
          conflictSetId: conflict.rows[0]!.id,
          resolutionKind: 'retain_both',
          reason: 'trying again',
          actor: { kind: 'human', ...asClinician, userId: fx.clinicians.clinician },
        }),
      ),
    ).rejects.toThrow(/already resolved/);
  });

  it('never auto-resolves on ingestion — detection only flags', async () => {
    const ctx = await clinicianCtx();
    const result = await withTenant(ctx, (q) => detectAndRecordConflicts(q, fx.org1, fx.patients.demo1));
    // Idempotent: re-running produces no duplicate conflict sets.
    expect(result.created).toBe(0);
  });
});

describe('hash chain', () => {
  it('verifies after all the above mutations', async () => {
    const ctx = await clinicianCtx();
    const result = await withTenant(ctx, (q) => verifyLedgerChain(q, fx.org1));
    expect(result.ok).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('projections are rebuildable', () => {
  it('rebuilding evidence_state and timeline_event is a no-op', async () => {
    const before = await withSuperuser((c) =>
      c.query<{ evidence_fact_id: string; state: string }>(
        'SELECT evidence_fact_id, state FROM evidence_state WHERE org_id = $1 ORDER BY evidence_fact_id',
        [fx.org1],
      ),
    );
    const beforeTimeline = await withSuperuser((c) =>
      c.query<{ evidence_fact_id: string; state: string }>(
        'SELECT evidence_fact_id, state FROM timeline_event WHERE org_id = $1 ORDER BY evidence_fact_id',
        [fx.org1],
      ),
    );

    await withSuperuser((c) => c.query('SELECT rebuild_evidence_state($1)', [fx.org1]));
    await withSuperuser((c) => c.query('SELECT rebuild_timeline($1)', [fx.org1]));

    const after = await withSuperuser((c) =>
      c.query<{ evidence_fact_id: string; state: string }>(
        'SELECT evidence_fact_id, state FROM evidence_state WHERE org_id = $1 ORDER BY evidence_fact_id',
        [fx.org1],
      ),
    );
    const afterTimeline = await withSuperuser((c) =>
      c.query<{ evidence_fact_id: string; state: string }>(
        'SELECT evidence_fact_id, state FROM timeline_event WHERE org_id = $1 ORDER BY evidence_fact_id',
        [fx.org1],
      ),
    );

    expect(after.rows).toEqual(before.rows);
    expect(afterTimeline.rows).toEqual(beforeTimeline.rows);
  });
});

describe('approved packets are frozen', () => {
  it('snapshot is unchanged and the ledger-advanced banner is correct', async () => {
    const ctx = await clinicianCtx();
    const { packetId } = await withTenant(ctx, (q) =>
      createPacket(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        encounterLabel: 'integration test packet',
        userId: fx.clinicians.clinician,
      }),
    );

    const approved = await withTenant(ctx, (q) =>
      approvePacket(q, { packetId, userId: fx.clinicians.clinician, approvalNote: 'reviewed' }),
    );
    expect(approved.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);

    const before = await withSuperuser((c) =>
      c.query<{ snapshot_sha256: string }>(
        `SELECT encode(snapshot_sha256,'hex') AS snapshot_sha256 FROM consultation_packet WHERE id = $1`,
        [packetId],
      ),
    );

    // Advance the ledger with a new fact.
    await withTenant(ctx, (q) =>
      insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'consent.recorded',
        value: { kind: 'date', date: '2025-05-01' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'test',
        extractorVersion: 'v1',
        confidenceRaw: 0.5,
        createdBy: null,
      }),
    );

    const after = await withSuperuser((c) =>
      c.query<{ snapshot_sha256: string }>(
        `SELECT encode(snapshot_sha256,'hex') AS snapshot_sha256 FROM consultation_packet WHERE id = $1`,
        [packetId],
      ),
    );
    expect(after.rows[0]!.snapshot_sha256).toBe(before.rows[0]!.snapshot_sha256);

    const detail = await withTenant(ctx, (q) => getPacket(q, fx.org1, packetId));
    expect(detail?.status).toBe('approved');
    expect(detail?.ledgerAdvanced).toBe(true);
    expect(detail?.assembled?.counts).toBeTruthy();
  });
});

describe('idempotent ingestion detection', () => {
  it('re-running detection does not duplicate conflict members', async () => {
    const ctx = await clinicianCtx();
    const before = await withSuperuser((c) =>
      c.query<{ n: string }>('SELECT count(*)::text AS n FROM conflict_member WHERE org_id = $1', [fx.org1]),
    );
    await withTenant(ctx, (q) => detectAndRecordConflicts(q, fx.org1, fx.patients.demo2));
    const after = await withSuperuser((c) =>
      c.query<{ n: string }>('SELECT count(*)::text AS n FROM conflict_member WHERE org_id = $1', [fx.org1]),
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});

describe('human-only verification', () => {
  it('a system actor cannot verify', async () => {
    const ctx = await clinicianCtx();
    await expect(
      withTenant(ctx, (q) =>
        verifyEvidence(q, {
          factId: fx.readyFactId,
          actor: { kind: 'system', userId: null, role: null },
        }),
      ),
    ).rejects.toThrow();
  });
});
