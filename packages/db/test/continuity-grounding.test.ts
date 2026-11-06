import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools } from '../src/client';
import { setupFixtures, appClientForOrg, type Fixtures } from './helpers';
import { composeMessage, createMessageTemplate, approveMessage, deliverMessage, checkMessageGate, resolveLocalizedMessageText } from '../src/services/messages';
import { createPacket } from '../src/services/packets';
import { offerOpdSlot } from '../src/services/opd-flow';
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

  it('rejects ungrounded literal appointment_date not backed by active appointment or slot (safety regression)', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
    try {
      const tpl = await createMessageTemplate(c, {
        orgId: fx.org1,
        code: 'UNGROUNDED_APPT_DATE_TEST',
        locale: 'en-IN',
        bodyTemplate: 'Your appointment is on {{appointment_date}}.',
        allowedVariables: ['appointment_date'],
        approvedBy: fx.clinicians.clinician,
      });

      // Arbitrary date in 2099 where no slot or appointment exists for demo3
      await expect(
        composeMessage(c, {
          orgId: fx.org1,
          patientId: fx.patients.demo3,
          templateId: tpl,
          variables: [{ name: 'appointment_date', value: '2099-12-31 at 10:00', source: { kind: 'literal' } }],
          composedBy: fx.clinicians.coordinator,
        }),
      ).rejects.toThrow('message_source_not_accessible');
    } finally {
      await c.end();
    }
  });

  it('offerOpdSlot with notifyPatient: true creates a source-grounded message that passes checkMessageGate (TASK-01.04)', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
    try {
      const slot = await c.query<{ id: string }>(
        `INSERT INTO opd_appointment_slot(org_id,clinic_date,slot_start_time,slot_end_time,room_label,clinic_key,status)
         VALUES($1,'2030-02-15','14:00','14:30','Room 402 - Medical Oncology','med-onco','vacant') RETURNING id`,
        [fx.org1],
      );
      const wait = await c.query<{ id: string }>(
        `INSERT INTO opd_waitlist_entry(org_id,patient_id,requested_date,clinic_key)
         VALUES($1,$2,'2030-02-15','med-onco') RETURNING id`,
        [fx.org1, fx.patients.demo3],
      );

      const res = await offerOpdSlot(c, {
        orgId: fx.org1,
        slotId: slot.rows[0]!.id,
        waitlistEntryId: wait.rows[0]!.id,
        actorId: fx.clinicians.coordinator,
        requestId: 'opd-grounding-test-' + Date.now(),
        notifyPatient: true,
      });

      expect(res.offered).toBe(true);
      expect(res.offerMessageId).toBeTruthy();

      const gate = await checkMessageGate(c, res.offerMessageId!);
      expect(gate.ok).toBe(true);
      expect(gate.blockers).toEqual([]);

      // Test resolveLocalizedMessageText on this grounded OPD offer message
      const localizedTa = await resolveLocalizedMessageText(c, res.offerMessageId!, 'ta-IN');
      expect(localizedTa).not.toBeNull();
      expect(localizedTa?.locale).toBe('ta-IN');
      expect(localizedTa?.text).toContain('2030-02-15');
      expect(localizedTa?.text).toContain('OPD');
    } finally {
      await c.end();
    }
  });

  it('resolveLocalizedMessageText resolves multi-locale templates and rejects ungrounded or withdrawn messages (TASK-01.04)', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    try {
      // Find template for appointment_reminder
      const tplRes = await c.query<{ id: string }>(
        `SELECT id FROM message_template WHERE org_id = $1 AND code = 'appointment_reminder' AND locale IN ('en', 'en-IN') LIMIT 1`,
        [fx.org1],
      );
      let tplId = tplRes.rows[0]?.id;
      if (!tplId) {
        tplId = await createMessageTemplate(c, {
          orgId: fx.org1,
          code: 'appointment_reminder',
          locale: 'en-IN',
          bodyTemplate: 'Your appointment is on {{appointment_date}} at {{appointment_location}}. Please bring the documents listed in your records office letter. For help call {{records_office_phone}}.',
          allowedVariables: ['appointment_date', 'appointment_location', 'records_office_phone'],
          approvedBy: fx.clinicians.clinician,
        });
      }

      const composed = await composeMessage(c, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        templateId: tplId,
        variables: [
          { name: 'appointment_date', value: 'ignored', source: { kind: 'evidence', evidenceFactId: fx.readyFactId } },
          { name: 'appointment_location', value: 'Main Cancer OPD', source: { kind: 'literal' } },
          { name: 'records_office_phone', value: '+91-80-26995000', source: { kind: 'literal' } },
        ],
        composedBy: fx.clinicians.coordinator,
      });

      const approved = await approveMessage(c, { messageId: composed.messageId, userId: fx.clinicians.clinician });
      expect(approved.ok).toBe(true);

      const resolvedHi = await resolveLocalizedMessageText(c, composed.messageId, 'hi-IN');
      expect(resolvedHi).not.toBeNull();
      expect(resolvedHi?.locale).toBe('hi-IN');
      expect(resolvedHi?.text).toContain('अपॉइंटमेंट');
      expect(resolvedHi?.text).toContain('Main Cancer OPD');

      const resolvedTa = await resolveLocalizedMessageText(c, composed.messageId, 'ta-IN');
      expect(resolvedTa).not.toBeNull();
      expect(resolvedTa?.locale).toBe('ta-IN');
      expect(resolvedTa?.text).toContain('மருத்துவ சந்திப்பு');
      expect(resolvedTa?.text).toContain('Main Cancer OPD');

      // Withdrawn message should return null
      await c.query(`UPDATE patient_message SET status = 'withdrawn' WHERE id = $1`, [composed.messageId]);
      const withdrawnResolved = await resolveLocalizedMessageText(c, composed.messageId, 'hi-IN');
      expect(withdrawnResolved).toBeNull();
    } finally {
      await c.end();
    }
  });

});
