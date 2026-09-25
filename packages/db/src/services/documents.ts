import { createHash } from 'node:crypto';
import { DOCUMENT_TYPES, isDocumentType, type DocumentType, type ExtractorKind } from '@oncobrief/domain';
import type { ExtractionPort, OcrPort, OcrSpanDraft, StoragePort } from '@oncobrief/ports';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';
import { detectAndRecordConflicts, insertFact } from './ledger';

/**
 * Document ingestion (architecture §6, §16).
 *
 * The pipeline is a deterministic, resumable state machine:
 *   received -> rendering -> ocr_running -> classifying -> extracting -> ready
 *                                             \-> failed / quarantined
 *
 * Each stage writes its output and advances the status. A stuck document is
 * visibly stuck rather than silently absent — the omission principle again.
 */

export interface FixturePage {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  plainText: string;
  spans: OcrSpanDraft[];
}

export interface CreateDocumentInput {
  orgId: string;
  patientId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  content: Buffer;
  sourceKind: 'upload' | 'scan' | 'fax_pdf' | 'photo' | 'extension_capture' | 'fhir_document';
  documentDate?: string | null;
  issuingFacility?: string | null;
  recordOrigin?:
    | 'internal_hospital'
    | 'external_hospital'
    | 'diagnostic_lab'
    | 'imaging_centre'
    | 'patient_upload';
  isDemoFixture?: boolean;
}

export function storageKeyFor(orgId: string, patientId: string, documentId: string, ext: string): string {
  return `org/${orgId}/patient/${patientId}/doc/${documentId}/original${ext}`;
}

export function extensionForContentType(mime: string): string {
  return EXT_BY_MIME[mime] ?? '.bin';
}

export function isAllowedUploadContentType(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXT_BY_MIME, mime);
}

export interface ReserveDocumentInput {
  documentId: string;
  orgId: string;
  patientId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  storageKey: string;
  sourceKind: 'upload' | 'scan' | 'fax_pdf' | 'photo' | 'extension_capture' | 'fhir_document';
  documentDate?: string | null;
  issuingFacility?: string | null;
  recordOrigin?:
    | 'internal_hospital'
    | 'external_hospital'
    | 'diagnostic_lab'
    | 'imaging_centre'
    | 'patient_upload';
  correlationId?: string | null;
}

/**
 * Reserve a document row before the bytes exist (Phase 2).
 *
 * Used by the direct-to-S3 upload path: `POST .../documents/upload-url` mints a
 * presigned PUT and inserts a row with a NULL `content_sha256`. The worker
 * computes the real hash from the object it downloads, so the stored hash is
 * always server-computed and a client cannot choose its own bytes' hash. A NULL
 * hash is distinct under the unique constraint, so many reservations coexist.
 */
export async function reserveDocumentForUpload(q: Querier, input: ReserveDocumentInput): Promise<void> {
  await q.query(
    `INSERT INTO document
       (id, org_id, patient_id, source_kind, original_filename, mime_type, byte_size,
        content_sha256, storage_key, document_date, issuing_facility, record_origin,
        correlation_id, uploaded_by, ingest_status)
     VALUES ($1,$2,$3,$4,$5,$6,0,NULL,$7,$8,$9,$10,$11,$12,'received')`,
    [
      input.documentId,
      input.orgId,
      input.patientId,
      input.sourceKind,
      input.filename,
      input.mimeType,
      input.storageKey,
      input.documentDate ?? null,
      input.issuingFacility ?? null,
      input.recordOrigin ?? 'internal_hospital',
      input.correlationId ?? null,
      input.uploadedBy,
    ],
  );
}

/** Extension allow-list and magic-byte sniffing; never trust the client header. */
export function sniffContentType(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString('latin1') === 'PNG')
    return 'image/png';
  // Plain text / synthetic fixture documents.
  if (bytes.subarray(0, 512).every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127))) {
    return 'text/plain';
  }
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'text/plain': '.txt',
};

const MAX_BYTES = 25 * 1024 * 1024;

