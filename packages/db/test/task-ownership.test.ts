import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, getMigratorPool, withTenant } from '../src/client';
import { setupFixtures, type Fixtures } from './helpers';
import {
  assignTask,
  createTask,
  createInstructionTask,
  listTaskOwnership,
} from '../src/services/tasks';
import { insertFact, verifyEvidence } from '../src/services/ledger';
import { listTasks } from '../src/services/patients';
import { waiveGap } from '../src/services/twin';
let f: Fixtures;
beforeAll(async () => {
  f = await setupFixtures();
}, 120_000);
afterAll(closePools);
const run = <T>(
  role: 'coordinator' | 'records_officer' | 'auditor',
  fn: Parameters<typeof withTenant<T>>[1],
) => withTenant({ orgId: f.org1, userId: f.clinicians[role], role }, fn);
async function task() {
  return run('coordinator', (q) =>
    createTask(q, {
      orgId: f.org1,
      patientId: f.patients.demo3,
      title: 'Retrieve documented records',
      taskKind: 'retrieve_document',
      origin: { kind: 'document', documentId: f.sampleDocumentId },
      createdBy: f.clinicians.coordinator,
    }),
  );
}
describe('Phase 3 source task ownership', () => {
  it('rejects an auditor mutation at the service boundary', async () => {
    const id = await task();
    await expect(
      run('auditor', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: f.clinicians.coordinator,
          actorId: f.clinicians.auditor,
        }),
      ),
    ).rejects.toThrow('forbidden');
  });
  it('rejects a forged actor', async () => {
    const id = await task();
    await expect(
      run('coordinator', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: f.clinicians.coordinator,
          actorId: f.clinicians.records_officer,
        }),
      ),
    ).rejects.toThrow('forbidden');
  });
  it('rejects a non-member assignee atomically', async () => {
    const id = await task();
    await expect(
      run('coordinator', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: f.patients.otherTenant,
          actorId: f.clinicians.coordinator,
        }),
      ),
    ).rejects.toThrow('invalid_assignee');
  });
  it('assigns and audits reassignment with real ownership', async () => {
    const id = await task();
    await run('coordinator', (q) =>
      assignTask(q, {
        taskId: id,
        assigneeId: f.clinicians.coordinator,
        actorId: f.clinicians.coordinator,
      }),
    );
    await run('coordinator', (q) =>
      assignTask(q, {
        taskId: id,
        assigneeId: f.clinicians.records_officer,
        actorId: f.clinicians.coordinator,
      }),
    );
    const row = await run('coordinator', (q) =>
      q.query('SELECT assigned_to,status FROM admin_task WHERE id=$1', [id]),
    );
    expect(row.rows[0]).toMatchObject({
      assigned_to: f.clinicians.records_officer,
      status: 'assigned',
    });
    const events = await run('coordinator', (q) =>
      q.query(
        "SELECT metadata_json FROM audit_event WHERE entity_id=$1 AND action='task.assigned'",
        [id],
      ),
    );
    expect(events.rows).toHaveLength(2);
    expect(events.rows[1]!.metadata_json).toHaveProperty('previous_assignee_id');
  });
  it('rejects impossible task due dates', async () => {
    await expect(
      run('coordinator', (q) =>
        createTask(q, {
          orgId: f.org1,
          patientId: f.patients.demo3,
          title: 'Retrieve',
          taskKind: 'retrieve_document',
          dueOn: '2026-02-30',
          origin: { kind: 'document', documentId: f.sampleDocumentId },
          createdBy: f.clinicians.coordinator,
        }),
      ),
    ).rejects.toThrow('invalid_due_date');
  });
  it('rejects an empty waiver reason before mutation', async () => {
    const gaps = await run('records_officer', (q) =>
      q.query('SELECT id FROM record_gap WHERE patient_id=$1 LIMIT 1', [f.patients.demo2]),
    );
    await expect(
      run('records_officer', (q) =>
        waiveGap(q, {
          gapId: gaps.rows[0]!.id,
          userId: f.clinicians.records_officer,
          reason: ' ',
        }),
      ),
    ).rejects.toThrow('waiver_reason_required');
  });
  it('rejects a coordinator waiver', async () => {
    const gaps = await run('records_officer', (q) =>
      q.query('SELECT id FROM record_gap WHERE patient_id=$1 LIMIT 1', [f.patients.demo2]),
    );
    await expect(
      run('coordinator', (q) =>
        waiveGap(q, {
          gapId: gaps.rows[0]!.id,
          userId: f.clinicians.coordinator,
          reason: 'Not applicable',
        }),
      ),
    ).rejects.toThrow('forbidden');
  });
});

