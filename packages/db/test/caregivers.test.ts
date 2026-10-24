import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import {
  registerCaregiver,
  updateCaregiverPreferences,
  revokeCaregiverConsent,
  getCaregiver,
  listCaregivers,
} from '../src/services/caregivers';
import {
  createMessageTemplate,
  composeMessage,
  approveMessage,
  deliverMessage,
} from '../src/services/messages';
import { SimulatedDeliveryAdapter } from '@oncobrief/adapters';

let fx: Fixtures;
let caregiverId: string;

async function coordinatorClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
}

async function clinicianClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
}

async function org2Client(): Promise<Client> {
  return appClientForOrg(fx.org2, null, null);
}

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Consented Caregiver Network Service', () => {
  it('registers a new consented family caregiver with full consent provenance and audit', async () => {
    const c = await coordinatorClient();
    try {
      const caregiver = await registerCaregiver(c, {
        orgId: fx.org1,
        patientId: fx.patients.demo1,
        fullName: 'Sunita Sharma',
        relationship: 'Daughter / Primary Caregiver',
        phoneNumber: '+91 98765 43210',
        preferredLocale: 'hi-IN',
        prefersVoiceNote: true,
        syncReminders: true,
        consentRecordedBy: fx.clinicians.coordinator,
      });

      caregiverId = caregiver.id;
      expect(caregiver.id).toBeDefined();
      expect(caregiver.fullName).toBe('Sunita Sharma');
      expect(caregiver.relationship).toBe('Daughter / Primary Caregiver');
      expect(caregiver.phoneNumber).toBe('+91 98765 43210');
      expect(caregiver.preferredLocale).toBe('hi-IN');
      expect(caregiver.prefersVoiceNote).toBe(true);
      expect(caregiver.syncReminders).toBe(true);
      expect(caregiver.isActive).toBe(true);
      expect(caregiver.consentRecordedBy).toBe(fx.clinicians.coordinator);
      expect(caregiver.consentRecordedAt).toBeInstanceOf(Date);
      expect(caregiver.revokedAt).toBeNull();

      // Check audit event
      const auditRes = await c.query(
        `SELECT action, outcome FROM audit_event WHERE entity_id = $1 AND action = 'caregiver.registered'`,
        [caregiverId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].outcome).toBe('success');
    } finally {
      await c.end();
    }
  });

  it('enforces tenant isolation: another org cannot view or access the caregiver', async () => {
    const c2 = await org2Client();
    try {
      const caregiver = await getCaregiver(c2, fx.org2, caregiverId);
      expect(caregiver).toBeNull();

      const list = await listCaregivers(c2, fx.org2, fx.patients.demo1);
      expect(list).toHaveLength(0);
    } finally {
      await c2.end();
    }
  });

  it('updates caregiver preferences and records audit trail', async () => {
    const c = await coordinatorClient();
    try {
      const updated = await updateCaregiverPreferences(c, {
        orgId: fx.org1,
        caregiverId,
        preferredLocale: 'ta-IN',
        prefersVoiceNote: true,
        syncReminders: false,
        actorUserId: fx.clinicians.coordinator,
      });

      expect(updated.preferredLocale).toBe('ta-IN');
      expect(updated.syncReminders).toBe(false);

      const auditRes = await c.query(
        `SELECT action, outcome FROM audit_event WHERE entity_id = $1 AND action = 'caregiver.updated'`,
        [caregiverId],
      );
      expect(auditRes.rowCount).toBeGreaterThan(0);
    } finally {
      await c.end();
    }
  });

  it('revokes caregiver consent: marks inactive, sets revoked_at and revoked_by, and logs audit', async () => {
    const c = await coordinatorClient();
    try {
      const revoked = await revokeCaregiverConsent(c, {
        orgId: fx.org1,
        caregiverId,
        actorUserId: fx.clinicians.coordinator,
        reason: 'Patient requested caregiver notification withdrawal',
      });

      expect(revoked.isActive).toBe(false);
      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(revoked.revokedBy).toBe(fx.clinicians.coordinator);

      // Verify cannot update preferences on revoked caregiver
      await expect(
        updateCaregiverPreferences(c, {
          orgId: fx.org1,
          caregiverId,
          preferredLocale: 'bn-IN',
          prefersVoiceNote: false,
          syncReminders: true,
          actorUserId: fx.clinicians.coordinator,
        }),
      ).rejects.toThrow('caregiver_revoked_or_inactive');

      // Verify audit trail for revocation
      const auditRes = await c.query(
        `SELECT action, outcome FROM audit_event WHERE entity_id = $1 AND action = 'caregiver.revoked'`,
        [caregiverId],
      );
      expect(auditRes.rowCount).toBe(1);
      expect(auditRes.rows[0].outcome).toBe('success');
    } finally {
      await c.end();
    }
  });

  it('synchronizes reminder dispatches to active consented caregivers and sends zero dispatches after revocation', async () => {
    const coord = await coordinatorClient();
    const clin = await clinicianClient();
    try {
      const cg = await registerCaregiver(coord, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        fullName: 'Vikram Verma',
        relationship: 'Spouse',
        phoneNumber: '+91 98111 22333',
        preferredLocale: 'hi-IN',
        prefersVoiceNote: true,
        syncReminders: true,
        consentRecordedBy: fx.clinicians.coordinator,
      });

      const tplId = await createMessageTemplate(coord, {
        orgId: fx.org1,
        code: 'CG_SYNC_TEST',
        locale: 'en-IN',
        bodyTemplate: 'Appointment on {{appointment_date}}.',
        allowedVariables: ['appointment_date'],
        approvedBy: fx.clinicians.clinician,
      });

      // First message while caregiver is active & synced
      const msg1 = await composeMessage(coord, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        templateId: tplId,
        variables: [
          {
            name: 'appointment_date',
            value: '2026-11-15',
            source: { kind: 'evidence', evidenceFactId: fx.readyFactId },
          },
        ],
        composedBy: fx.clinicians.coordinator,
      });
      await approveMessage(clin, { messageId: msg1.messageId, userId: fx.clinicians.clinician });
      const activeBefore = (await listCaregivers(coord, fx.org1, fx.patients.demo3))
        .filter((caregiver) => caregiver.isActive && !caregiver.revokedAt && caregiver.syncReminders);
      const delivery1 = new SimulatedDeliveryAdapter();
      const send1 = vi.spyOn(delivery1, 'send');
      const res1 = await deliverMessage(clin, delivery1, {
        messageId: msg1.messageId,
        userId: fx.clinicians.clinician,
      });
      expect(res1.syncedCaregiverCount).toBe(activeBefore.length);
      expect(send1).toHaveBeenCalledTimes(activeBefore.length + 1);
      expect(send1.mock.calls.map(([message]) => message.recipientRef)).toContain(`caregiver:${cg.id}`);

      // Revoke caregiver consent
      await revokeCaregiverConsent(coord, {
        orgId: fx.org1,
        caregiverId: cg.id,
        actorUserId: fx.clinicians.coordinator,
        reason: 'Caregiver consent withdrawn before next cycle',
      });

      // Second message after caregiver consent revocation -> zero caregiver dispatches
      const msg2 = await composeMessage(coord, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        templateId: tplId,
        variables: [
          {
            name: 'appointment_date',
            value: '2026-11-15',
            source: { kind: 'evidence', evidenceFactId: fx.readyFactId },
          },
        ],
        composedBy: fx.clinicians.coordinator,
      });
      await approveMessage(clin, { messageId: msg2.messageId, userId: fx.clinicians.clinician });
      const delivery2 = new SimulatedDeliveryAdapter();
      const send2 = vi.spyOn(delivery2, 'send');
      const res2 = await deliverMessage(clin, delivery2, {
        messageId: msg2.messageId,
        userId: fx.clinicians.clinician,
      });
      expect(res2.syncedCaregiverCount).toBe(activeBefore.length - 1);
      expect(send2).toHaveBeenCalledTimes(activeBefore.length);
      expect(send2.mock.calls.map(([message]) => message.recipientRef)).not.toContain(`caregiver:${cg.id}`);
    } finally {
      await coord.end();
      await clin.end();
    }
  });
});