export async function createDocument(
  q: Querier,
  storage: StoragePort,
  input: CreateDocumentInput,
): Promise<{ documentId: string; contentType: string }> {
  if (input.content.byteLength > MAX_BYTES) throw new Error('upload_too_large:max_25mb');
  const sniffed = sniffContentType(input.content);
  if (!sniffed) throw new Error('unsupported_content_type');

  const sha256 = createHash('sha256').update(input.content).digest();

  const existing = await q.query<{ id: string }>(
    'SELECT id FROM document WHERE org_id = $1 AND patient_id = $2 AND content_sha256 = $3',
    [input.orgId, input.patientId, sha256],
  );
  if (existing.rows[0]) {
    // Byte-identical re-upload creates a duplicate link, never a second artefact.
    return { documentId: existing.rows[0].id, contentType: sniffed };
  }

  const docRes = await q.query<{ id: string }>(
    `INSERT INTO document
       (org_id, patient_id, source_kind, original_filename, mime_type, byte_size, content_sha256,
        storage_key, document_date, issuing_facility, record_origin, is_demo_fixture, uploaded_by, ingest_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'received')
     RETURNING id`,
    [
      input.orgId,
      input.patientId,
      input.sourceKind,
      input.filename,
      sniffed,
      input.content.byteLength,
      sha256,
      'pending',
      input.documentDate ?? null,
      input.issuingFacility ?? null,
      input.recordOrigin ?? 'internal_hospital',
      input.isDemoFixture ?? false,
      input.uploadedBy,
    ],
  );
  const documentId = docRes.rows[0]!.id;
  const key = storageKeyFor(input.orgId, input.patientId, documentId, EXT_BY_MIME[sniffed] ?? '.bin');
  await storage.put(key, input.content, sniffed);
  await q.query('UPDATE document SET storage_key = $1 WHERE id = $2', [key, documentId]);

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.uploadedBy, role: null },
    action: 'document.uploaded',
    entityKind: 'document',
    entityId: documentId,
    outcome: 'success',
    metadata: { filename: input.filename, mime_type: sniffed, byte_size: input.content.byteLength },
  });

  return { documentId, contentType: sniffed };
}

/**
 * Filename signals first, content signals second.
 *
 * Indian oncology records are conventionally named by type, so the filename is
 * the stronger signal; a content keyword like "histopathology" appearing in a
 * discharge summary must not override the document's own declared type.
 * Classification remains advisory either way (§6.3).
 */
const FILENAME_HINTS: [RegExp, DocumentType][] = [
  [/histopath|patholog|hpe\b/i, 'pathology_report'],
  [/discharge[-_ ]?summary|discharge/i, 'discharge_summary'],
  [/\bct\b|ct[-_]|radiology|imaging|\bmri\b|\bpet\b|mammograph|ultrasound|x[-_]?ray/i, 'radiology_report'],
  [/referral|refer[-_]/i, 'referral_letter'],
  [/prescription|\brx\b/i, 'prescription'],
  [/\bcbc\b|laborator|\blab\b[-_]|haematolog|hematolog|biochem/i, 'lab_report'],
  [/chemotherapy|treatment[-_ ]?summary|radiation[-_ ]?summary/i, 'treatment_summary'],
  [/appointment/i, 'appointment_letter'],
  [/insurance|authoriz|pre[-_]?auth|pmjay|ayushman/i, 'insurance_authorization'],
  [/consent/i, 'consent_form'],
  [/operative|operation[-_ ]?note|surgery[-_ ]?note/i, 'operative_note'],
  [/identity|aadhaar|id[-_]?proof/i, 'identity_document'],
  [/opd[-_ ]?note|outpatient|followup[-_ ]?note|follow[-_ ]?up[-_ ]?note|external[-_ ]?opinion|second[-_ ]?opinion/i, 'other'],
];