describe('Phase 3 concurrency and documented instructions', () => {
  it('rejects a stale reassignment after one concurrent owner update', async () => {
    const id = await task();
    const results = await Promise.allSettled([
      run('coordinator', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: f.clinicians.coordinator,
          actorId: f.clinicians.coordinator,
          expectedAssigneeId: null,
        }),
      ),
      run('coordinator', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: f.clinicians.records_officer,
          actorId: f.clinicians.coordinator,
          expectedAssigneeId: null,
        }),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('treats repeated assignment as idempotent', async () => {
    const id = await task();
    for (let i = 0; i < 2; i++)
      await run('coordinator', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: f.clinicians.coordinator,
          actorId: f.clinicians.coordinator,
        }),
      );
    const events = await run('coordinator', (q) =>
      q.query("SELECT id FROM task_event WHERE task_id=$1 AND action='assigned'", [id]),
    );
    expect(events.rows).toHaveLength(1);
  });
  it('promotes only verified documented instructions and deduplicates concurrent clicks', async () => {
    const factId = await run('coordinator', async (q) => {
      const span = await q.query<{ id: string }>(
        `INSERT INTO text_span(org_id,document_id,page_id,granularity,span_index,text,char_start,char_end,bbox_x,bbox_y,bbox_w,bbox_h,ocr_engine,ocr_engine_version)
 SELECT org_id,document_id,page_id,granularity,9999,'Bring prior imaging records',0,26,0,0,1,1,'synthetic-test','1' FROM text_span WHERE id=$1 RETURNING id`,
        [f.sampleSpanId],
      );
      const fact = await insertFact(q, {
        orgId: f.org1,
        patientId: f.patients.demo3,
        factType: 'instruction.recorded',
        value: { kind: 'text', text: 'Bring prior imaging records' },
        verbatimQuote: 'Bring prior imaging records',
        spanIds: [span.rows[0]!.id],
        documentId: f.sampleDocumentId,
        extractorKind: 'rule',
        extractorName: 'synthetic-test',
        extractorVersion: '1',
        confidenceRaw: 1,
        createdBy: f.clinicians.coordinator,
      });
      if (!fact.ok) throw new Error('synthetic_fact_failed');
      await verifyEvidence(q, {
        factId: fact.factId,
        actor: {
          kind: 'human',
          userId: f.clinicians.coordinator,
          role: 'coordinator',
        },
      });
      return fact.factId;
    });
    const input = {
      taskKind: 'retrieve_document' as const,
      confirmedAdministrative: true,
      patientId: f.patients.demo3,
      evidenceFactId: factId,
      actorId: f.clinicians.coordinator,
    };
    const patient = await run('coordinator', (q) =>
      q.query<{ patient_id: string }>('SELECT patient_id FROM evidence_fact WHERE id=$1', [
        input.evidenceFactId,
      ]),
    );
    input.patientId = patient.rows[0]!.patient_id;
    const ids = await Promise.all([
      run('coordinator', (q) => createInstructionTask(q, input)),
      run('coordinator', (q) => createInstructionTask(q, input)),
    ]);
    expect(ids[0]).toBe(ids[1]);
    const row = await run('coordinator', (q) =>
      q.query('SELECT detail,origin_evidence_fact_id FROM admin_task WHERE id=$1', [ids[0]]),
    );
    expect(row.rows[0]!.origin_evidence_fact_id).toBe(input.evidenceFactId);
    expect(row.rows[0]!.detail).toBeNull();
  });
  it('waives an expected administrative item and recomputes readiness without PHI audit metadata', async () => {
    const gap = await run('records_officer', (q) =>
      q.query<{ id: string; patient_id: string }>(
        `SELECT g.id,g.patient_id FROM record_gap g JOIN checklist_item ci ON ci.id=g.checklist_item_id WHERE ci.requirement_kind='expected' AND g.status IN ('missing','partial') LIMIT 1`,
      ),
    );
    expect(gap.rows[0]).toBeTruthy();
    await run('records_officer', (q) =>
      waiveGap(q, {
        gapId: gap.rows[0]!.id,
        userId: f.clinicians.records_officer,
        reason: 'Records office confirmed this expected document is not applicable',
      }),
    );
    const result = await run('records_officer', (q) =>
      q.query('SELECT status FROM record_gap WHERE id=$1', [gap.rows[0]!.id]),
    );
    expect(result.rows[0]!.status).toBe('waived');
    const audit = await run('records_officer', (q) =>
      q.query("SELECT metadata_json FROM audit_event WHERE entity_id=$1 AND action='gap.waived'", [
        gap.rows[0]!.id,
      ]),
    );
    expect(audit.rows[0]!.metadata_json).toEqual({ reason_recorded: true });
    const readiness = await run('records_officer', (q) =>
      q.query('SELECT id FROM record_readiness_snapshot WHERE patient_id=$1', [
        gap.rows[0]!.patient_id,
      ]),
    );
    expect(readiness.rows.length).toBeGreaterThan(1);
  });
});

