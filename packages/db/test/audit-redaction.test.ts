import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import { appendAuditEvent, redactMetadata } from '../src/services/audit';
import { listPatientAudit } from '../src/services/patients';
import { createStudioArtifact } from '../src/services/studio';
import { registerCaregiver } from '../src/services/caregivers';

let fx: Fixtures;

async function coordinatorClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
}

async function clinicianClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
}

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Audit Redaction Hardening and PHI Defense', () => {
  it('redacts sensitive fields: phone numbers, reasons, filenames, caregiver names, ABHA IDs, markdown bodies, and audio payloads', () => {
    const raw = {
      template_id: 'test-123',
      phone: '+91 99999 88888',
      phoneNumber: '9876543210',
      patientAbha: 'patient@sbx',
      abhaNumber: '91-1234-5678-9012',
      markdownBody: '# Confidential Clinical Referral Body',
      reason: 'Patient has high clinical toxicity and pain',
      operational_reason: 'Doctor absent',
      filename: 'confidential_pathology_report_ananya.pdf',
      caregiver_name: 'Priya Sharma',
      transcript: 'Full spoken transcript with clinical details',
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      nested: {
        quote: 'HER2 3+ strongly positive',
        normalKey: 'permitted_value',
      },
    };

    const cleaned = redactMetadata(raw);

    expect(cleaned.template_id).toBe('test-123');
    expect(cleaned.phone).toBe('<redacted>');
    expect(cleaned.phoneNumber).toBe('<redacted>');
    expect(cleaned.patientAbha).toBe('<redacted>');
    expect(cleaned.abhaNumber).toBe('<redacted>');
    expect(cleaned.markdownBody).toBe('<redacted>');
    expect(cleaned.reason).toBe('<redacted>');
    expect(cleaned.operational_reason).toBe('<redacted>');
    expect(cleaned.filename).toBe('<redacted>');
    expect(cleaned.caregiver_name).toBe('<redacted>');
    expect(cleaned.transcript).toBe('<redacted>');
    expect(cleaned.audioBase64).toBe('<redacted>');

    const nested = cleaned.nested as Record<string, unknown>;
    expect(nested.quote).toBe('<redacted>');
    expect(nested.normalKey).toBe('permitted_value');
  });

  it('redacts metadata when persisting appendAuditEvent into the database without breaking the hash chain', async () => {
    const c = await coordinatorClient();
    try {
      const eventId = await appendAuditEvent(c, {
        orgId: fx.org1,
        actor: { userId: fx.clinicians.coordinator, role: 'coordinator' },
        action: 'caregiver.registered',
        entityKind: 'caregiver_contact',
        entityId: '00000000-0000-0000-0000-000000000001',
        outcome: 'success',
        metadata: {
          phone: '+91 98765 00000',
          reason: 'Confidential clinical discussion',
          safe_metric: 42,
        },
      });

      const row = await c.query<{ metadata_json: Record<string, unknown>; entry_hash: Buffer }>(
        'SELECT metadata_json, entry_hash FROM audit_event WHERE id = $1',
        [eventId],
      );

      expect(row.rowCount).toBe(1);
      const meta = row.rows[0]!.metadata_json;
      expect(meta.phone).toBe('<redacted>');
      expect(meta.reason).toBe('<redacted>');
      expect(meta.safe_metric).toBe(42);
      expect(row.rows[0]!.entry_hash).toBeDefined();
    } finally {
      await c.end();
    }
  });

  it('includes studio_artifact and caregiver_contact audit events in listPatientAudit for Scene 9 audit review', async () => {
    const clin = await clinicianClient();
    const coord = await coordinatorClient();
    try {
      const studioDraft = await createStudioArtifact(clin, {
        orgId: fx.org1,
        patientId: fx.patients.demo1,
        artifactKind: 'referral_letter',
        title: 'Audit Trail Verification Referral',
        markdownBody: '# Referral\nVerified [E1].',
        citedFactIds: [],
        citedGuidelineIds: [],
        createdBy: fx.clinicians.clinician,
      });

      const cg = await registerCaregiver(coord, {
        orgId: fx.org1,
        patientId: fx.patients.demo1,
        fullName: 'Audit Caregiver',
        relationship: 'Sibling',
        phoneNumber: '+91 98000 11111',
        preferredLocale: 'en-IN',
        prefersVoiceNote: false,
        syncReminders: true,
        consentRecordedBy: fx.clinicians.coordinator,
      });

      const auditEvents = await listPatientAudit(clin, fx.patients.demo1);
      expect(auditEvents.some((e) => e.entityId === studioDraft.id && e.action === 'studio.draft_created')).toBe(true);
      expect(auditEvents.some((e) => e.entityId === cg.id && e.action === 'caregiver.registered')).toBe(true);
    } finally {
      await clin.end();
      await coord.end();
    }
  });
});
