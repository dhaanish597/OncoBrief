import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getSecretJson, S3StorageAdapter } from '@oncobrief/adapters';
import {
  applyMigrationList,
  correctEvidence,
  rejectEvidence,
  reserveDocumentForUpload,
  storageKeyFor,
  verifyEvidence,
} from '@oncobrief/db/worker';
import { BUNDLED_MIGRATIONS } from './bundled-migrations';
import { seedDemoOrganization } from './admin-seed';
import { buildSyntheticPdf } from './fixture-pdf';

/**
 * Admin Lambda entry point (ADR 0015).
 *
 * Runs inside the VPC so it can reach the private RDS instance and S3. Invoked
 * manually with `aws lambda invoke`. It exists so a real end-to-end run can be
 * driven without exposing the database or installing a bastion:
 *
 *   { "action": "migrate" }
 *   { "action": "seed-demo", "orgSlug": "demo", "orgName": "Demo Organization" }
 *   { "action": "e2e", "orgSlug": "demo" }         # reserve + upload synthetic PDF
 *   { "action": "document-status", "orgSlug": "demo", "documentId": "..." }
 *   { "action": "evidence", "orgSlug": "demo", "patientCode": "DEMO-ONCO-001" }
 *   { "action": "probe" }                          # RLS / auth diagnostics
 *   { "action": "info", "orgSlug": "demo" }
 *
 * The RDS master credential is read from Secrets Manager at invocation time; it
 * is never passed in the payload, written to a file, or logged.
 */

interface AdminEvent {
  action?:
    | 'migrate'
    | 'seed-demo'
    | 'e2e'
    | 'e2e-conflict'
    | 'duplicate'
    | 'review'
    | 'conflicts'
    | 'document-status'
    | 'evidence'
    | 'probe'
    | 'info';
  orgSlug?: string;
  orgName?: string;
  documentId?: string;
  patientCode?: string;
}

interface AdminResult {
  ok: boolean;
  action: string;
  result?: unknown;
  error?: string;
}

