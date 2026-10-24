import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import {
  createMessageTemplate,
  composeMessage,
  approveMessage,
  deliverMessage,
  recordMessageAttendance,
  getMessage,
} from '../src/services/messages';
import { SimulatedDeliveryAdapter } from '@oncobrief/adapters';

let fx: Fixtures;
let templateId: string;
let messageId: string;
let deliveredMessageId: string;

async function coordinatorClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
}

async function clinicianClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
}

beforeAll(async () => {
  fx = await setupFixtures();
  const c = await coordinatorClient();
  try {
    templateId = await createMessageTemplate(c, {
      orgId: fx.org1,
      code: 'ATTEND_TEST_TPL',
      locale: 'en-IN',
      bodyTemplate: 'Dear patient, your oncology appointment is on {{appointment_date}} at {{appointment_location}}.',
      allowedVariables: ['appointment_date', 'appointment_location'],
      approvedBy: fx.clinicians.clinician,
    });

    // Compose a draft
    const comp = await composeMessage(c, {
      orgId: fx.org1,
      patientId: fx.patients.demo3,
      templateId,
      variables: [
        { name: 'appointment_date', value: '2026-11-10', source: { kind: 'evidence', evidenceFactId: fx.readyFactId } },
        { name: 'appointment_location', value: 'Regional Cancer Institute', source: { kind: 'literal' } },
      ],
      composedBy: fx.clinicians.coordinator,
    });
    messageId = comp.messageId;

    // Compose a second message, approve it, and deliver it
    const comp2 = await composeMessage(c, {
      orgId: fx.org1,
      patientId: fx.patients.demo3,
      templateId,
      variables: [
        { name: 'appointment_date', value: '2026-11-10', source: { kind: 'evidence', evidenceFactId: fx.readyFactId } },
        { name: 'appointment_location', value: 'Regional Cancer Institute', source: { kind: 'literal' } },
      ],
      composedBy: fx.clinicians.coordinator,
    });
    deliveredMessageId = comp2.messageId;
  } finally {
    await c.end();
  }

  // Approve and deliver deliveredMessageId
  const cl = await clinicianClient();
  try {
    await approveMessage(cl, { messageId: deliveredMessageId, userId: fx.clinicians.clinician });
    const delivery = new SimulatedDeliveryAdapter();
    await deliverMessage(cl, delivery, {
      messageId: deliveredMessageId,
      userId: fx.clinicians.clinician,
    });
  } finally {
    await cl.end();
  }
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Administrative Attendance Confirmation Service', () => {
  it('rejects recording attendance on an undelivered draft message', async () => {
    const c = await coordinatorClient();
    try {
      await expect(
        recordMessageAttendance(c, {
          orgId: fx.org1,
          messageId,
          status: 'confirmed_attendance',
          channel: 'sms',
          responder: 'patient',
          actorUserId: fx.clinicians.coordinator,
        }),
      ).rejects.toThrow('message_not_delivered');
    } finally {
      await c.end();
    }
  });

  it('records attendance confirmation on a delivered message with audit logging', async () => {
    const c = await coordinatorClient();
    try {
      const updated = await recordMessageAttendance(c, {
        orgId: fx.org1,
        messageId: deliveredMessageId,
        status: 'confirmed_attendance',
        channel: 'sms',
        responder: 'patient',
        note: 'Confirmed arrival for morning slot',
        actorUserId: fx.clinicians.coordinator,
      });

      expect(updated.attendanceStatus).toBe('confirmed_attendance');
      expect(updated.attendanceRecordedAt).toBeInstanceOf(Date);
      expect(updated.attendanceChannel).toBe('sms');
      expect(updated.attendanceResponder).toBe('patient');
      expect(updated.attendanceNote).toBe('Confirmed arrival for morning slot');

      // Verify audit event
      const auditRes = await c.query(
        `SELECT action, outcome FROM audit_event WHERE entity_id = $1 AND action = 'message.attendance_recorded'`,
        [deliveredMessageId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].outcome).toBe('success');
    } finally {
      await c.end();
    }
  });

  it('records cannot_attend status requiring coordinator assistance without altering medical orders', async () => {
    const c = await coordinatorClient();
    try {
      const updated = await recordMessageAttendance(c, {
        orgId: fx.org1,
        messageId: deliveredMessageId,
        status: 'cannot_attend',
        channel: 'whatsapp',
        responder: 'caregiver',
        note: 'Patient unable to travel due to fever; coordinator assistance requested',
        actorUserId: fx.clinicians.coordinator,
      });

      expect(updated.attendanceStatus).toBe('cannot_attend');
      expect(updated.attendanceResponder).toBe('caregiver');
      expect(updated.attendanceChannel).toBe('whatsapp');

      // Verify the patient record was not altered autonomously
      const msg = await getMessage(c, deliveredMessageId);
      expect(msg?.status).toBe('delivered');
    } finally {
      await c.end();
    }
  });
});
