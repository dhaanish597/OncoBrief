import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { SqsQueueAdapter } from '@oncobrief/adapters';
import { getStorage } from './container';
import { getMigratorPool } from './client';
import { env } from './env';
import { reserveDocumentForUpload, storageKeyFor } from './services/documents';

/**
 * AWS-pipeline demo seeder (Phase 24).
 *
 * Generates **synthetic** documents only — no real patient data — reserves a
 * document row for each, uploads the bytes to object storage, and enqueues a
 * document-ingest message so the worker runs the real cloud pipeline:
 *
 *   S3 object → SQS → worker → Textract → SQS → worker → promoter → ledger
 *
 * It requires the cloud drivers (`STORAGE_DRIVER=s3`, `QUEUE_DRIVER=sqs`) and a
 * working Textract (real AWS or LocalStack). For the fully offline demo use
 * `pnpm demo:reset` instead, which runs the same promoter inline over fixtures.
 *
 * The set is engineered to contain the demo's problems: a byte-identical
 * duplicate, two documents that disagree about a procedure date, an explicit
 * follow-up instruction, and a missing required insurance authorization.
 */

interface SyntheticDoc {
  filename: string;
  mimeType: string;
  documentType: string;
  text: string;
  duplicateOf?: string;
}

const ORG_SLUG = 'rci';
const DOCS: SyntheticDoc[] = [
  {
    filename: 'referral-note.txt',
    mimeType: 'text/plain',
    documentType: 'referral_letter',
    text: [
      'Referral Note',
      'Patient referred to Surgical Oncology for review of a breast lump.',
      'Referred by Dr. S. Kumar, District Hospital.',
      'Referral date: 2026-01-04',
    ].join('\n'),
  },
  {
    filename: 'histopathology.txt',
    mimeType: 'text/plain',
    documentType: 'pathology_report',
    text: [
      'Histopathology Report',
      'Specimen: Left breast, core biopsy.',
      'Procedure Date: 2026-01-10',
      'Report issued 2026-01-14.',
    ].join('\n'),
  },
  {
    filename: 'operative-note.txt',
    mimeType: 'text/plain',
    documentType: 'operative_note',
    text: [
      'Operative Note',
      'Procedure: Wide local excision with sentinel node biopsy.',
      'Procedure Date: 2026-01-12',
      'Surgeon: Dr. M. Rao.',
    ].join('\n'),
  },
  {
    filename: 'radiology-report.txt',
    mimeType: 'text/plain',
    documentType: 'radiology_report',
    text: [
      'Radiology Report — PET-CT',
      'Findings documented. Procedure Date: 2026-01-10.',
      'Imaging centre: Northgate Imaging.',
    ].join('\n'),
  },
  {
    filename: 'prescription.txt',
    mimeType: 'text/plain',
    documentType: 'prescription',
    text: ['Prescription', 'Tab Letrozole 2.5 mg once daily.', 'Issued 2026-01-20.'].join('\n'),
  },
  {
    filename: 'discharge-summary.txt',
    mimeType: 'text/plain',
    documentType: 'discharge_summary',
    text: [
      'Discharge Summary',
      'Admitted 2026-01-11, discharged 2026-01-13.',
      'Follow-up appointment: 2026-02-10 at Surgical Oncology OPD.',
      'Please bring the previous imaging CD to the follow-up visit.',
    ].join('\n'),
  },
  {
    // Byte-identical duplicate of the histopathology report.
    filename: 'histopathology-refax.txt',
    mimeType: 'text/plain',
    documentType: 'pathology_report',
    duplicateOf: 'histopathology.txt',
    text: [
      'Histopathology Report',
      'Specimen: Left breast, core biopsy.',
      'Procedure Date: 2026-01-10',
      'Report issued 2026-01-14.',
    ].join('\n'),
  },
];

export interface AwsSeedResult {
  orgId: string;
  patientId: string;
  documentIds: string[];
  queue: string;
}

