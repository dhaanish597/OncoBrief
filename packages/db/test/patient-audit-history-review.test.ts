import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools, withTenant } from '../src/client';
import { setupFixtures, type Fixtures } from './helpers';
import { updateOpdSlotStatus } from '../src/services/opd-flow';
import { listPatientAudit } from '../src/services/patients';
let fx: Fixtures;
beforeAll(async()=>{fx=await setupFixtures();},120_000);
afterAll(closePools);
it('keeps patient OPD audit history after staff release clears the slot patient', async()=>{
  await withTenant({orgId:fx.org1,userId:fx.clinicians.clinician,role:'clinician'},async q=>{
    const row=(await q.query<{id:string}>(`SELECT id FROM opd_appointment_slot WHERE patient_id=$1 AND status='scheduled' LIMIT 1`,[fx.patients.demo1])).rows[0]!;
    for(const [expectedStatus,toStatus] of [['scheduled','cancelled'],['cancelled','vacant']]){
      await updateOpdSlotStatus(q,{orgId:fx.org1,actorId:fx.clinicians.clinician,slotId:row.id,requestId:randomUUID(),expectedStatus:expectedStatus!,toStatus:toStatus!,reason:'Synthetic staff release review'});
    }
    const audit=await listPatientAudit(q,fx.patients.demo1);
    expect(audit.some(e=>e.entityId===row.id && e.action==='opd.status_changed')).toBe(true);
  });
});
