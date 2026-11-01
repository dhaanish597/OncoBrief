import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  sniffContentType,
  getStorage,
  storageKeyFor,
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB strict limit for patient mobile uploads (SEC-NEG-09)

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
]);

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE_HEADERS });
}

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request, 'documents');
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Invalid JSON body' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const {
    filename,
    contentBase64,
    documentDate,
    issuingFacility,
    fulfillsTaskId,
  } = body as {
    filename?: string;
    contentBase64?: string;
    documentDate?: string;
    issuingFacility?: string;
    fulfillsTaskId?: string;
  };

  if (!filename || typeof filename !== 'string' || !contentBase64 || typeof contentBase64 !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'filename and contentBase64 are required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const buffer = Buffer.from(contentBase64, 'base64');

  // 1. Enforce 10 MB limit (SEC-NEG-09)
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: 'payload_too_large', message: 'Upload exceeds 10 MB maximum limit' } },
      { status: 413, headers: NO_CACHE_HEADERS },
    );
  }

  // 2. Magic-byte sniffing (SEC-NEG-08)
  const sniffed = sniffContentType(buffer);
  if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) {
    return NextResponse.json(
      {
        error: {
          code: 'unsupported_media_type',
          message: 'Unsupported document format. Allowed: PDF, PNG, JPEG, TIFF, WebP',
        },
      },
      { status: 415, headers: NO_CACHE_HEADERS },
    );
  }

  const sha256 = createHash('sha256').update(buffer).digest();

  const result = await withPatientPortalContext(session, async (q) => {
    // 3. Duplicate check (SEC-NEG-19)
    const existing = await q.query<{ id: string }>(
      'SELECT id FROM document WHERE org_id = $1 AND patient_id = $2 AND content_sha256 = $3',
      [session.orgId, session.patientId, sha256],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return { status: 409, error: 'duplicate_document', message: 'Document already uploaded' };
    }

    // Resolve an app_user id to satisfy document.uploaded_by foreign key
    const userRes = await q.query<{ user_id: string }>(
      `SELECT user_id FROM membership
       WHERE org_id = $1 AND role IN ('coordinator', 'org_admin', 'clinician')
       LIMIT 1`,
      [session.orgId],
    );
    const uploaderUserId = userRes.rows[0]?.user_id ?? session.patientId;

    // 4. Insert document with clinicianStatus pending
    const docRes = await q.query<{ id: string }>(
      `INSERT INTO document
         (org_id, patient_id, source_kind, original_filename, mime_type, byte_size, content_sha256,
          storage_key, document_date, issuing_facility, record_origin, is_demo_fixture, uploaded_by, ingest_status)
       VALUES ($1, $2, 'upload', $3, $4, $5, $6, 'pending', $7, $8, 'patient_upload', false, $9, 'received')
       RETURNING id`,
      [
        session.orgId,
        session.patientId,
        filename,
        sniffed,
        buffer.byteLength,
        sha256,
        documentDate ?? null,
        issuingFacility ?? null,
        uploaderUserId,
      ],
    );
    const documentId = docRes.rows[0]!.id;

    // 5. Store in storage if available
    try {
      const storage = getStorage();
      const key = storageKeyFor(session.orgId, session.patientId, documentId, EXT_BY_MIME[sniffed] ?? '.bin');
      await storage.put(key, buffer, sniffed);
      await q.query('UPDATE document SET storage_key = $1 WHERE id = $2', [key, documentId]);
    } catch {
      /* storage unavailable in test */
    }

    // 6. Link to task if fulfillsTaskId was passed
    if (fulfillsTaskId) {
      await q.query(
        `UPDATE admin_task
         SET closure_note = 'Satisfied by patient upload ' || $1
         WHERE id = $2 AND org_id = $3 AND patient_id = $4`,
        [documentId, fulfillsTaskId, session.orgId, session.patientId],
      );
    }

    // 7. Audit log
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'document.uploaded',
        entityKind: 'document',
        entityId: documentId,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          caregiverContactId: session.caregiverContactId ?? null,
          filename,
          byteSize: buffer.byteLength,
          mimeType: sniffed,
        },
      });
    } catch {
      /* non-fatal audit */
    }

    return {
      status: 201,
      documentId,
      filename,
      mimeType: sniffed,
      byteSize: buffer.byteLength,
      clinicianStatus: 'pending_clinician_review' as const,
    };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { status: 201, headers: NO_CACHE_HEADERS });
}