export async function seedAws(log: (m: string) => void = () => {}): Promise<AwsSeedResult> {
  if (env.storageDriver !== 's3') throw new Error('aws_seed_requires_storage_driver_s3');
  if ((process.env['QUEUE_DRIVER'] ?? '') !== 'sqs') throw new Error('aws_seed_requires_queue_driver_sqs');

  const storage = getStorage();
  const queue = new SqsQueueAdapter({
    region: env.s3.region,
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
      ...(env.s3.sessionToken ? { sessionToken: env.s3.sessionToken } : {}),
    },
    ...(env.s3.endpoint ? { endpoint: env.s3.endpoint } : {}),
    queueUrls: process.env['SQS_DOCUMENT_QUEUE_URL']
      ? { [process.env['SQS_DOCUMENT_QUEUE'] ?? 'oncobrief-document-ingest']: process.env['SQS_DOCUMENT_QUEUE_URL']! }
      : {},
  });

  const client: PoolClient = await getMigratorPool().connect();
  const documentIds: string[] = [];
  let resolvedOrgId = '';
  let resolvedPatientId = '';
  try {
    const org = (
      await client.query<{ id: string }>(`SELECT id FROM organization WHERE slug = $1`, [ORG_SLUG])
    ).rows[0];
    if (!org) throw new Error(`aws_seed_org_missing:${ORG_SLUG} (run pnpm demo:reset first to seed the org and users)`);
    resolvedOrgId = org.id;

    const uploader = (
      await client.query<{ id: string }>(
        `SELECT u.id FROM app_user u JOIN membership m ON m.user_id = u.id
          WHERE m.org_id = $1 AND m.role = 'records_officer' LIMIT 1`,
        [org.id],
      )
    ).rows[0]?.id;
    if (!uploader) throw new Error('aws_seed_uploader_missing');

    const existing = (
      await client.query<{ id: string }>(
        `SELECT id FROM patient WHERE org_id = $1 AND demo_code = 'DEMO-AWS-001' LIMIT 1`,
        [org.id],
      )
    ).rows[0];
    const patientId =
      existing?.id ??
      (
        await client.query<{ id: string }>(
          `INSERT INTO patient (org_id, demo_code, display_name, is_demo_fixture)
           VALUES ($1, 'DEMO-AWS-001', 'DEMO-AWS-001 — AWS pipeline', true)
           RETURNING id`,
          [org.id],
        )
      ).rows[0]!.id;
    resolvedPatientId = patientId;

    // Reserve every document first so the duplicate shares no bytes with a
    // distinct document id.
    const byName = new Map<string, string>();
    for (const doc of DOCS) {
      const documentId = randomUUID();
      const key = storageKeyFor(org.id, patientId, documentId, '.txt');
      const correlationId = `up:${documentId}`;
      await reserveDocumentForUpload(client, {
        documentId,
        orgId: org.id,
        patientId,
        uploadedBy: uploader,
        filename: doc.filename,
        mimeType: doc.mimeType,
        storageKey: key,
        sourceKind: 'upload',
        correlationId,
      });
      byName.set(doc.filename, documentId);

      // The duplicate reuses the first document's bytes.
      const source = doc.duplicateOf ? DOCS.find((d) => d.filename === doc.duplicateOf) : doc;
      const bytes = Buffer.from(source!.text, 'utf8');
      await storage.put(key, bytes, doc.mimeType);

      await queue.send(
        process.env['SQS_DOCUMENT_QUEUE'] ?? 'oncobrief-document-ingest',
        {
          kind: 'document-ingest',
          documentId,
          orgId: org.id,
          correlationId,
          s3Bucket: env.s3.bucket,
          s3Key: key,
          s3VersionId: null,
        },
        { correlationId },
      );
      documentIds.push(documentId);
      log(`reserved+enqueued ${doc.filename} (${documentId})`);
    }
  } finally {
    client.release();
  }

  return {
    orgId: resolvedOrgId,
    patientId: resolvedPatientId,
    documentIds,
    queue: process.env['SQS_DOCUMENT_QUEUE'] ?? 'oncobrief-document-ingest',
  };
}