const TEXT_HINTS: [RegExp, DocumentType][] = [
  [/histopathology report|microscopy|specimen/i, 'pathology_report'],
  [/discharge summary/i, 'discharge_summary'],
  [/computed tomography|\bct scan\b|\bmri\b|\bpet[- ]?ct\b|mammograph/i, 'radiology_report'],
  [/referral note|referred to/i, 'referral_letter'],
  [/prescription/i, 'prescription'],
  [/laborator(y|ies) report|haemoglobin|hemoglobin|leucocyte|platelet/i, 'lab_report'],
  [/treatment summary|chemotherapy administration/i, 'treatment_summary'],
  [/appointment letter/i, 'appointment_letter'],
  [/insurance authorization/i, 'insurance_authorization'],
  [/consent form|consent obtained/i, 'consent_form'],
  [/operative note/i, 'operative_note'],
];

/** Advisory classification. Never trusted until `type_confirmed_by` is set. */
export function classifyDocumentText(filename: string, text: string): { type: DocumentType | null; confidence: number } {
  for (const [re, type] of FILENAME_HINTS) {
    if (re.test(filename)) return { type, confidence: 0.9 };
  }
  for (const [re, type] of TEXT_HINTS) {
    if (re.test(text)) return { type, confidence: 0.7 };
  }
  return { type: null, confidence: 0 };
}

export interface IngestionDeps {
  storage: StoragePort;
  ocr: OcrPort;
  extractor: ExtractionPort;
}

/** A page already normalised by an OCR engine (fixture, Textract, …). */
export interface NormalizedPage {
  pageNumber: number;
  widthPx?: number | null;
  heightPx?: number | null;
  plainText: string;
  spans: OcrSpanDraft[];
  engine: string;
  engineVersion: string;
}

export interface IngestionResult {
  documentId: string;
  status: 'ready' | 'quarantined' | 'failed';
  pages: number;
  spans: number;
  candidates: number;
  promoted: number;
  rejected: number;
  conflictsCreated: number;
  conflictsFlagged: number;
  documentType: DocumentType | null;
}

/**
 * Persist normalised pages and run classification → extraction → promotion →
 * conflict detection.
 *
 * This is the **single post-OCR path**, shared by the in-process fixture
 * pipeline and the AWS worker (Textract). A new OCR engine cannot fork the
 * promotion rules: both call this function, so span validation, the fact-type
 * allow-list and `slot_key` computation are applied identically. See ADR 0015.
 */
