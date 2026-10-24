import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { getMigratorPool } from '../../../packages/db/src/client';

/** Real server actions + real PostgreSQL. Run serially after demo:reset; no mocks.
 * Slots are isolated to a synthetic future clinic date, not operational capacity.
 * Existing DEMO patients remain explicitly synthetic and retain their ledger.
 */
const date = new Date(Date.UTC(2100, 0, 1) + Number.parseInt(randomUUID().slice(0, 8), 16) % 100000 * 86400000).toISOString().slice(0, 10);
const slotId = randomUUID();
const vacantId = randomUUID();
const walkInId = randomUUID();
const clinicKey = `e2e-oncology-${slotId}`;
const readyWaitId = randomUUID();
const blockedWaitId = randomUUID();
let orgId: string;
let readyPatientId: string;
let scheduledPatientId: string;
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dr.rao@rci.demo');
  await page.getByLabel('Password').fill('oncobrief-demo');
  await page.getByRole('button',{name:'Open the workspace'}).click();
  await expect(page).toHaveURL(/workspace/);
  await page.goto(`/workspace?date=${date}`);
  await page.getByRole('button',{name:'Live oncology OPD',exact:true}).click();
}
async function confirm(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:/^Confirm (status update|slot offer|walk-in registration)$/}).click();
  await expect(dialog).not.toBeVisible();
}
async function persisted(sql: string, params: unknown[] = []) { return getMigratorPool().query(sql,params); }

