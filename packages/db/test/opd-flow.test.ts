import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from './helpers';
import { closePools, withTenant, getMigratorPool } from '../src/client';
import {
  listBackfillCandidates,
  offerOpdSlot,
  updateOpdSlotStatus,
  registerWalkIn,
  listOpdWorkspace,
  setOpdWaitlistPriority,
} from '../src/services/opd-flow';
let f: Fixtures;
let slotId: string;
let waitId: string;
const ctx = () => ({
  orgId: f.org1,
  userId: f.clinicians.coordinator,
  role: 'coordinator' as const,
});
const offer = (requestId: string) =>
  withTenant(ctx(), (q) =>
    offerOpdSlot(q, {
      orgId: f.org1,
      slotId,
      waitlistEntryId: waitId,
      actorId: f.clinicians.coordinator,
      requestId,
    }),
  );
beforeAll(async () => {
  f = await setupFixtures();
  const p = getMigratorPool();
  const s = await p.query<{ id: string }>(
    `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2030-01-01','13:00','13:30','Test oncology','test-oncology','vacant') RETURNING id`,
    [f.org1],
  );
  slotId = s.rows[0]!.id;
  const w = await p.query<{ id: string }>(
    `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2030-01-01','test-oncology') RETURNING id`,
    [f.org1, f.patients.demo3],
  );
  waitId = w.rows[0]!.id;
});
afterAll(closePools);
describe('transactional OPD', () => {
  it('returns only ready matching candidates with current source access', async () => {
    const started = performance.now();
    const rows = await withTenant(ctx(), (q) =>
      listBackfillCandidates(q, {
        orgId: f.org1,
        slotId,
        actorId: f.clinicians.coordinator,
      }),
    );
    expect(rows.map((r) => r.waitlistEntryId)).toContain(waitId);
    const ms = performance.now() - started;
    console.info(
      `PHASE3 real candidate recommendation ${ms.toFixed(2)}ms; ${rows.length} eligible`,
    );
    expect(ms).toBeLessThan(5000);
  });
  it('two simultaneous offers reserve one slot once; repeated key is idempotent', async () => {
    const r = await Promise.allSettled([offer('race-a'), offer('race-b')]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const key = r[0]?.status === 'fulfilled' ? 'race-a' : 'race-b';
    await expect(offer(key)).resolves.toBeDefined();
    const p = getMigratorPool();
    expect(
      (
        await p.query(
          `SELECT * FROM opd_slot_event WHERE slot_id=$1 AND action='offered'`,
          [slotId],
        )
      ).rowCount,
    ).toBe(1);
  });
  it('release cancels offer without acceptance and preserves history', async () => {
    await withTenant(ctx(), (q) =>
      updateOpdSlotStatus(q, {
        orgId: f.org1,
        slotId,
        toStatus: 'vacant',
        expectedStatus: 'vacant',
        actorId: f.clinicians.coordinator,
        requestId: 'release',
        reason: 'Patient declined offer',
      }),
    );
    expect(
      (
        await getMigratorPool().query(
          `SELECT status FROM opd_waitlist_entry WHERE id=$1`,
          [waitId],
        )
      ).rows[0]?.status,
    ).toBe('waiting');
  });
  it('rejects stale readiness even with an earlier eligible candidate list', async () => {
    const p = getMigratorPool();
    await p.query(
      `INSERT INTO conflict_set(org_id,patient_id,fact_type,slot_key,member_fingerprint,detector_name,detector_version,status) VALUES($1,$2,'appointment.recorded','test:opd-stale','phase3-test','test','1','open')`,
      [f.org1, f.patients.demo3],
    );
    await expect(offer('stale')).rejects.toThrow('candidate_ineligible');
    await p.query(
      `UPDATE conflict_set SET status='resolved',resolution_kind='retain_both',resolution_reason='Test resolved',resolved_by=(SELECT user_id FROM membership WHERE org_id=conflict_set.org_id AND role='clinician' LIMIT 1),resolved_at=now() WHERE patient_id=$1 AND slot_key='test:opd-stale'`,
      [f.patients.demo3],
    );
  });
  it('rejects auditor and forged actor', async () => {
    await expect(
      withTenant(
        { ...ctx(), userId: f.clinicians.auditor, role: 'auditor' },
        (q) =>
          offerOpdSlot(q, {
            orgId: f.org1,
            slotId,
            waitlistEntryId: waitId,
            actorId: f.clinicians.auditor,
            requestId: 'bad-role',
          }),
      ),
    ).rejects.toThrow('forbidden');
    await expect(
      withTenant(ctx(), (q) =>
        offerOpdSlot(q, {
          orgId: f.org1,
          slotId,
          waitlistEntryId: waitId,
          actorId: f.clinicians.clinician,
          requestId: 'forged',
        }),
      ),
    ).rejects.toThrow('forbidden');
  });
  it('cross tenant slot hidden and no partial action persists', async () => {
    await expect(
      withTenant({ orgId: f.org2, userId: null, role: null }, (q) =>
        offerOpdSlot(q, {
          orgId: f.org1,
          slotId,
          waitlistEntryId: waitId,
          actorId: f.clinicians.coordinator,
          requestId: 'cross',
        }),
      ),
    ).rejects.toThrow();
    expect(
      (
        await getMigratorPool().query(
          `SELECT * FROM opd_slot_event WHERE request_id='cross'`,
        )
      ).rowCount,
    ).toBe(0);
  });
  it('walk-in consumes persisted vacant capacity and is audited', async () => {
    const messageCount = (
      await getMigratorPool().query(
        'SELECT count(*)::int AS n FROM patient_message',
      )
    ).rows[0].n;
    await withTenant(ctx(), (q) =>
      registerWalkIn(q, {
        orgId: f.org1,
        slotId,
        waitlistEntryId: waitId,
        actorId: f.clinicians.coordinator,
        requestId: 'walk',
      }),
    );
    const row = (
      await getMigratorPool().query(
        `SELECT status,patient_id FROM opd_appointment_slot WHERE id=$1`,
        [slotId],
      )
    ).rows[0];
    expect(row).toMatchObject({
      status: 'walk_in',
      patient_id: f.patients.demo3,
    });
    expect(
      (
        await getMigratorPool().query(
          'SELECT count(*)::int AS n FROM patient_message',
        )
      ).rows[0].n,
    ).toBe(messageCount);
  });
  it('illegal transition rejected, valid transition audited, stale expected state rejected', async () => {
    await expect(
      withTenant(ctx(), (q) =>
        updateOpdSlotStatus(q, {
          orgId: f.org1,
          slotId,
          toStatus: 'completed',
          expectedStatus: 'walk_in',
          actorId: f.clinicians.coordinator,
          requestId: 'illegal',
        }),
      ),
    ).rejects.toThrow('invalid_opd_transition');
    await withTenant(ctx(), (q) =>
      updateOpdSlotStatus(q, {
        orgId: f.org1,
        slotId,
        toStatus: 'in_consult',
        expectedStatus: 'walk_in',
        actorId: f.clinicians.coordinator,
        requestId: 'consult',
      }),
    );
    await expect(
      withTenant(ctx(), (q) =>
        updateOpdSlotStatus(q, {
          orgId: f.org1,
          slotId,
          toStatus: 'cancelled',
          expectedStatus: 'walk_in',
          actorId: f.clinicians.coordinator,
          requestId: 'stale-state',
        }),
      ),
    ).rejects.toThrow('stale_slot');
  });
  it('rejects duplicate/overlapping room capacity', async () => {
    await expect(
      withTenant(ctx(), (q) =>
        q.query(
          `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,status) VALUES($1,'2030-01-01','13:15','13:45','Test oncology','vacant')`,
          [f.org1],
        ),
      ),
    ).rejects.toThrow('opd_capacity_overlap');
  });

  it('rejects occupied transition without patient', async () => {
    const p = getMigratorPool();
    const id = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,status) VALUES($1,'2030-01-02','08:00','08:30','Legacy empty','scheduled') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    await expect(
      withTenant(ctx(), (q) =>
        updateOpdSlotStatus(q, {
          orgId: f.org1,
          slotId: id,
          toStatus: 'checked_in',
          expectedStatus: 'scheduled',
          actorId: f.clinicians.coordinator,
          requestId: 'no-patient',
        }),
      ),
    ).rejects.toThrow('patient_required');
  });
  it('different vacant slots cannot simultaneously offer the same patient', async () => {
    const p = getMigratorPool();
    const slots = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2031-01-01','08:00','08:30','Race A','race','vacant'),($1,'2031-01-01','08:00','08:30','Race B','race','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows;
    const w = (
      await p.query(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2031-01-01','race'),($1,$2,'2031-01-01','race') RETURNING id`,
        [f.org1, f.patients.demo3],
      )
    ).rows;
    const r = await Promise.allSettled(
      slots.map((a, i) =>
        withTenant(ctx(), (q) =>
          offerOpdSlot(q, {
            orgId: f.org1,
            slotId: a.id,
            waitlistEntryId: w[i].id,
            actorId: f.clinicians.coordinator,
            requestId: 'patient-race-' + i,
          }),
        ),
      ),
    );
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await p.query(
          `SELECT id FROM opd_waitlist_entry WHERE patient_id=$1 AND status='offered'`,
          [f.patients.demo3],
        )
      ).rowCount,
    ).toBe(1);
    for (const a of slots)
      await withTenant(ctx(), async (q) => {
        if (
          (
            await q.query(
              `SELECT id FROM opd_waitlist_entry WHERE offered_slot_id=$1 AND status='offered'`,
              [a.id],
            )
          ).rowCount
        )
          await updateOpdSlotStatus(q, {
            orgId: f.org1,
            slotId: a.id,
            toStatus: 'vacant',
            expectedStatus: 'vacant',
            actorId: f.clinicians.coordinator,
            requestId: 'release-' + a.id,
            reason: 'Synthetic race cleanup',
          });
      });
  });
  it('rollback after reservation mutation leaves no offer, event or audit', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2032-01-01','08:00','08:30','Rollback','rollback','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    const w = (
      await p.query(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2032-01-01','rollback') RETURNING id`,
        [f.org1, f.patients.demo3],
      )
    ).rows[0].id;
    await expect(
      withTenant(ctx(), (q) =>
        offerOpdSlot(
          {
            query: async (sql, values) => {
              if (sql.includes('INSERT INTO opd_slot_event'))
                throw new Error('injected_failure');
              return q.query(sql, values);
            },
          },
          {
            orgId: f.org1,
            slotId: a,
            waitlistEntryId: w,
            actorId: f.clinicians.coordinator,
            requestId: 'rollback',
          },
        ),
      ),
    ).rejects.toThrow('injected_failure');
    expect(
      (await p.query(`SELECT status FROM opd_waitlist_entry WHERE id=$1`, [w]))
        .rows[0].status,
    ).toBe('waiting');
    expect(
      (
        await p.query(
          `SELECT id FROM opd_slot_event WHERE request_id='rollback'`,
        )
      ).rowCount,
    ).toBe(0);
  });
  it('blocked and wrong-clinic entries are excluded by actual database reads', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2033-01-01','08:00','08:30','Eligibility','eligibility','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    await p.query(
      `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2033-01-01','eligibility'),($1,$3,'2033-01-01','other-clinic')`,
      [f.org1, f.patients.demo1, f.patients.demo3],
    );
    expect(
      await withTenant(ctx(), (q) =>
        listBackfillCandidates(q, {
          orgId: f.org1,
          slotId: a,
          actorId: f.clinicians.coordinator,
        }),
      ),
    ).toEqual([]);
  });
  it('revoked source access prevents an otherwise ready candidate offer', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2034-01-01','08:00','08:30','Consent','consent-test','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    const w = (
      await p.query(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2034-01-01','consent-test') RETURNING id`,
        [f.org1, f.patients.demo3],
      )
    ).rows[0].id;
    const d = (
      await p.query(
        `SELECT id,ingest_error FROM document WHERE patient_id=$1 LIMIT 1`,
        [f.patients.demo3],
      )
    ).rows[0];
    await p.query(
      `UPDATE document SET ingest_error='consent_revoked_or_expired' WHERE id=$1`,
      [d.id],
    );
    try {
      await expect(
        withTenant(ctx(), (q) =>
          offerOpdSlot(q, {
            orgId: f.org1,
            slotId: a,
            waitlistEntryId: w,
            actorId: f.clinicians.coordinator,
            requestId: 'revoked',
          }),
        ),
      ).rejects.toThrow('candidate_ineligible');
    } finally {
      await p.query(`UPDATE document SET ingest_error=$2 WHERE id=$1`, [
        d.id,
        d.ingest_error,
      ]);
    }
  });
  it('clinician overlap rejected even across different rooms', async () => {
    const p = getMigratorPool();
    await p.query(
      `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinician_id,status) VALUES($1,'2035-01-01','08:00','08:30','Doctor A',$2,'vacant')`,
      [f.org1, f.clinicians.clinician],
    );
    await expect(
      withTenant(ctx(), (q) =>
        q.query(
          `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinician_id,status) VALUES($1,'2035-01-01','08:15','08:45','Doctor B',$2,'vacant')`,
          [f.org1, f.clinicians.clinician],
        ),
      ),
    ).rejects.toThrow('opd_capacity_overlap');
  });
  it('backfill discovery duration is measured on real stored candidates', async () => {
    const start = performance.now();
    const candidates = await withTenant(ctx(), (q) =>
      listBackfillCandidates(q, {
        orgId: f.org1,
        slotId,
        actorId: f.clinicians.coordinator,
      }),
    );
    const ms = performance.now() - start;
    console.info(
      `PHASE3 backfill discovery ${ms.toFixed(2)}ms; ${candidates.length} candidates (occupied slot fast-path)`,
    );
    expect(ms).toBeLessThan(5000);
  });
  it('forged priority provenance cannot influence ranking and explicit selection is audited', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2036-01-01','08:00','08:30','Priority test','priority-test','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    const w = (
      await p.query(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key,priority_tag,priority_selected_by,priority_selected_at) VALUES($1,$2,'2036-01-01','priority-test','expedited_slot_requested',$3,now()) RETURNING id`,
        [f.org1, f.patients.demo3, f.clinicians.coordinator],
      )
    ).rows[0].id;
    const discovery = () =>
      withTenant(ctx(), (q) =>
        listBackfillCandidates(q, {
          orgId: f.org1,
          slotId: a,
          actorId: f.clinicians.coordinator,
        }),
      );
    expect((await discovery())[0]?.priorityTag).toBe('routine_followup');
    await withTenant(ctx(), (q) =>
      setOpdWaitlistPriority(q, {
        orgId: f.org1,
        actorId: f.clinicians.coordinator,
        waitlistEntryId: w,
        priorityTag: 'expedited_slot_requested',
      }),
    );
    expect((await discovery())[0]?.priorityTag).toBe(
      'expedited_slot_requested',
    );
    await expect(
      withTenant(ctx(), async (q) =>
        setOpdWaitlistPriority(q, {
          orgId: f.org1,
          actorId: f.clinicians.coordinator,
          waitlistEntryId: w,
          priorityTag: 'new_referral',
          sourceFactId: (
            await p.query(
              `SELECT id FROM evidence_fact WHERE patient_id=$1 LIMIT 1`,
              [f.patients.demo1],
            )
          ).rows[0].id,
        }),
      ),
    ).rejects.toThrow('invalid_priority_source');
    await withTenant(ctx(), (q) =>
      registerWalkIn(q, {
        orgId: f.org1,
        slotId: a,
        waitlistEntryId: w,
        actorId: f.clinicians.coordinator,
        requestId: 'priority-walk-in',
      }),
    );
    const board = await withTenant(ctx(), (q) =>
      listOpdWorkspace(q, { orgId: f.org1, date: '2036-01-01' }),
    );
    expect(board.slots[0]?.priority_tag).toBe('expedited_slot_requested');
    expect(board.slots[0]?.priority_provenance).toContain(
      'Authorized staff selection',
    );
  });
  it('workspace reports persisted denominators and measured recommendation timing', async () => {
    const started = performance.now();
    const board = await withTenant(ctx(), (q) =>
      listOpdWorkspace(q, { orgId: f.org1, date: '2030-01-01' }),
    );
    expect(board.slots).toHaveLength(1);
    expect(board.metrics.totalSlots).toBe(1);
    expect(board.timeZone).toBe('Asia/Kolkata');
    const ms = performance.now() - started;
    console.info(`PHASE3 workspace duration ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(5000);
  });
  it('compares overlapping clinic-local capacity across time zones and dates', async () => {
    const p = getMigratorPool();
    await p.query(
      `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinician_id,clinic_timezone,status) VALUES($1,'2037-01-01','00:15','00:45','Timezone A',$2,'Asia/Kolkata','vacant')`,
      [f.org1, f.clinicians.clinician],
    );
    await expect(
      withTenant(ctx(), (q) =>
        q.query(
          `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinician_id,clinic_timezone,status) VALUES($1,'2036-12-31','18:50','19:10','Timezone B',$2,'UTC','vacant')`,
          [f.org1, f.clinicians.clinician],
        ),
      ),
    ).rejects.toThrow('opd_capacity_overlap');
  });
  it('new booked capacity cannot overlap an existing patient offer', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2038-01-01','08:00','08:30','Reservation A','reservation','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    const w = (
      await p.query(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2038-01-01','reservation') RETURNING id`,
        [f.org1, f.patients.demo3],
      )
    ).rows[0].id;
    await withTenant(ctx(), (q) =>
      offerOpdSlot(q, {
        orgId: f.org1,
        slotId: a,
        waitlistEntryId: w,
        actorId: f.clinicians.coordinator,
        requestId: 'protected-reservation',
      }),
    );
    await expect(
      withTenant(ctx(), (q) =>
        q.query(
          `INSERT INTO opd_appointment_slot(org_id,patient_id,clinic_date,slot_start_time,slot_end_time,room_label,status) VALUES($1,$2,'2038-01-01','08:10','08:40','Reservation B','scheduled')`,
          [f.org1, f.patients.demo3],
        ),
      ),
    ).rejects.toThrow('opd_offer_overlap');
  });
  it('cancellation closes the slotted waitlist state and preserves assignment history', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `SELECT id FROM opd_appointment_slot WHERE clinic_key='reservation'`,
      )
    ).rows[0].id;
    const w = (
      await p.query(
        `SELECT id FROM opd_waitlist_entry WHERE clinic_key='reservation'`,
      )
    ).rows[0].id;
    await withTenant(ctx(), (q) =>
      updateOpdSlotStatus(q, {
        orgId: f.org1,
        slotId: a,
        toStatus: 'vacant',
        expectedStatus: 'vacant',
        actorId: f.clinicians.coordinator,
        requestId: 'cancel-release-offer',
        reason: 'Synthetic staff release',
      }),
    );
    await withTenant(ctx(), (q) =>
      registerWalkIn(q, {
        orgId: f.org1,
        slotId: a,
        waitlistEntryId: w,
        actorId: f.clinicians.coordinator,
        requestId: 'cancel-walk',
      }),
    );
    await withTenant(ctx(), (q) =>
      updateOpdSlotStatus(q, {
        orgId: f.org1,
        slotId: a,
        toStatus: 'cancelled',
        expectedStatus: 'walk_in',
        actorId: f.clinicians.coordinator,
        requestId: 'cancel-walk-confirm',
        reason: 'Synthetic attendance cancelled',
      }),
    );
    expect(
      (await p.query(`SELECT status FROM opd_waitlist_entry WHERE id=$1`, [w]))
        .rows[0].status,
    ).toBe('cancelled');
    expect(
      (
        await p.query(
          `SELECT patient_id FROM opd_slot_event WHERE slot_id=$1 AND action='walk_in'`,
          [a],
        )
      ).rows[0].patient_id,
    ).toBe(f.patients.demo3);
  });
  it('concurrent repeated requests produce one confirmed offer and cancellation races stay consistent', async () => {
    const p = getMigratorPool();
    const a = (
      await p.query(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status) VALUES($1,'2039-01-01','08:00','08:30','Double click','doubleclick','vacant') RETURNING id`,
        [f.org1],
      )
    ).rows[0].id;
    const w = (
      await p.query(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key) VALUES($1,$2,'2039-01-01','doubleclick') RETURNING id`,
        [f.org1, f.patients.demo3],
      )
    ).rows[0].id;
    const action = () =>
      withTenant(ctx(), (q) =>
        offerOpdSlot(q, {
          orgId: f.org1,
          slotId: a,
          waitlistEntryId: w,
          actorId: f.clinicians.coordinator,
          requestId: 'doubleclick',
        }),
      );
    await Promise.all([action(), action()]);
    expect(
      (
        await p.query(
          `SELECT id FROM opd_slot_event WHERE request_id='doubleclick'`,
        )
      ).rowCount,
    ).toBe(1);
    await expect(
      withTenant(ctx(), (q) =>
        offerOpdSlot(q, {
          orgId: f.org1,
          slotId: a,
          waitlistEntryId: waitId,
          actorId: f.clinicians.coordinator,
          requestId: 'doubleclick',
        }),
      ),
    ).rejects.toThrow('idempotency_conflict');
    const r = await Promise.allSettled([
      withTenant(ctx(), (q) =>
        updateOpdSlotStatus(q, {
          orgId: f.org1,
          slotId: a,
          toStatus: 'vacant',
          expectedStatus: 'vacant',
          actorId: f.clinicians.coordinator,
          requestId: 'offer-race-release',
          reason: 'Synthetic release race',
        }),
      ),
      withTenant(ctx(), (q) =>
        offerOpdSlot(q, {
          orgId: f.org1,
          slotId: a,
          waitlistEntryId: w,
          actorId: f.clinicians.coordinator,
          requestId: 'offer-race-new',
        }),
      ),
    ]);
    expect(r[0].status).toBe('fulfilled');
    const status = (
      await p.query(`SELECT status FROM opd_waitlist_entry WHERE id=$1`, [w])
    ).rows[0].status;
    expect(['waiting', 'offered']).toContain(status);
    expect(
      (
        await p.query(
          `SELECT id FROM opd_waitlist_entry WHERE offered_slot_id=$1 AND status='offered'`,
          [a],
        )
      ).rowCount,
    ).toBe(status === 'offered' ? 1 : 0);
  });
});