export async function ingestNormalizedPages(
  q: Querier,
  extractor: ExtractionPort,
  documentId: string,
  pages: NormalizedPage[],
  extractorKind: ExtractorKind = 'rule',
  correlationId?: string | null,
): Promise<IngestionResult> {
  const docRes = await q.query<{
    id: string;
    org_id: string;
    patient_id: string;
    original_filename: string;
    document_date: string | null;
    issuing_facility: string | null;
    is_demo_fixture: boolean;
  }>(
    'SELECT id, org_id, patient_id, original_filename, document_date::text AS document_date, issuing_facility, is_demo_fixture FROM document WHERE id = $1',
    [documentId],
  );
  const doc = docRes.rows[0];
  if (!doc) throw new Error('document_not_found');
  const orgId = doc.org_id;
  const patientId = doc.patient_id;

  await q.query(`UPDATE document SET ingest_status = 'ocr_running', page_count = $2 WHERE id = $1`, [
    documentId,
    pages.length,
  ]);

  let spanCount = 0;
  let fullText = '';

  for (const page of pages) {
    const pageRes = await q.query<{ id: string }>(
      `INSERT INTO document_page (org_id, document_id, page_number, width_px, height_px, plain_text)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (document_id, page_number) DO UPDATE SET plain_text = EXCLUDED.plain_text
       RETURNING id`,
      [orgId, documentId, page.pageNumber, page.widthPx ?? null, page.heightPx ?? null, page.plainText],
    );
    const pageId = pageRes.rows[0]!.id;
    fullText += `${page.plainText}\n`;

    for (const span of page.spans) {
      await q.query(
        `INSERT INTO text_span
           (org_id, document_id, page_id, granularity, span_index, text, char_start, char_end,
            bbox_x, bbox_y, bbox_w, bbox_h, ocr_confidence, ocr_engine, ocr_engine_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (page_id, granularity, span_index) DO NOTHING`,
        [
          orgId, documentId, pageId, span.granularity, span.index, span.text,
          span.charStart, span.charEnd, span.bbox.x, span.bbox.y, span.bbox.w, span.bbox.h,
          span.confidence ?? null, page.engine, page.engineVersion,
        ],
      );
      spanCount += 1;
    }
  }

  await q.query(`UPDATE document SET ingest_status = 'classifying' WHERE id = $1`, [documentId]);
  const classification = classifyDocumentText(doc.original_filename, fullText);
  await q.query(
    `UPDATE document SET document_type = $2, type_confidence = $3, classified_by = 'rule' WHERE id = $1`,
    [documentId, classification.type, classification.confidence > 0 ? 'high' : null],
  );

  await q.query(`UPDATE document SET ingest_status = 'extracting' WHERE id = $1`, [documentId]);

  const spansRes = await q.query<{ id: string; page_id: string; text: string }>(
    'SELECT id, page_id, text FROM text_span WHERE document_id = $1 ORDER BY span_index',
    [documentId],
  );

  const candidates = await extractor.extract({
    documentId,
    patientId,
    documentType: classification.type,
    documentDate: doc.document_date,
    issuingFacility: doc.issuing_facility,
    pageText: fullText,
    spans: spansRes.rows.map((r) => ({ id: r.id, pageId: r.page_id, text: r.text })),
  });

  let promoted = 0;
  let rejected = 0;
  for (const candidate of candidates) {
    const inserted = await insertFact(q, {
      orgId,
      patientId,
      factType: candidate.factType,
      value: candidate.value,
      verbatimQuote: candidate.verbatimQuote,
      spanIds: candidate.spanIds,
      documentId,
      extractorKind,
      extractorName: candidate.extractorName,
      extractorVersion: candidate.extractorVersion,
      confidenceRaw: candidate.confidenceRaw,
      observedOn: candidate.observedOn ?? null,
      createdBy: null,
      ...(correlationId ? { correlationId } : {}),
    });

    await q.query(
      `INSERT INTO extraction_candidate
         (org_id, document_id, patient_id, fact_type, value_json, verbatim_quote, proposed_span_ids,
          extractor_kind, extractor_name, extractor_version, confidence_raw, validation_status,
          rejected_reason, promoted_fact_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$14,$8,$9,$10,$11,$12,$13)`,
      [
        orgId, documentId, patientId, candidate.factType, JSON.stringify(candidate.value),
        candidate.verbatimQuote, candidate.spanIds, candidate.extractorName,
        candidate.extractorVersion, candidate.confidenceRaw,
        inserted.ok ? 'promoted' : 'rejected',
        inserted.ok ? null : inserted.reason,
        inserted.ok ? inserted.factId : null,
        extractorKind,
      ],
    );

    if (inserted.ok) promoted += 1;
    else rejected += 1;
  }

  await appendAuditEvent(q, {
    orgId,
    actor: { userId: null, role: null, onBehalfOf: 'worker' },
    action: 'extraction.completed',
    entityKind: 'document',
    entityId: documentId,
    outcome: 'success',
    correlationId: correlationId ?? null,
    metadata: { candidates: candidates.length, promoted, rejected, pages: pages.length },
  });

  const conflicts = await detectAndRecordConflicts(q, orgId, patientId);
  await detectNearDuplicates(q, orgId, patientId);

  await q.query(`UPDATE document SET ingest_status = 'ready', ingest_error = NULL WHERE id = $1`, [documentId]);
  await appendAuditEvent(q, {
    orgId,
    actor: { userId: null, role: null, onBehalfOf: 'worker' },
    action: 'document.ingested',
    entityKind: 'document',
    entityId: documentId,
    outcome: 'success',
    correlationId: correlationId ?? null,
    metadata: { spans: spanCount },
  });

  return {
    documentId,
    status: 'ready',
    pages: pages.length,
    spans: spanCount,
    candidates: candidates.length,
    promoted,
    rejected,
    conflictsCreated: conflicts.created,
    conflictsFlagged: conflicts.flagged,
    documentType: classification.type,
  };
}

/**
 * Run the pipeline. `fixturePages` supplies deterministic OCR output for demo
 * fixtures. A real upload with no text layer and no OCR adapter available is
 * quarantined with `manual_transcription_required` rather than guessed at.
 */