test.describe.serial('Phase 3 persisted oncology OPD acceptance', () => {
  test.beforeAll(async () => {
    const patients = await persisted(`SELECT p.id,p.demo_code,p.org_id FROM patient p JOIN organization o ON o.id=p.org_id WHERE o.slug='rci'`);
    orgId = patients.rows[0].org_id;
    readyPatientId = patients.rows.find(p => p.demo_code === 'DEMO-003').id;
    scheduledPatientId = patients.rows.find(p => p.demo_code === 'DEMO-001').id;
    const blockedPatientId = patients.rows.find(p => p.demo_code === 'DEMO-002').id;
    await persisted(`INSERT INTO opd_appointment_slot(id,org_id,clinic_date,slot_start_time,slot_end_time,room_label,patient_id,token_number,status,clinic_key) VALUES ($1,$4,$5,'09:00','09:30','Synthetic Phase 3 ' || $7,$6,'P3-01','scheduled',$7),($2,$4,$5,'09:30','10:00','Synthetic Phase 3 ' || $7,NULL,NULL,'vacant',$7),($3,$4,$5,'10:00','10:30','Synthetic Phase 3 ' || $7,NULL,NULL,'vacant',$7)`,[slotId,vacantId,walkInId,orgId,date,scheduledPatientId,clinicKey]);
    await persisted(`INSERT INTO opd_waitlist_entry(id,org_id,patient_id,requested_date,clinic_key) VALUES ($1,$3,$4,$6,$7),($2,$3,$5,$6,$7)`,[readyWaitId,blockedWaitId,orgId,readyPatientId,blockedPatientId,date,clinicKey]);
  });
  test('A/B: queue and check-in persist with append-only history and audit',async ({page}) => {
    await login(page);
    const row = page.getByTestId(`opd-slot-${slotId}`);
    await expect(row).toContainText('09:00–09:30');
    await expect(row).toContainText('P3-01');
    await row.getByRole('button',{name:'Checked in',exact:true}).click();
    await page.getByLabel('Operational reason (required)').fill('Synthetic acceptance arrival confirmation');
    await confirm(page);
    expect((await persisted('SELECT status FROM opd_appointment_slot WHERE id=$1',[slotId])).rows[0].status).toBe('checked_in');
    expect((await persisted("SELECT action FROM opd_slot_event WHERE slot_id=$1 AND to_status='checked_in'",[slotId])).rowCount).toBe(1);
    expect((await persisted("SELECT action FROM audit_event WHERE entity_id=$1 AND action LIKE 'opd.%'",[slotId])).rowCount).toBeGreaterThan(0);
  });
  test('C: cancellation preserves history then explicitly releases capacity',async ({page}) => {
    await login(page);
    const row = page.getByTestId(`opd-slot-${slotId}`);
    await row.getByRole('button',{name:'Cancelled',exact:true}).click();
    await page.getByLabel('Operational reason (required)').fill('Synthetic staff-confirmed cancellation');
    await confirm(page);
    await row.getByRole('button',{name:'Release slot',exact:true}).click();
    await page.getByLabel('Operational reason (required)').fill('Synthetic explicit capacity release');
    await confirm(page);
    expect((await persisted('SELECT status,patient_id FROM opd_appointment_slot WHERE id=$1',[slotId])).rows[0]).toMatchObject({status:'vacant',patient_id:null});
  });
  test('D/E: only ready candidates appear and explicit offer does not imply acceptance',async ({page}) => {
    await login(page);
    await page.getByTestId(`opd-slot-${vacantId}`).getByRole('button',{name:'Review backfill candidates'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio')).toHaveCount(1);
    await expect(dialog).toContainText('Record ready under administrative checklist');
    await dialog.getByRole('radio').check();
    await mkdir('audit/screenshots', { recursive: true });
    await page.screenshot({ path: 'audit/screenshots/phase3-backfill-review.png', fullPage: true });
    await confirm(page);
    expect((await persisted('SELECT status,offered_slot_id FROM opd_waitlist_entry WHERE id=$1',[readyWaitId])).rows[0]).toMatchObject({status:'offered',offered_slot_id:vacantId});
    expect((await persisted('SELECT patient_id FROM opd_appointment_slot WHERE id=$1',[vacantId])).rows[0].patient_id).toBeNull();
    await expect(page.getByRole('status')).toContainText('Patient acceptance has not been recorded');
  });
  test('F: stale candidate list safely rejects an active duplicate offer',async ({page}) => {
    // Release first offer, load candidate, then create an incompatible reservation
    // in another browser session through the actual confirmation interface.
    await login(page);
    await page.getByTestId(`opd-slot-${vacantId}`).getByRole('button',{name:'Release offer'}).click();
    await page.getByLabel('Operational reason (required)').fill('Synthetic release before concurrency test');
    await confirm(page);
    await page.getByTestId(`opd-slot-${walkInId}`).getByRole('button',{name:'Review backfill candidates'}).click();
    await page.getByRole('dialog').getByRole('radio').check();
    const other = await page.context().newPage();
    await other.goto(`/workspace?date=${date}`);
    await other.getByRole('button',{name:'Live oncology OPD',exact:true}).click();
    await other.getByTestId(`opd-slot-${vacantId}`).getByRole('button',{name:'Review backfill candidates'}).click();
    await other.getByRole('dialog').getByRole('radio').check();
    await confirm(other);
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByRole('button',{name:'Confirm slot offer',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('could not be confirmed');
    expect((await persisted("SELECT count(*)::int n FROM opd_waitlist_entry WHERE patient_id=$1 AND status='offered'",[readyPatientId])).rows[0].n).toBe(1);
    await other.close();
  });
  test('G: walk-in consumes real vacant capacity and reuses ready waitlist',async ({page}) => {
    await login(page);
    await page.getByTestId(`opd-slot-${vacantId}`).getByRole('button',{name:'Release offer'}).click();
    await page.getByLabel('Operational reason (required)').fill('Synthetic staff release for walk-in registration');
    await confirm(page);
    await page.getByTestId(`opd-slot-${walkInId}`).getByRole('button',{name:'Register walk-in',exact:true}).click();
    await page.getByRole('dialog').getByRole('radio').check();
    await confirm(page);
    expect((await persisted('SELECT status,patient_id FROM opd_appointment_slot WHERE id=$1',[walkInId])).rows[0]).toMatchObject({status:'walk_in',patient_id:readyPatientId});
    expect((await persisted('SELECT status FROM opd_waitlist_entry WHERE id=$1',[readyWaitId])).rows[0].status).toBe('slotted');
    await mkdir('audit/screenshots', { recursive: true });
    await page.screenshot({ path: 'audit/screenshots/phase3-opd-board.png', fullPage: true });
  });
  test('empty ready waitlist is explained without inventing capacity or candidates',async ({page}) => {
    await login(page);
    await page.getByTestId(`opd-slot-${vacantId}`).getByRole('button',{name:'Review backfill candidates'}).click();
    await expect(page.getByRole('dialog')).toContainText('No eligible consultation-ready waitlisted patients');
    await expect(page.getByRole('button',{name:'Confirm slot offer',exact:true})).toBeDisabled();
    expect((await persisted('SELECT status,patient_id FROM opd_appointment_slot WHERE id=$1',[vacantId])).rows[0]).toMatchObject({status:'vacant',patient_id:null});
  });

});
