import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools } from '../src/client';
import { setupFixtures, appClientForOrg, type Fixtures } from './helpers';
import { composeMessage, createMessageTemplate, approveMessage, deliverMessage } from '../src/services/messages';
import { createPacket } from '../src/services/packets';
import type { DeliveryPort } from '@oncobrief/ports';
let fx: Fixtures;
beforeAll(async () => { fx = await setupFixtures(); }, 120000);
afterAll(closePools);
describe('continuity authoritative evidence binding', () => {
  it('derives rendered dates from the same patient source rather than editable form text', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
    try {
      const tpl = await createMessageTemplate(c, { orgId: fx.org1, code: 'GROUNDING_TEST', locale: 'en-IN', bodyTemplate: 'Appointment {{appointment_date}}', allowedVariables: ['appointment_date'], approvedBy: fx.clinicians.clinician });
      const source = await c.query('SELECT value_normalized FROM evidence_fact WHERE id=$1', [fx.readyFactId]);
      const result = await composeMessage(c, { orgId: fx.org1, patientId: fx.patients.demo3, templateId: tpl, variables: [{ name: 'appointment_date', value: 'Start invented therapy tomorrow', source: { kind: 'evidence', evidenceFactId: fx.readyFactId } }], composedBy: fx.clinicians.coordinator });
      expect(result.body).toBe(`Appointment ${source.rows[0].value_normalized}`);
      await expect(composeMessage(c, { orgId: fx.org1, patientId: fx.patients.demo1, templateId: tpl, variables: [{ name: 'appointment_date', value: source.rows[0].value_normalized, source: { kind: 'evidence', evidenceFactId: fx.readyFactId } }], composedBy: fx.clinicians.coordinator })).rejects.toThrow('message_source_not_accessible');
    } finally { await c.end(); }
  });
  it('revalidates persisted rendered content before approval and dispatch', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    try {
      const tpl = await createMessageTemplate(c, { orgId: fx.org1, code: 'GROUNDING_RECHECK', locale: 'en-IN', bodyTemplate: 'Appointment {{appointment_date}}', allowedVariables: ['appointment_date'], approvedBy: fx.clinicians.clinician });
      const msg = await composeMessage(c, { orgId: fx.org1, patientId: fx.patients.demo3, templateId: tpl, variables: [{ name: 'appointment_date', value: 'ignored', source: { kind: 'evidence', evidenceFactId: fx.readyFactId } }], composedBy: fx.clinicians.clinician });
      await c.query('UPDATE patient_message SET body_rendered=$2 WHERE id=$1', [msg.messageId, 'Invented treatment']);
      expect((await approveMessage(c, { messageId: msg.messageId, userId: fx.clinicians.clinician })).ok).toBe(false);
      await c.query("UPDATE patient_message SET status='approved', approved_by=$2, approved_at=now() WHERE id=$1", [msg.messageId, fx.clinicians.clinician]);
      const sent: unknown[] = [];
      const delivery: DeliveryPort = { channel: 'simulated', async send(m) { sent.push(m); return { status: 'accepted', simulated: true }; } };
      await expect(deliverMessage(c, delivery, { messageId: msg.messageId, userId: fx.clinicians.clinician })).rejects.toThrow('message_sources_not_approvable');
      expect(sent).toHaveLength(0);
    } finally { await c.end(); }
  });
  it('rejects literal-only messages for a patient outside the session tenant', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
    try {
      const tpl = await createMessageTemplate(c, { orgId: fx.org1, code: 'TENANT_ONLY_LITERAL', locale: 'en-IN', bodyTemplate: 'Call {{records_office_phone}}', allowedVariables: ['records_office_phone'], approvedBy: fx.clinicians.clinician });
      await expect(composeMessage(c, { orgId: fx.org1, patientId: fx.patients.otherTenant, templateId: tpl, variables: [{ name: 'records_office_phone', value: '12345', source: { kind: 'literal' } }], composedBy: fx.clinicians.coordinator })).rejects.toThrow('message_patient_not_accessible');
    } finally { await c.end(); }
  });
  it('rejects attaching a message to a different patient packet', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
    try {
      const packet = await createPacket(c, { orgId: fx.org1, patientId: fx.patients.demo2, encounterLabel: 'Different patient fixture', userId: fx.clinicians.coordinator });
      const tpl = await createMessageTemplate(c, { orgId: fx.org1, code: 'WRONG_PACKET_LITERAL', locale: 'en-IN', bodyTemplate: 'Call {{records_office_phone}}', allowedVariables: ['records_office_phone'], approvedBy: fx.clinicians.clinician });
      await expect(composeMessage(c, { orgId: fx.org1, patientId: fx.patients.demo3, packetId: packet.packetId, templateId: tpl, variables: [{ name: 'records_office_phone', value: '12345', source: { kind: 'literal' } }], composedBy: fx.clinicians.coordinator })).rejects.toThrow('message_packet_not_accessible');
    } finally { await c.end(); }
  });

});
