import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * Demo-organization seeding for the admin Lambda (ADR 0015, Phase 24).
 *
 * Synthetic data only. The password hash below is for the publicly documented
 * demo password (`oncobrief-demo`); it is an argon2id hash, not a secret, and
 * matches `ARGON2_OPTIONS` in `packages/db/src/services/auth.ts`.
 *
 * The RDS master user is the table owner and the tables are `FORCE ROW LEVEL
 * SECURITY`, so seeding sets the tenant context explicitly (`app.org_id`,
 * `app.user_id`) inside the transaction. This is correct whether or not the
 * owner happens to bypass RLS, and it keeps the same policy path the runtime
 * role uses.
 */

export const DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$FuY7eSM/OJk7qoDbkGo3Nw$BxpMwO528eNavsxZZkbzbQBt6KyDDJ9hDBUiTfCOiEY';

const ROLE_USERS: { email: string; name: string; role: string }[] = [
  { email: 'dr.rao@rci.demo', name: 'Dr. Meera Rao', role: 'clinician' },
  { email: 'coord.anita@rci.demo', name: 'Anita Joseph', role: 'coordinator' },
  { email: 'records.deepak@rci.demo', name: 'Deepak Nair', role: 'records_officer' },
  { email: 'admin.sys@rci.demo', name: 'System Admin', role: 'org_admin' },
  { email: 'auditor.k@rci.demo', name: 'Kavya Iyer', role: 'auditor' },
];

export interface SeedResult {
  orgId: string;
  orgSlug: string;
  users: { email: string; role: string }[];
  patientId: string;
  patientCode: string;
}

async function setContext(client: Pool, orgId: string, userId: string): Promise<void> {
  await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
  await client.query(`SELECT set_config('app.role', $1, true)`, ['org_admin']);
}

export async function seedDemoOrganization(
  client: Pool,
  opts: { orgSlug: string; orgName: string },
): Promise<SeedResult> {
  await client.query('BEGIN');
  try {
    // A fresh org id is chosen up front so the organization policy
    // (`id = app.org_id`) admits the insert.
    const orgId = randomUUID();
    await setContext(client, orgId, orgId);
    await client.query(
      `INSERT INTO organization (id, slug, name, is_demo_fixture)
       VALUES ($1,$2,$3,true) ON CONFLICT (slug) DO NOTHING`,
      [orgId, opts.orgSlug, opts.orgName],
    );
    const actualOrg = (
      await client.query<{ id: string }>(`SELECT id FROM organization WHERE slug = $1`, [opts.orgSlug])
    ).rows[0]!;
    const resolvedOrgId = actualOrg.id;

    const users: { email: string; role: string }[] = [];
    let officerId = '';
    for (const u of ROLE_USERS) {
      const existing = (
        await client.query<{ id: string }>(`SELECT id FROM app_user WHERE lower(email) = lower($1)`, [u.email])
      ).rows[0]?.id;
      const userId = existing ?? randomUUID();
      if (!existing) {
        // app_user WITH CHECK requires `id = app.user_id`.
        await setContext(client, resolvedOrgId, userId);
        await client.query(
          `INSERT INTO app_user (id, email, display_name, password_hash, is_demo_fixture)
           VALUES ($1,$2,$3,$4,true)`,
          [userId, u.email, u.name, DEMO_PASSWORD_HASH],
        );
      }
      await setContext(client, resolvedOrgId, userId);
      await client.query(
        `INSERT INTO membership (org_id, user_id, role, is_demo_fixture)
         VALUES ($1,$2,$3,true) ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [resolvedOrgId, userId, u.role],
      );
      users.push({ email: u.email, role: u.role });
      if (u.role === 'records_officer') officerId = userId;
    }
    await setContext(client, resolvedOrgId, officerId);

    // Checklist template: human-authored administrative requirements.
    let tpl = (
      await client.query<{ id: string }>(
        `SELECT id FROM checklist_template WHERE org_id = $1 AND code = 'new_patient_intake' AND version = 1`,
        [resolvedOrgId],
      )
    ).rows[0]?.id;
    if (!tpl) {
      tpl = (
        await client.query<{ id: string }>(
          `INSERT INTO checklist_template (org_id, code, name, version, care_context, authored_by)
           VALUES ($1,'new_patient_intake','New patient intake',1,'new_patient_intake',$2) RETURNING id`,
          [resolvedOrgId, officerId],
        )
      ).rows[0]!.id;
      const items: [string, string, string, string, number, string][] = [
        ['referral_note', 'Referral note', 'referral_letter', 'required', 1, 'Records office requires the referral note for new-patient intake.'],
        ['pathology', 'Pathology report', 'pathology_report', 'required', 2, 'Records office requires the pathology report on file before the consultation.'],
        ['radiology', 'Radiology report', 'radiology_report', 'expected', 3, 'Radiology reports are expected to be present for surgical review.'],
        ['insurance_authorization', 'Insurance authorization', 'insurance_authorization', 'required', 4, 'Insurance authorization is administratively required for a new-patient intake packet at this hospital.'],
        ['consent', 'Consent form', 'consent_form', 'expected', 5, 'A consent form is expected but may be completed on the day.'],
      ];
      for (const [code, label, docType, kind, ordinal, rationale] of items) {
        await client.query(
          `INSERT INTO checklist_item (org_id, template_id, code, label, required_document_type, requirement_kind, ordinal, rationale)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [resolvedOrgId, tpl, code, label, docType, kind, ordinal, rationale],
        );
      }
    }

    const patientCode = 'DEMO-ONCO-001';
    let patientId = (
      await client.query<{ id: string }>(
        `SELECT id FROM patient WHERE org_id = $1 AND demo_code = $2`,
        [resolvedOrgId, patientCode],
      )
    ).rows[0]?.id;
    if (!patientId) {
      patientId = (
        await client.query<{ id: string }>(
          `INSERT INTO patient (org_id, demo_code, display_name, is_demo_fixture)
           VALUES ($1,$2,'DEMO-ONCO-001 — Synthetic Demo Patient',true) RETURNING id`,
          [resolvedOrgId, patientCode],
        )
      ).rows[0]!.id;
      await client.query(
        `INSERT INTO patient_identifier (org_id, patient_id, system, value)
         VALUES ($1,$2,'mrn','SYN-ONCO-0001'), ($1,$2,'demo',$3)
         ON CONFLICT DO NOTHING`,
        [resolvedOrgId, patientId, patientCode],
      );
    }

    await client.query('COMMIT');
    return { orgId: resolvedOrgId, orgSlug: opts.orgSlug, users, patientId, patientCode };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