export async function ingestDocument(
  q: Querier,
  deps: IngestionDeps,
  documentId: string,
  fixturePages?: FixturePage[],
): Promise<IngestionResult> {
  await q.query(`UPDATE document SET ingest_status = 'rendering' WHERE id = $1`, [documentId]);

  const pages = fixturePages ?? [];
  if (pages.length === 0) {
    await q.query(
      `UPDATE document SET ingest_status = 'quarantined', ingest_error = 'manual_transcription_required' WHERE id = $1`,
      [documentId],
    );
    return {
      documentId, status: 'quarantined', pages: 0, spans: 0, candidates: 0,
      promoted: 0, rejected: 0, conflictsCreated: 0, conflictsFlagged: 0, documentType: null,
    };
  }

  const normalized: NormalizedPage[] = [];
  for (const page of pages) {
    const ocr = await deps.ocr.extract({
      documentId,
      pageNumber: page.pageNumber,
      imageBytes: null,
      fixture: { plainText: page.plainText, spans: page.spans },
    });
    normalized.push({
      pageNumber: page.pageNumber,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      plainText: ocr.plainText,
      spans: ocr.spans,
      engine: ocr.engine,
      engineVersion: ocr.engineVersion,
    });
  }

  return ingestNormalizedPages(q, deps.extractor, documentId, normalized);
}

export interface ConfirmTypeInput {
  documentId: string;
  documentType: string;
  userId: string;
}

export async function confirmDocumentType(q: Querier, input: ConfirmTypeInput): Promise<void> {
  if (!isDocumentType(input.documentType)) throw new Error(`unknown_document_type:${input.documentType}`);
  const res = await q.query<{ org_id: string }>(
    `UPDATE document SET document_type = $2, type_confirmed_by = $3, type_confirmed_at = now()
      WHERE id = $1 RETURNING org_id`,
    [input.documentId, input.documentType, input.userId],
  );
  const orgId = res.rows[0]?.org_id;
  if (!orgId) throw new Error('document_not_found');
  await appendAuditEvent(q, {
    orgId,
    actor: { userId: input.userId, role: null },
    action: 'document.type_confirmed',
    entityKind: 'document',
    entityId: input.documentId,
    outcome: 'success',
    metadata: { document_type: input.documentType },
  });
}

/**
 * Near-duplicate detection (architecture §6.2).
 *
 * Deterministic: same document type, same document date, and >= 0.9
 * normalised-token similarity. Duplicates are *flagged for human
 * confirmation*, never auto-hidden — flagged documents stay in the inventory.
 */
export async function detectNearDuplicates(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<number> {
  const docsRes = await q.query<{
    id: string; document_type: string | null; document_date: string | null; text: string | null;
  }>(
    `SELECT d.id, d.document_type, d.document_date::text AS document_date,
            (SELECT string_agg(dp.plain_text, ' ') FROM document_page dp WHERE dp.document_id = d.id) AS text
       FROM document d
      WHERE d.org_id = $1 AND d.patient_id = $2 AND d.duplicate_of_document_id IS NULL
      ORDER BY d.uploaded_at`,
    [orgId, patientId],
  );

  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean));
  const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    return inter / (a.size + b.size - inter);
  };

  let flagged = 0;
  for (let i = 0; i < docsRes.rows.length; i += 1) {
    for (let j = i + 1; j < docsRes.rows.length; j += 1) {
      const a = docsRes.rows[i]!;
      const b = docsRes.rows[j]!;
      if (a.document_type !== b.document_type) continue;
      if ((a.document_date ?? '') !== (b.document_date ?? '')) continue;
      if (jaccard(tokenize(a.text ?? ''), tokenize(b.text ?? '')) < 0.9) continue;
      await q.query(
        `UPDATE document
            SET duplicate_of_document_id = $1, duplicate_status = 'duplicate_candidate'
          WHERE id = $2`,
        [a.id, b.id],
      );
      flagged += 1;
    }
  }
  return flagged;
}

export const DOCUMENT_TYPE_VOCABULARY = DOCUMENT_TYPES;
