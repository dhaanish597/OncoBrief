import { expect, test, type Page } from '@playwright/test';
import {
  closePools,
  getMigratorPool,
  withTenant,
  createTask,
  insertFact,
  verifyEvidence,
} from '@oncobrief/db';

// Real persisted synthetic oncology fixture data. No reset or production connection is performed here.
let orgId: string;
let patientId: string;
let coordinatorId: string;
let recordsId: string;
let taskId: string;
let gapId: string;
let instructionId: string;
const quote = 'Bring prior imaging records to the records office';
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button', { name: 'Open the workspace' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}
test.beforeAll(async () => {
  const db = getMigratorPool();
  const org = await db.query<{ id: string }>(
    "SELECT id FROM organization WHERE slug='rci' AND is_demo_fixture",
  );
  if (!org.rows[0]) throw new Error('Synthetic demo fixtures required');
  orgId = org.rows[0].id;
  const patient = await db.query<{ id: string }>(
    "SELECT id FROM patient WHERE org_id=$1 AND demo_code='DEMO-001'",
    [orgId],
  );
  patientId = patient.rows[0]!.id;
  const staff = await db.query<{ id: string; email: string }>(
    "SELECT id,email FROM app_user WHERE email IN ('coord.anita@rci.demo','records.deepak@rci.demo')",
  );
  coordinatorId = staff.rows.find((s) => s.email.startsWith('coord.'))!.id;
  recordsId = staff.rows.find((s) => s.email.startsWith('records.'))!.id;
  await withTenant({ orgId, userId: recordsId, role: 'records_officer' }, async (q) => {
    const gap = await q.query<{ id: string }>(
      `SELECT g.id FROM record_gap g JOIN checklist_item ci ON ci.id=g.checklist_item_id WHERE g.patient_id=$1 AND ci.requirement_kind='expected' AND g.status IN ('missing','partial') ORDER BY ci.ordinal LIMIT 1`,
      [patientId],
    );
    if (!gap.rows[0])
      throw new Error('An actionable expected synthetic administrative gap is required');
    gapId = gap.rows[0].id;
    taskId = await createTask(q, {
      orgId,
      patientId,
      title: 'Phase 3 browser ownership acceptance',
      taskKind: 'retrieve_document',
      origin: {
        kind: 'document',
        documentId: (
          await q.query<{ id: string }>('SELECT id FROM document WHERE patient_id=$1 LIMIT 1', [
            patientId,
          ])
        ).rows[0]!.id,
      },
      createdBy: recordsId,
    });
    const span = await q.query<{ id: string; document_id: string }>(
      `INSERT INTO text_span(org_id,document_id,page_id,granularity,span_index,text,char_start,char_end,bbox_x,bbox_y,bbox_w,bbox_h,ocr_engine,ocr_engine_version)
   SELECT s.org_id,s.document_id,s.page_id,s.granularity,(SELECT coalesce(max(span_index),0)+1 FROM text_span WHERE page_id=s.page_id),$2,0,length($2),0,0,1,1,'synthetic-phase3-browser','1'
   FROM text_span s JOIN document d ON d.id=s.document_id WHERE d.patient_id=$1 LIMIT 1 RETURNING id,document_id`,
      [patientId, quote],
    );
    const fact = await insertFact(q, {
      orgId,
      patientId,
      factType: 'instruction.recorded',
      value: { kind: 'text', text: quote },
      verbatimQuote: quote,
      spanIds: [span.rows[0]!.id],
      documentId: span.rows[0]!.document_id,
      extractorKind: 'rule',
      extractorName: 'synthetic-phase3-browser',
      extractorVersion: '1',
      confidenceRaw: 1,
      createdBy: recordsId,
    });
    if (!fact.ok) throw new Error('Synthetic source instruction failed');
    instructionId = fact.factId;
    await verifyEvidence(q, {
      factId: instructionId,
      actor: { kind: 'human', userId: recordsId, role: 'records_officer' },
    });
  });
});
test.afterAll(closePools);

test('H — confirm a permitted task owner and persist assignment, deadline, and audit', async ({
  page,
}) => {
  await login(page, 'coord.anita@rci.demo');
  await page.goto(`/patients/${patientId}/tasks`);
  const row = page
    .getByTestId('task-row')
    .filter({ hasText: 'Phase 3 browser ownership acceptance' });
  await row.getByLabel('Task owner', { exact: true }).selectOption(coordinatorId);
  await row.getByLabel('Task deadline').fill('2027-01-15');
  await row.getByLabel('Confirm owner and deadline').check();
  await row.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(row.getByRole('status')).toContainText('confirmed and audited');
  await page.reload();
  await expect(row).toContainText('assigned to Anita');
  const persisted = await getMigratorPool().query(
    'SELECT assigned_to,due_on::text FROM admin_task WHERE id=$1',
    [taskId],
  );
  expect(persisted.rows[0]).toMatchObject({
    assigned_to: coordinatorId,
    due_on: '2027-01-15',
  });
  const audit = await getMigratorPool().query(
    "SELECT actor_user_id FROM audit_event WHERE entity_id=$1 AND action='task.assigned'",
    [taskId],
  );
  expect(audit.rows).toEqual([{ actor_user_id: coordinatorId }]);
});

test('I — confirm exact documented instruction promotion and waive an administrative item with persisted reason', async ({
  page,
}) => {
  await login(page, 'records.deepak@rci.demo');
  await page.goto(`/patients/${patientId}/tasks`);
  const instruction = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('form', { name: 'Create task from instruction' }) })
    .filter({ hasText: quote });
  await instruction.locator('select[name="taskKind"]').selectOption('retrieve_document');
  await instruction
    .getByLabel('I confirm the exact source text documents an administrative action.')
    .check();
  await instruction.getByRole('button', { name: 'Confirm source-backed task' }).click();
  await expect(
    page
      .getByTestId('task-row')
      .filter({ hasText: 'Coordinate documented administrative instruction' }),
  ).toContainText(quote);
  const task = await getMigratorPool().query(
    'SELECT detail FROM admin_task WHERE origin_evidence_fact_id=$1',
    [instructionId],
  );
  expect(task.rows).toHaveLength(1);
  expect(task.rows[0]!.detail).toBeNull();
  await page.goto(`/patients/${patientId}/record-map`);
  const waiver = page
    .locator('form[aria-label="Administrative gap waiver"]')
    .filter({ has: page.locator(`input[name="gapId"][value="${gapId}"]`) });
  await waiver
    .locator('xpath=..')
    .getByText('Waive expected administrative item', { exact: true })
    .click();
  const reason = 'Synthetic acceptance: records office confirmed this expected item does not apply';
  await waiver.getByLabel('Administrative reason').fill(reason);
  await waiver.locator('input[name="confirmed"]').check();
  await waiver.getByRole('button', { name: 'Confirm administrative waiver' }).click();
  await expect(
    page.getByTestId('record-gap').filter({ has: page.locator(`input[value="${gapId}"]`) }),
  ).toHaveCount(0);
  const gap = await getMigratorPool().query(
    'SELECT status,waived_by,waived_reason FROM record_gap WHERE id=$1',
    [gapId],
  );
  expect(gap.rows[0]).toEqual({
    status: 'waived',
    waived_by: recordsId,
    waived_reason: reason,
  });
  const audit = await getMigratorPool().query(
    "SELECT metadata_json FROM audit_event WHERE entity_id=$1 AND action='gap.waived'",
    [gapId],
  );
  expect(audit.rows[0]!.metadata_json).toEqual({ reason_recorded: true });
});