export async function adminHandler(event: AdminEvent): Promise<AdminResult> {
  const action = event.action ?? 'info';
  try {
    const credentials = {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
      ...(process.env['AWS_SESSION_TOKEN'] ? { sessionToken: process.env['AWS_SESSION_TOKEN']! } : {}),
    };
    const region = process.env['AWS_REGION'] ?? 'ap-south-1';
    const secretArn = requireEnv('DB_SECRET_ARN');
    const secret = await getSecretJson(secretArn, { region, credentials });
    const masterUser = String(secret['username'] ?? '');
    const masterPassword = String(secret['password'] ?? '');
    if (!masterUser || !masterPassword) throw new Error('db_secret_missing_credentials');

    const host = requireEnv('DB_HOST');
    const port = process.env['DB_PORT'] ?? '5432';
    const name = process.env['DB_NAME'] ?? 'oncobrief';
    const orgSlug = event.orgSlug ?? 'demo';

    const master = new Pool({
      host,
      port: Number(port),
      database: name,
      user: masterUser,
      password: masterPassword,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });

    try {
      if (action === 'migrate') {
        const applied = await applyMigrationList(master, BUNDLED_MIGRATIONS, () => {});
        return { ok: true, action, result: { applied } };
      }

      if (action === 'seed-demo') {
        const seed = await seedDemoOrganization(master, {
          orgSlug,
          orgName: event.orgName ?? 'Demo Organization',
        });
        return { ok: true, action, result: seed };
      }

      if (action === 'e2e' || action === 'e2e-conflict') {
        const seed = await seedDemoOrganization(master, { orgSlug, orgName: event.orgName ?? 'Demo Organization' });
        const officer = await roleUserId(master, seed.orgId, 'records_officer');

        const documentId = randomUUID();
        const correlationId = `${action}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const s3Key = storageKeyFor(seed.orgId, seed.patientId, documentId, '.pdf');

        await withOrgContext(master, seed.orgId, officer, async () => {
          await reserveDocumentForUpload(master, {
            documentId,
            orgId: seed.orgId,
            patientId: seed.patientId,
            uploadedBy: officer,
            filename: action === 'e2e-conflict' ? 'synthetic-conflicting-followup.pdf' : 'synthetic-oncology-referral.pdf',
            mimeType: 'application/pdf',
            storageKey: s3Key,
            sourceKind: 'upload',
            documentDate: '2026-01-05',
            issuingFacility: 'Synthetic Demo Cancer Centre',
            recordOrigin: 'external_hospital',
            correlationId,
          });
        });

        const basePages = action === 'e2e-conflict' ? CONFLICTING_PAGES : SYNTHETIC_PAGES;
        const pdf = buildSyntheticPdf(
          basePages.map((page, i) => (i === 0 ? [...page, `Document Reference: ${correlationId}`] : page)),
        );
        const storage = new S3StorageAdapter({
          bucket: requireEnv('S3_DOCUMENTS_BUCKET'),
          region,
          credentials,
          forcePathStyle: false,
        });
        await storage.put(s3Key, pdf, 'application/pdf');

        return {
          ok: true,
          action,
          result: {
            orgId: seed.orgId,
            patientId: seed.patientId,
            documentId,
            s3Key,
            correlationId,
            bytes: pdf.byteLength,
            note: 'Uploaded to S3; the S3→SQS→Lambda→Textract→SNS→SQS→Lambda→Bedrock→RDS pipeline should now run.',
          },
        };
      }

      if (action === 'duplicate') {
        const orgId = await resolveOrgId(master, orgSlug);
        const patientId =
          (await master.query<{ id: string }>(
            `SELECT id FROM patient WHERE org_id = $1 AND demo_code = $2`,
            [orgId, event.patientCode ?? 'DEMO-ONCO-001'],
          )).rows[0]?.id ?? '';
        const source = event.documentId
          ? { id: event.documentId }
          : (await master.query<{ id: string }>(
              `SELECT id FROM document WHERE org_id = $1 AND patient_id = $2 AND ingest_status = 'ready'
                ORDER BY uploaded_at DESC LIMIT 1`,
              [orgId, patientId],
            )).rows[0];
        if (!source) throw new Error('no_source_document_for_duplicate');

        const officer = await roleUserId(master, orgId, 'records_officer');
        const documentId = randomUUID();
        const correlationId = `dup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const s3Key = storageKeyFor(orgId, patientId, documentId, '.pdf');
        const storage = new S3StorageAdapter({
          bucket: requireEnv('S3_DOCUMENTS_BUCKET'),
          region,
          credentials,
          forcePathStyle: false,
        });

        // Upload the exact same bytes under a new document id.
        const srcKey = (
          await master.query<{ storage_key: string }>(`SELECT storage_key FROM document WHERE id = $1`, [source.id])
        ).rows[0]!.storage_key;
        const bytes = await storage.get(srcKey);

        await withOrgContext(master, orgId, officer, async () => {
          await reserveDocumentForUpload(master, {
            documentId,
            orgId,
            patientId,
            uploadedBy: officer,
            filename: 'synthetic-oncology-referral-refax.pdf',
            mimeType: 'application/pdf',
            storageKey: s3Key,
            sourceKind: 'fax_pdf',
            correlationId,
          });
        });
        await storage.put(s3Key, bytes, 'application/pdf');

        return { ok: true, action, result: { sourceDocumentId: source.id, duplicateDocumentId: documentId, s3Key, correlationId } };
      }

      if (action === 'conflicts') {
        const orgId = await resolveOrgId(master, orgSlug);
        const rows = await withOrgContext(master, orgId, orgId, () =>
          master.query(
            `SELECT cs.id, cs.fact_type, cs.slot_key, cs.status, cs.detection_reason, cs.detected_at,
                    json_agg(json_build_object(
                      'fact_id', ef.id, 'value', ef.value_normalized, 'state', coalesce(es.state,'extracted'),
                      'document', d.original_filename
                    ) ORDER BY ef.created_at) AS members
               FROM conflict_set cs
               JOIN conflict_member cm ON cm.conflict_set_id = cs.id
               JOIN evidence_fact ef ON ef.id = cm.evidence_fact_id
               JOIN document d ON d.id = ef.document_id
               LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
              WHERE cs.org_id = $1
              GROUP BY cs.id
              ORDER BY cs.detected_at DESC`,
            [orgId],
          ),
        );
        return { ok: true, action, result: { count: rows.rowCount, conflicts: rows.rows } };
      }

      if (action === 'review') {
        const orgId = await resolveOrgId(master, orgSlug);
        const patientId =
          (await master.query<{ id: string }>(
            `SELECT id FROM patient WHERE org_id = $1 AND demo_code = $2`,
            [orgId, event.patientCode ?? 'DEMO-ONCO-001'],
          )).rows[0]?.id ?? '';
        const clinician = await roleUserId(master, orgId, 'clinician');
        const actor = { kind: 'human' as const, userId: clinician, role: 'clinician' as const };

        const facts = (
          await withOrgContext(master, orgId, clinician, () =>
            master.query<{ id: string; fact_type: string; value_json: unknown; verbatim_quote: string }>(
              `SELECT ef.id, ef.fact_type, ef.value_json, ef.verbatim_quote
                 FROM evidence_fact ef
                 LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
                WHERE ef.patient_id = $1 AND coalesce(es.state,'extracted') = 'extracted'
                ORDER BY ef.created_at`,
              [patientId],
            ),
          )
        ).rows;

        const results: unknown[] = [];
        const state = (id: string) =>
          withOrgContext(master, orgId, clinician, () =>
            master.query<{ state: string }>(`SELECT state FROM evidence_state WHERE evidence_fact_id = $1`, [id]),
          ).then((r) => r.rows[0]?.state);

        // Verify the first fact.
        if (facts[0]) {
          await withOrgContext(master, orgId, clinician, () => verifyEvidence(master, { factId: facts[0]!.id, actor }));
          results.push({ factId: facts[0]!.id, factType: facts[0]!.fact_type, action: 'verify', state: await state(facts[0]!.id) });
        }

        // Correct a text/facility fact so the original is provably retained.
        const correctionTarget =
          facts.find((f) => ['text', 'facility'].includes((f.value_json as { kind?: string }).kind ?? '')) ?? facts[1];
        let correction: unknown = null;
        if (correctionTarget) {
          const prior = correctionTarget.value_json as { kind: string; text?: string; name?: string };
          const value =
            prior.kind === 'facility'
              ? { kind: 'facility', name: `${prior.name ?? ''} (records-confirmed)` }
              : { kind: 'text', text: `${prior.text ?? ''} (records-confirmed)` };
          const corrected = await withOrgContext(master, orgId, clinician, () =>
            correctEvidence(master, {
              factId: correctionTarget.id,
              actor,
              value: value as never,
              verbatimQuote: correctionTarget.verbatim_quote,
              reason: 'E2E demonstration: records officer confirmed the wording against the source.',
            }),
          );
          correction = {
            originalFactId: correctionTarget.id,
            originalValue: correctionTarget.value_json,
            originalState: await state(correctionTarget.id),
            replacementFactId: corrected.replacementFactId,
            replacementState: await state(corrected.replacementFactId),
          };
        }

        // Reject the last fact.
        const rejectTarget = facts[facts.length - 1];
        if (rejectTarget && rejectTarget.id !== correctionTarget?.id) {
          await withOrgContext(master, orgId, clinician, () =>
            rejectEvidence(master, {
              factId: rejectTarget.id,
              actor,
              reason: 'E2E demonstration: not a fact this record should carry.',
            }),
          );
          results.push({ factId: rejectTarget.id, factType: rejectTarget.fact_type, action: 'reject', state: await state(rejectTarget.id) });
        }

        return { ok: true, action, result: { reviewed: results, correction } };
      }

      if (action === 'document-status') {
        const orgId = await resolveOrgId(master, orgSlug);
        const rows = await withOrgContext(master, orgId, orgId, () =>
          master.query(
            `SELECT d.id, d.ingest_status, d.ingest_error, d.document_type, d.page_count,
                    d.correlation_id, d.duplicate_status, d.duplicate_of_document_id, d.s3_version_id,
                    (SELECT count(*) FROM text_span ts WHERE ts.document_id = d.id)::int AS spans,
                    (SELECT count(*) FROM evidence_fact ef WHERE ef.document_id = d.id)::int AS facts,
                    j.stage AS job_stage, j.provider_job_id, j.last_error AS job_error, j.attempts
               FROM document d
               LEFT JOIN document_ingestion_job j ON j.document_id = d.id
              WHERE d.id = $1`,
            [event.documentId],
          ),
        );
        return { ok: true, action, result: rows.rows[0] ?? null };
      }

      if (action === 'evidence') {
        const orgId = await resolveOrgId(master, orgSlug);
        const patientId =
          (await master.query<{ id: string }>(
            `SELECT id FROM patient WHERE org_id = $1 AND demo_code = $2`,
            [orgId, event.patientCode ?? 'DEMO-ONCO-001'],
          )).rows[0]?.id ?? '';
        const rows = await withOrgContext(master, orgId, orgId, () =>
          master.query(
            `SELECT ef.fact_type, ef.value_normalized, ef.verbatim_quote, ef.observed_on::text AS observed_on,
                    ef.extractor_kind, ef.extractor_name, ef.extractor_version, ef.confidence_band,
                    coalesce(es.state,'extracted') AS state, d.original_filename,
                    (SELECT dp.page_number FROM evidence_span_link esl
                       JOIN text_span ts ON ts.id = esl.text_span_id
                       JOIN document_page dp ON dp.id = ts.page_id
                      WHERE esl.evidence_fact_id = ef.id ORDER BY esl.ordinal LIMIT 1) AS page_number
               FROM evidence_fact ef
               JOIN document d ON d.id = ef.document_id
               LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
              WHERE ef.patient_id = $1
              ORDER BY ef.created_at`,
            [patientId],
          ),
        );
        return { ok: true, action, result: { patientId, count: rows.rowCount, facts: rows.rows } };
      }

      if (action === 'probe') {
        const who = await master.query(
          `SELECT current_user, current_setting('is_superuser') AS is_superuser,
                  (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls`,
        );
        const rawMembership = await master.query(`SELECT count(*)::int AS n FROM membership`);
        const lookup = await master.query(`SELECT user_id, org_id, role FROM auth_lookup_user('dr.rao@rci.demo')`);
        const orgId = await resolveOrgId(master, orgSlug);

        // Runtime credential: connect as the non-owner app role and verify RLS
        // fails closed with no tenant context, and scopes correctly with it.
        const app = new Pool({
          host,
          port: Number(port),
          database: name,
          user: 'oncobrief_app',
          password: 'oncobrief_app',
          ssl: { rejectUnauthorized: false },
          max: 1,
        });
        let appRole: unknown;
        try {
          const noCtx = await app.query(`SELECT count(*)::int AS n FROM membership`);
          await app.query('BEGIN');
          await app.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
          const withCtx = await app.query(`SELECT count(*)::int AS n FROM membership`);
          await app.query('COMMIT');
          appRole = { connected: true, without_context: noCtx.rows[0], with_context: withCtx.rows[0] };
        } catch (e) {
          appRole = { connected: false, error: e instanceof Error ? e.message : String(e) };
        } finally {
          await app.end();
        }

        return {
          ok: true,
          action,
          result: {
            identity: who.rows[0],
            membership_without_context: rawMembership.rows[0],
            auth_lookup_user_ok: lookup.rowCount === 1,
            auth_lookup_user_count: lookup.rowCount,
            app_role: appRole,
          },
        };
      }

      // info
      const orgId = await resolveOrgId(master, orgSlug);
      const counts = await withOrgContext(master, orgId, orgId, () =>
        master.query(
          `SELECT
             (SELECT count(*) FROM patient WHERE org_id = $1)::int AS patients,
             (SELECT count(*) FROM document WHERE org_id = $1)::int AS documents,
             (SELECT count(*) FROM evidence_fact WHERE org_id = $1)::int AS evidence_facts,
             (SELECT count(*) FROM conflict_set WHERE org_id = $1 AND status = 'open')::int AS open_conflicts,
             (SELECT count(*) FROM admin_task WHERE org_id = $1)::int AS tasks`,
          [orgId],
        ),
      );
      return { ok: true, action: 'info', result: { orgId, ...counts.rows[0] } };
    } finally {
      await master.end();
    }
  } catch (err) {
    return { ok: false, action, error: err instanceof Error ? err.message : String(err) };
  }
}