describe('Phase 3 task source integrity', () => {
  it('rejects forged patient-to-document origin references', async () => {
    await expect(
      run('coordinator', (q) =>
        createTask(q, {
          orgId: f.org1,
          patientId: f.patients.demo2,
          title: 'Forged source',
          taskKind: 'retrieve_document',
          origin: { kind: 'document', documentId: f.sampleDocumentId },
          createdBy: f.clinicians.coordinator,
        }),
      ),
    ).rejects.toThrow('task_source_not_accessible');
  });
  it('rejects cross-tenant patient task creation', async () => {
    await expect(
      run('coordinator', (q) =>
        createTask(q, {
          orgId: f.org1,
          patientId: f.patients.otherTenant,
          title: 'Forged patient',
          taskKind: 'retrieve_document',
          origin: { kind: 'document', documentId: f.sampleDocumentId },
          createdBy: f.clinicians.coordinator,
        }),
      ),
    ).rejects.toThrow('patient_not_found');
  });
});

describe('Phase 3 tenant and consent regressions', () => {
  it('rejects an actual active foreign-organization member as assignee', async () => {
    const foreign = await getMigratorPool().query<{ user_id: string }>(
      'SELECT user_id FROM membership WHERE org_id=$1 LIMIT 1',
      [f.org2],
    );
    expect(foreign.rows[0]).toBeTruthy();
    const id = await task();
    await expect(
      run('coordinator', (q) =>
        assignTask(q, {
          taskId: id,
          assigneeId: foreign.rows[0]!.user_id,
          actorId: f.clinicians.coordinator,
        }),
      ),
    ).rejects.toThrow('invalid_assignee');
  });
  it('withholds promoted instruction text after its source access is revoked', async () => {
    const existing = await run('coordinator', (q) =>
      q.query<{ id: string; patient_id: string; document_id: string }>(
        `SELECT t.id,t.patient_id,ef.document_id FROM admin_task t JOIN evidence_fact ef ON ef.id=t.origin_evidence_fact_id WHERE ef.fact_type='instruction.recorded' LIMIT 1`,
      ),
    );
    const t = existing.rows[0]!;
    expect(t).toBeTruthy();
    await run('coordinator', (q) =>
      q.query("UPDATE document SET ingest_error='consent_revoked_or_expired' WHERE id=$1", [
        t.document_id,
      ]),
    );
    try {
      const tasks = await run('coordinator', (q) => listTasks(q, t.patient_id));
      const task = tasks.find((x) => x.id === t.id)!;
      expect(task.detail).toBeNull();
      const ownership = await run('coordinator', (q) => listTaskOwnership(q, t.patient_id));
      expect(ownership.find((x) => x.id === t.id)).toMatchObject({
        quote: null,
        documentId: null,
      });
    } finally {
      await run('coordinator', (q) =>
        q.query('UPDATE document SET ingest_error=NULL WHERE id=$1', [t.document_id]),
      );
    }
  });
});
