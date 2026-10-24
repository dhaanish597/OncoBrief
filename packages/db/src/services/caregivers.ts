import type { Querier } from '../client';
import { appendAuditEvent } from './audit';

export interface CaregiverContactRecord {
  id: string;
  orgId: string;
  patientId: string;
  fullName: string;
  relationship: string;
  phoneNumber: string;
  preferredLocale: string;
  prefersVoiceNote: boolean;
  syncReminders: boolean;
  consentRecordedAt: Date;
  consentRecordedBy: string;
  isActive: boolean;
  revokedAt: Date | null;
  revokedBy: string | null;
}

interface CaregiverRow {
  id: string;
  org_id: string;
  patient_id: string;
  full_name: string;
  relationship: string;
  phone_number: string;
  preferred_locale: string;
  prefers_voice_note: boolean;
  sync_reminders: boolean;
  consent_recorded_at: Date;
  consent_recorded_by: string;
  is_active: boolean;
  revoked_at: Date | null;
  revoked_by: string | null;
}

function mapCaregiverRow(r: CaregiverRow): CaregiverContactRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    patientId: r.patient_id,
    fullName: r.full_name,
    relationship: r.relationship,
    phoneNumber: r.phone_number,
    preferredLocale: r.preferred_locale,
    prefersVoiceNote: r.prefers_voice_note,
    syncReminders: r.sync_reminders,
    consentRecordedAt: r.consent_recorded_at,
    consentRecordedBy: r.consent_recorded_by,
    isActive: r.is_active,
    revokedAt: r.revoked_at,
    revokedBy: r.revoked_by,
  };
}

export interface RegisterCaregiverInput {
  orgId: string;
  patientId: string;
  fullName: string;
  relationship: string;
  phoneNumber: string;
  preferredLocale?: string;
  prefersVoiceNote?: boolean;
  syncReminders?: boolean;
  consentRecordedBy: string;
}

export async function registerCaregiver(
  q: Querier,
  input: RegisterCaregiverInput,
): Promise<CaregiverContactRecord> {
  const fullName = input.fullName.trim();
  const relationship = input.relationship.trim();
  const phoneNumber = input.phoneNumber.trim();
  const preferredLocale = (input.preferredLocale ?? 'hi-IN').trim();
  const prefersVoiceNote = input.prefersVoiceNote ?? true;
  const syncReminders = input.syncReminders ?? true;

  if (!fullName) throw new Error('caregiver_name_required');
  if (!relationship) throw new Error('caregiver_relationship_required');
  if (!phoneNumber) throw new Error('caregiver_phone_required');

  const res = await q.query<CaregiverRow>(
    `INSERT INTO caregiver_contact
       (org_id, patient_id, full_name, relationship, phone_number, preferred_locale,
        prefers_voice_note, sync_reminders, consent_recorded_by, consent_recorded_at, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), true)
     RETURNING *`,
    [
      input.orgId,
      input.patientId,
      fullName,
      relationship,
      phoneNumber,
      preferredLocale,
      prefersVoiceNote,
      syncReminders,
      input.consentRecordedBy,
    ],
  );

  const caregiver = mapCaregiverRow(res.rows[0]!);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.consentRecordedBy, role: null },
    action: 'caregiver.registered',
    entityKind: 'caregiver_contact',
    entityId: caregiver.id,
    outcome: 'success',
    metadata: {
      patient_id: input.patientId,
      relationship,
      preferred_locale: preferredLocale,
      prefers_voice_note: prefersVoiceNote,
      sync_reminders: syncReminders,
    },
  });

  return caregiver;
}

export async function getCaregiver(
  q: Querier,
  orgId: string,
  caregiverId: string,
): Promise<CaregiverContactRecord | null> {
  const res = await q.query<CaregiverRow>(
    `SELECT * FROM caregiver_contact WHERE id = $1 AND org_id = $2`,
    [caregiverId, orgId],
  );
  if (res.rowCount === 0) return null;
  return mapCaregiverRow(res.rows[0]!);
}

export async function listCaregivers(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<CaregiverContactRecord[]> {
  const res = await q.query<CaregiverRow>(
    `SELECT * FROM caregiver_contact WHERE patient_id = $1 AND org_id = $2 ORDER BY consent_recorded_at DESC`,
    [patientId, orgId],
  );
  return res.rows.map(mapCaregiverRow);
}

export interface UpdateCaregiverPreferencesInput {
  orgId: string;
  caregiverId: string;
  preferredLocale?: string;
  prefersVoiceNote?: boolean;
  syncReminders?: boolean;
  actorUserId: string;
}

export async function updateCaregiverPreferences(
  q: Querier,
  input: UpdateCaregiverPreferencesInput,
): Promise<CaregiverContactRecord> {
  const cur = await q.query<CaregiverRow>(
    `SELECT * FROM caregiver_contact WHERE id = $1 AND org_id = $2 FOR UPDATE`,
    [input.caregiverId, input.orgId],
  );
  if (cur.rowCount === 0) throw new Error('caregiver_not_found');
  const row = cur.rows[0]!;
  if (!row.is_active || row.revoked_at !== null) {
    throw new Error('caregiver_revoked_or_inactive');
  }

  const preferredLocale = input.preferredLocale !== undefined ? input.preferredLocale.trim() : row.preferred_locale;
  const prefersVoiceNote = input.prefersVoiceNote !== undefined ? input.prefersVoiceNote : row.prefers_voice_note;
  const syncReminders = input.syncReminders !== undefined ? input.syncReminders : row.sync_reminders;

  const res = await q.query<CaregiverRow>(
    `UPDATE caregiver_contact
     SET preferred_locale = $3,
         prefers_voice_note = $4,
         sync_reminders = $5
     WHERE id = $1 AND org_id = $2
     RETURNING *`,
    [input.caregiverId, input.orgId, preferredLocale, prefersVoiceNote, syncReminders],
  );

  const updated = mapCaregiverRow(res.rows[0]!);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorUserId, role: null },
    action: 'caregiver.updated',
    entityKind: 'caregiver_contact',
    entityId: input.caregiverId,
    outcome: 'success',
    metadata: {
      preferred_locale: preferredLocale,
      prefers_voice_note: prefersVoiceNote,
      sync_reminders: syncReminders,
    },
  });

  return updated;
}

export interface RevokeCaregiverConsentInput {
  orgId: string;
  caregiverId: string;
  actorUserId: string;
  reason?: string;
}

export async function revokeCaregiverConsent(
  q: Querier,
  input: RevokeCaregiverConsentInput,
): Promise<CaregiverContactRecord> {
  const cur = await q.query<CaregiverRow>(
    `SELECT * FROM caregiver_contact WHERE id = $1 AND org_id = $2 FOR UPDATE`,
    [input.caregiverId, input.orgId],
  );
  if (cur.rowCount === 0) throw new Error('caregiver_not_found');

  const res = await q.query<CaregiverRow>(
    `UPDATE caregiver_contact
     SET is_active = false,
         sync_reminders = false,
         revoked_at = now(),
         revoked_by = $3
     WHERE id = $1 AND org_id = $2
     RETURNING *`,
    [input.caregiverId, input.orgId, input.actorUserId],
  );

  const revoked = mapCaregiverRow(res.rows[0]!);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorUserId, role: null },
    action: 'caregiver.revoked',
    entityKind: 'caregiver_contact',
    entityId: input.caregiverId,
    outcome: 'success',
    metadata: {
      reason: input.reason ?? 'Caregiver consent revoked by staff',
    },
  });

  return revoked;
}
