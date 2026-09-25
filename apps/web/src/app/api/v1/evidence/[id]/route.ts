import { NextResponse } from 'next/server';
import {
  appendAuditEvent,
  getProvenance,
  getStorage,
  withTenant,
} from '@oncobrief/db';
import { resolveApiCaller } from '@/lib/auth-api';

/**
 * `GET /api/v1/evidence/{event_id}` (Phase 7).
 *
 * Returns everything the frontend needs to verify a fact against its source:
 * the fact and its state, the verbatim quote, page number, normalized bounding
 * box geometry, the document version hash, the full ledger history, and a
 * short-lived presigned URL for the original document.
 *
 * No evidence, no timeline event: an unknown or cross-tenant id returns 404,
 * never 403.
 */

const PAGE_PRESIGN_TTL_SECONDS = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveApiCaller(request);
  if (!session) return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });

  const { id } = await params;

  const result = await withTenant(session.ctx, async (q) => {
    const provenance = await getProvenance(q, id);
    if (!provenance) return null;

    const docRes = await q.query<{ storage_key: string; patient_id: string }>(
      'SELECT storage_key, patient_id FROM document WHERE id = $1',
      [provenance.fact.documentId],
    );
    const doc = docRes.rows[0];
    if (!doc) return null;

    let documentUrl: string | null = null;
    try {
      const storage = getStorage();
      documentUrl = await storage.presignGet(doc.storage_key, PAGE_PRESIGN_TTL_SECONDS);
    } catch {
      // Storage not reachable for a presign: still return provenance.
      documentUrl = null;
    }

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'document.page_viewed',
      entityKind: 'evidence_fact',
      entityId: id,
      outcome: 'success',
      metadata: { document_id: provenance.fact.documentId, purpose: 'evidence_source' },
    });

    return {
      event_id: provenance.fact.id,
      state: provenance.state,
      event_type: provenance.fact.factType,
      value: provenance.fact.valueJson,
      value_text: provenance.fact.valueText,
      date: provenance.fact.observedOn,
      confidence: {
        band: provenance.fact.confidenceBand,
        raw: provenance.fact.confidenceRaw,
      },
      extraction: {
        kind: provenance.fact.extractorKind,
        name: provenance.fact.extractorName,
        version: provenance.fact.extractorVersion,
        extracted_at: provenance.fact.createdAt,
      },
      correction: {
        corrects_fact_id: provenance.fact.correctsFactId,
        replacement_of: provenance.replacementOf,
      },
      source: {
        document_id: provenance.fact.documentId,
        document_name: provenance.fact.documentName,
        document_type: provenance.fact.documentType,
        document_version: provenance.fact.documentVersion,
        document_sha256: provenance.fact.documentContentSha256,
        issuing_facility: provenance.fact.issuingFacility,
        record_origin: provenance.fact.recordOrigin,
        verbatim_quote: provenance.fact.verbatimQuote,
        page_number: provenance.spans[0]?.pageNumber ?? null,
        document_url: documentUrl,
        document_url_expires_in_seconds: documentUrl ? PAGE_PRESIGN_TTL_SECONDS : null,
        page_geometry_url: `/api/v1/patients/${doc.patient_id}/documents/${provenance.fact.documentId}/pages/${provenance.spans[0]?.pageNumber ?? 1}`,
        regions: provenance.spans.map((s) => ({
          span_id: s.id,
          page_number: s.pageNumber,
          bbox: s.bbox,
          text: s.text,
          char_start: s.charStart,
          char_end: s.charEnd,
          ocr_engine: s.ocrEngine,
          ocr_engine_version: s.ocrEngineVersion,
          ocr_confidence: s.ocrConfidence,
        })),
      },
      history: provenance.history,
    };
  });

  if (!result) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  return NextResponse.json(result);
}