async function resolveOrgId(client: Pool, slug: string): Promise<string> {
  const row = (await client.query<{ id: string }>(`SELECT id FROM organization WHERE slug = $1`, [slug])).rows[0];
  if (!row) throw new Error(`org_not_found:${slug}`);
  return row.id;
}

async function roleUserId(client: Pool, orgId: string, role: string): Promise<string> {
  const row = (
    await client.query<{ user_id: string }>(
      `SELECT user_id FROM membership WHERE org_id = $1 AND role = $2 LIMIT 1`,
      [orgId, role],
    )
  ).rows[0];
  if (!row) throw new Error(`user_for_role_not_found:${role}`);
  return row.user_id;
}

async function withOrgContext<T>(
  client: Pool,
  orgId: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    await client.query(`SELECT set_config('app.role', $1, true)`, ['org_admin']);
    const out = await fn();
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

/**
 * Synthetic oncology referral (page 1) and follow-up letter (page 2). Contains
 * explicit administrative facts only — surgery date, facility, procedure title,
 * report availability, an explicit follow-up date and a document request. No
 * clinical interpretation, no real patient data.
 */
const SYNTHETIC_PAGES: string[][] = [
  [
    'SYNTHETIC DEMO CANCER CENTRE',
    'Referral and Operative Summary',
    'Patient ID: DEMO-ONCO-001',
    'Patient Name: Synthetic Demo Patient',
    'MRN: SYN-ONCO-0001',
    'Document Date: 05 January 2026',
    'Issuing Facility: Synthetic Demo Cancer Centre',
    'Referred By: Dr. S. Kumar',
    'Procedure: Wide local excision with sentinel node biopsy',
    'Procedure Date: 12 January 2026',
    'Discharge Date: 14 January 2026',
    'Histopathology Report: available and issued 16 January 2026',
    'Imaging Report: CT chest available and issued 06 January 2026',
  ],
  [
    'SYNTHETIC DEMO CANCER CENTRE',
    'Follow-up Instructions',
    'Patient ID: DEMO-ONCO-001',
    'Document Date: 20 January 2026',
    'Follow-up Appointment: 10 February 2026 at Surgical Oncology OPD',
    'Please bring the previous imaging report and the discharge summary.',
    'Bring previous imaging CD to the follow-up visit.',
  ],
];

/**
 * A second synthetic source that disagrees with SYNTHETIC_PAGES about the
 * follow-up appointment date (17 February vs 10 February). The deterministic
 * comparator must surface both values as a conflict; neither is silently
 * chosen. No clinical content.
 */
const CONFLICTING_PAGES: string[][] = [
  [
    'SYNTHETIC DEMO CANCER CENTRE',
    'Follow-up Letter (second source)',
    'Patient ID: DEMO-ONCO-001',
    'Document Date: 22 January 2026',
    'Issuing Facility: Synthetic Demo Cancer Centre',
    'Follow-up Appointment: 17 February 2026 at Surgical Oncology OPD',
  ],
  [
    'SYNTHETIC DEMO CANCER CENTRE',
    'Please bring the previous imaging report.',
  ],
];
