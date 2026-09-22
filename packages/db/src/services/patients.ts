import type { Querier } from '../client.js';

/**
 * Read models. Everything here is either a projection of the ledger or a
 * direct read; nothing is a second source of truth.
 */

export interface PatientListItem {
  id: string;
  displayName: string;
  demoCode: string | null;
  isDemoFixture: boolean;
  readinessBand: string | null;
  openConflicts: number;
  unverifiedFacts: number;
  missingRequired: number;
  openTasks: number;
  documentCount: number;
  appointmentDate: string | null;
}

export async function listPatients(q: Querier): Promise<PatientListItem[]> {
  const res = await q.query<{
    id: string; display_name: string; demo_code: string | null; is_demo_fixture: boolean;
    readiness_band: string | null; open_conflicts: string; unverified_facts: string;
    missing_required: string; open_tasks: string; document_count: string; appointment_date: string | null;
  }>(
    `SELECT p.id, p.display_name, p.demo_code, p.is_demo_fixture,
       (SELECT r.readiness_band FROM record_readiness_snapshot r
         WHERE r.patient_id = p.id ORDER BY r.computed_at DESC LIMIT 1) AS readiness_band,
       (SELECT count(*) FROM conflict_set c WHERE c.patient_id = p.id AND c.status='open')::text AS open_conflicts,
       (SELECT count(*) FROM evidence_state es WHERE es.patient_id = p.id AND es.state='extracted')::text AS unverified_facts,
       (SELECT count(*) FROM record_gap rg JOIN checklist_item ci ON ci.id = rg.checklist_item_id
          WHERE rg.patient_id = p.id AND rg.status='missing' AND ci.requirement_kind='required')::text AS missing_required,
       (SELECT count(*) FROM admin_task t WHERE t.patient_id = p.id AND t.status IN ('open','assigned','in_progress','blocked'))::text AS open_tasks,
       (SELECT count(*) FROM document d WHERE d.patient_id = p.id)::text AS document_count,
       (SELECT min(te.display_date)::text FROM timeline_event te
          WHERE te.patient_id = p.id AND te.display_date >= current_date) AS appointment_date
     FROM patient p
     ORDER BY (readiness_band IS NULL), readiness_band DESC, p.display_name`,
  );

  return res.rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    demoCode: r.demo_code,
    isDemoFixture: r.is_demo_fixture,
    readinessBand: r.readiness_band,
    openConflicts: Number(r.open_conflicts),
    unverifiedFacts: Number(r.unverified_facts),
    missingRequired: Number(r.missing_required),
    openTasks: Number(r.open_tasks),
    documentCount: Number(r.document_count),
    appointmentDate: r.appointment_date,
  }));
}

export async function getPatient(q: Querier, patientId: string) {
  const res = await q.query<{
    id: string; display_name: string; demo_code: string | null; is_demo_fixture: boolean;
  }>('SELECT id, display_name, demo_code, is_demo_fixture FROM patient WHERE id = $1', [patientId]);
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    demoCode: row.demo_code,
    isDemoFixture: row.is_demo_fixture,
  };
}

export interface TimelineRow {
  id: string;
  factType: string;
  valueText: string;
  displayDate: string | null;
  state: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  confidenceBand: string;
  extractorKind: string;
}

export async function getTimeline(q: Querier, patientId: string): Promise<TimelineRow[]> {
  const res = await q.query<{
    id: string; fact_type: string; value_text: string; display_date: string | null;
    state: string; document_id: string; original_filename: string; page_number: number | null;
    confidence_band: string; extractor_kind: string;
  }>(
    `SELECT te.id, te.fact_type, te.value_text, te.display_date::text AS display_date, te.state,
            te.document_id, d.original_filename,
            ef.confidence_band, ef.extractor_kind,
            (SELECT dp.page_number
               FROM evidence_span_link esl
               JOIN text_span ts ON ts.id = esl.text_span_id
               JOIN document_page dp ON dp.id = ts.page_id
              WHERE esl.evidence_fact_id = te.evidence_fact_id
              ORDER BY esl.ordinal LIMIT 1) AS page_number
       FROM timeline_event te
       JOIN document d ON d.id = te.document_id
       JOIN evidence_fact ef ON ef.id = te.evidence_fact_id
      WHERE te.patient_id = $1
      ORDER BY te.display_date NULLS LAST, te.updated_at`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    factType: r.fact_type,
    valueText: r.value_text,
    displayDate: r.display_date,
    state: r.state,
    documentId: r.document_id,
    documentName: r.original_filename,
    pageNumber: r.page_number,
    confidenceBand: r.confidence_band,
    extractorKind: r.extractor_kind,
  }));
}

export interface ProvenancePayload {
  fact: {
    id: string;
    factType: string;
    valueJson: unknown;
    valueText: string;
    verbatimQuote: string;
    observedOn: string | null;
    confidenceBand: string;
    confidenceRaw: number | null;
    extractorKind: string;
    extractorName: string;
    extractorVersion: string;
    correctsFactId: string | null;
    createdAt: string;
    documentId: string;
    documentName: string;
    documentVersion: number;
    documentContentSha256: string;
    documentType: string | null;
    typeConfirmed: boolean;
    recordOrigin: string;
    issuingFacility: string | null;
  };
  state: string;
  spans: {
    id: string;
    pageNumber: number;
    pageId: string;
    text: string;
    charStart: number;
    charEnd: number;
    bbox: { x: number; y: number; w: number; h: number };
    ocrEngine: string;
    ocrEngineVersion: string;
    ocrConfidence: number | null;
    ordinal: number;
  }[];
  history: {
    id: string;
    seq: number;
    action: string;
    fromState: string | null;
    toState: string;
    actorKind: string;
    actorName: string | null;
    reason: string | null;
    occurredAt: string;
  }[];
  replacementOf: string | null;
}

export async function getProvenance(
  q: Querier,
  factId: string,
): Promise<ProvenancePayload | null> {
  const factRes = await q.query<{
    id: string; fact_type: string; value_json: unknown; value_normalized: string;
    verbatim_quote: string; observed_on: string | null; confidence_band: string;
    confidence_raw: string | null; extractor_kind: string; extractor_name: string;
    extractor_version: string; corrects_fact_id: string | null; created_at: Date;
    document_id: string; original_filename: string; doc_version: number;
    content_sha256: Buffer; document_type: string | null; type_confirmed_by: string | null;
    record_origin: string; issuing_facility: string | null;
  }>(
    `SELECT ef.id, ef.fact_type, ef.value_json, ef.value_normalized, ef.verbatim_quote, ef.observed_on::text AS observed_on,
            ef.confidence_band, ef.confidence_raw::text AS confidence_raw, ef.extractor_kind, ef.extractor_name,
            ef.extractor_version, ef.corrects_fact_id, ef.created_at, ef.document_id,
            d.original_filename, d.doc_version, d.content_sha256, d.document_type,
            d.type_confirmed_by, d.record_origin, d.issuing_facility
       FROM evidence_fact ef JOIN document d ON d.id = ef.document_id
      WHERE ef.id = $1`,
    [factId],
  );
  const f = factRes.rows[0];
  if (!f) return null;

  const stateRes = await q.query<{ state: string }>(
    'SELECT state FROM evidence_state WHERE evidence_fact_id = $1',
    [factId],
  );

  const spansRes = await q.query<{
    id: string; page_number: number; page_id: string; text: string; char_start: number;
    char_end: number; bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number;
    ocr_engine: string; ocr_engine_version: string; ocr_confidence: number | null; ordinal: number;
  }>(
    `SELECT ts.id, dp.page_number, dp.id AS page_id, ts.text, ts.char_start, ts.char_end,
            ts.bbox_x, ts.bbox_y, ts.bbox_w, ts.bbox_h, ts.ocr_engine, ts.ocr_engine_version,
            ts.ocr_confidence, esl.ordinal
       FROM evidence_span_link esl
       JOIN text_span ts ON ts.id = esl.text_span_id
       JOIN document_page dp ON dp.id = ts.page_id
      WHERE esl.evidence_fact_id = $1
      ORDER BY esl.ordinal`,
    [factId],
  );

  const historyRes = await q.query<{
    id: string; seq: string; action: string; from_state: string | null; to_state: string;
    actor_kind: string; actor_name: string | null; reason: string | null; occurred_at: Date;
  }>(
    `SELECT le.id, le.seq::text AS seq, le.action, le.from_state, le.to_state, le.actor_kind,
            u.display_name AS actor_name, le.reason, le.occurred_at
       FROM ledger_entry le LEFT JOIN app_user u ON u.id = le.actor_user_id
      WHERE le.evidence_fact_id = $1
      ORDER BY le.seq`,
    [factId],
  );

  const replacement = await q.query<{ id: string }>(
    'SELECT id FROM evidence_fact WHERE corrects_fact_id = $1 ORDER BY created_at LIMIT 1',
    [factId],
  );

  return {
    fact: {
      id: f.id,
      factType: f.fact_type,
      valueJson: f.value_json,
      valueText: f.value_normalized,
      verbatimQuote: f.verbatim_quote,
      observedOn: f.observed_on,
      confidenceBand: f.confidence_band,
      confidenceRaw: f.confidence_raw === null ? null : Number(f.confidence_raw),
      extractorKind: f.extractor_kind,
      extractorName: f.extractor_name,
      extractorVersion: f.extractor_version,
      correctsFactId: f.corrects_fact_id,
      createdAt: f.created_at.toISOString(),
      documentId: f.document_id,
      documentName: f.original_filename,
      documentVersion: f.doc_version,
      documentContentSha256: f.content_sha256.toString('hex'),
      documentType: f.document_type,
      typeConfirmed: f.type_confirmed_by !== null,
      recordOrigin: f.record_origin,
      issuingFacility: f.issuing_facility,
    },
    state: stateRes.rows[0]?.state ?? 'extracted',
    spans: spansRes.rows.map((s) => ({
      id: s.id,
      pageNumber: s.page_number,
      pageId: s.page_id,
      text: s.text,
      charStart: s.char_start,
      charEnd: s.char_end,
      bbox: { x: s.bbox_x, y: s.bbox_y, w: s.bbox_w, h: s.bbox_h },
      ocrEngine: s.ocr_engine,
      ocrEngineVersion: s.ocr_engine_version,
      ocrConfidence: s.ocr_confidence,
      ordinal: s.ordinal,
    })),
    history: historyRes.rows.map((h) => ({
      id: h.id,
      seq: Number(h.seq),
      action: h.action,
      fromState: h.from_state,
      toState: h.to_state,
      actorKind: h.actor_kind,
      actorName: h.actor_name,
      reason: h.reason,
      occurredAt: h.occurred_at.toISOString(),
    })),
    replacementOf: replacement.rows[0]?.id ?? null,
  };
}

export interface ConflictListRow {
  id: string;
  factType: string;
  slotKey: string;
  status: string;
  detectionReason: string;
  detectedAt: string;
  memberCount: number;
  memberValueTexts: string[];
}

export async function listConflicts(
  q: Querier,
  patientId: string,
  status?: string,
): Promise<ConflictListRow[]> {
  const res = await q.query<{
    id: string; fact_type: string; slot_key: string; status: string; detection_reason: string;
    detected_at: Date; member_count: string; member_values: string[] | null;
  }>(
    `SELECT cs.id, cs.fact_type, cs.slot_key, cs.status, cs.detection_reason, cs.detected_at,
            count(cm.evidence_fact_id)::text AS member_count,
            array_agg(ef.value_normalized ORDER BY ef.created_at) AS member_values
       FROM conflict_set cs
       JOIN conflict_member cm ON cm.conflict_set_id = cs.id
       JOIN evidence_fact ef ON ef.id = cm.evidence_fact_id
      WHERE cs.patient_id = $1 AND ($2::text IS NULL OR cs.status::text = $2)
      GROUP BY cs.id
      ORDER BY cs.status, cs.detected_at DESC`,
    [patientId, status ?? null],
  );
  return res.rows.map((r) => ({
    id: r.id,
    factType: r.fact_type,
    slotKey: r.slot_key,
    status: r.status,
    detectionReason: r.detection_reason,
    detectedAt: r.detected_at.toISOString(),
    memberCount: Number(r.member_count),
    memberValueTexts: r.member_values ?? [],
  }));
}

export async function listDocuments(q: Querier, patientId: string) {
  const res = await q.query<{
    id: string; original_filename: string; mime_type: string; byte_size: string;
    document_type: string | null; type_confirmed_by: string | null; type_confidence: string | null;
    document_date: string | null; issuing_facility: string | null; record_origin: string;
    ingest_status: string; ingest_error: string | null; page_count: number | null;
    doc_version: number; duplicate_of_document_id: string | null; is_demo_fixture: boolean;
    fact_count: string;
  }>(
    `SELECT d.id, d.original_filename, d.mime_type, d.byte_size::text AS byte_size, d.document_type,
            d.type_confirmed_by, d.type_confidence, d.document_date::text AS document_date,
            d.issuing_facility, d.record_origin, d.ingest_status, d.ingest_error, d.page_count,
            d.doc_version, d.duplicate_of_document_id, d.is_demo_fixture,
            (SELECT count(*) FROM evidence_fact ef WHERE ef.document_id = d.id)::text AS fact_count
       FROM document d WHERE d.patient_id = $1 ORDER BY d.document_date NULLS LAST, d.original_filename`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    filename: r.original_filename,
    mimeType: r.mime_type,
    byteSize: Number(r.byte_size),
    documentType: r.document_type,
    typeConfirmed: r.type_confirmed_by !== null,
    typeConfidence: r.type_confidence,
    documentDate: r.document_date,
    issuingFacility: r.issuing_facility,
    recordOrigin: r.record_origin,
    ingestStatus: r.ingest_status,
    ingestError: r.ingest_error,
    pageCount: r.page_count,
    docVersion: r.doc_version,
    duplicateOf: r.duplicate_of_document_id,
    isDemoFixture: r.is_demo_fixture,
    factCount: Number(r.fact_count),
  }));
}

export async function listTasks(q: Querier, patientId: string) {
  const res = await q.query<{
    id: string; title: string; detail: string | null; task_kind: string; status: string;
    due_on: string | null; origin_kind: string; origin_evidence_fact_id: string | null;
    origin_record_gap_id: string | null; origin_conflict_set_id: string | null;
    origin_document_id: string | null; assignee_name: string | null; creator_name: string | null;
    created_at: Date;
  }>(
    `SELECT t.id, t.title, t.detail, t.task_kind, t.status, t.due_on::text AS due_on, t.origin_kind,
            t.origin_evidence_fact_id, t.origin_record_gap_id, t.origin_conflict_set_id, t.origin_document_id,
            a.display_name AS assignee_name, c.display_name AS creator_name, t.created_at
       FROM admin_task t
       LEFT JOIN app_user a ON a.id = t.assigned_to
       LEFT JOIN app_user c ON c.id = t.created_by
      WHERE t.patient_id = $1
      ORDER BY (t.status IN ('done','cancelled')), t.due_on NULLS LAST, t.created_at DESC`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    title: r.title,
    detail: r.detail,
    taskKind: r.task_kind,
    status: r.status,
    dueOn: r.due_on,
    originKind: r.origin_kind,
    origin: {
      evidenceFactId: r.origin_evidence_fact_id,
      recordGapId: r.origin_record_gap_id,
      conflictSetId: r.origin_conflict_set_id,
      documentId: r.origin_document_id,
    },
    assigneeName: r.assignee_name,
    creatorName: r.creator_name,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listAudit(
  q: Querier,
  filter: { patientId?: string | null; entityId?: string | null; action?: string | null; limit?: number },
) {
  const res = await q.query<{
    id: string; seq: string; action: string; entity_kind: string; entity_id: string | null;
    outcome: string; actor_role: string | null; actor_name: string | null; occurred_at: Date;
    metadata_json: unknown;
  }>(
    `SELECT a.id, a.seq::text AS seq, a.action, a.entity_kind, a.entity_id, a.outcome,
            a.actor_role, u.display_name AS actor_name, a.occurred_at, a.metadata_json
       FROM audit_event a LEFT JOIN app_user u ON u.id = a.actor_user_id
      WHERE ($1::uuid IS NULL OR a.entity_id = $1)
        AND ($2::text IS NULL OR a.action = $2)
      ORDER BY a.seq DESC
      LIMIT $3`,
    [filter.entityId ?? null, filter.action ?? null, filter.limit ?? 200],
  );
  return res.rows.map((r) => ({
    id: r.id,
    seq: Number(r.seq),
    action: r.action,
    entityKind: r.entity_kind,
    entityId: r.entity_id,
    outcome: r.outcome,
    actorRole: r.actor_role,
    actorName: r.actor_name,
    occurredAt: r.occurred_at.toISOString(),
    metadata: r.metadata_json,
  }));
}

export async function listRecordMap(q: Querier, patientId: string) {
  const gapsRes = await q.query<{
    id: string; label: string; requirement_kind: string; status: string; rationale: string;
    required_document_type: string; satisfied_by_document_id: string | null; candidate_document_id: string | null;
  }>(
    `SELECT rg.id, ci.label, ci.requirement_kind, rg.status, ci.rationale, ci.required_document_type,
            rg.satisfied_by_document_id, rg.candidate_document_id
       FROM record_gap rg JOIN checklist_item ci ON ci.id = rg.checklist_item_id
      WHERE rg.patient_id = $1 ORDER BY ci.ordinal`,
    [patientId],
  );

  const originRes = await q.query<{
    record_origin: string; n: string; types: string[] | null;
  }>(
    `SELECT record_origin, count(*)::text AS n, array_agg(DISTINCT coalesce(document_type,'other')) AS types
       FROM document WHERE patient_id = $1 GROUP BY record_origin`,
    [patientId],
  );

  const readiness = await q.query<{ readiness_band: string; computed_at: Date; inputs_json: unknown }>(
    `SELECT readiness_band, computed_at, inputs_json FROM record_readiness_snapshot
      WHERE patient_id = $1 ORDER BY computed_at DESC LIMIT 1`,
    [patientId],
  );

  return {
    gaps: gapsRes.rows.map((r) => ({
      id: r.id,
      label: r.label,
      requirementKind: r.requirement_kind,
      status: r.status,
      rationale: r.rationale,
      requiredDocumentType: r.required_document_type,
      satisfiedByDocumentId: r.satisfied_by_document_id,
      candidateDocumentId: r.candidate_document_id,
    })),
    origins: originRes.rows.map((r) => ({
      recordOrigin: r.record_origin,
      count: Number(r.n),
      documentTypes: r.types ?? [],
    })),
    readiness: readiness.rows[0]
      ? {
          band: readiness.rows[0].readiness_band,
          computedAt: readiness.rows[0].computed_at.toISOString(),
          inputs: readiness.rows[0].inputs_json,
        }
      : null,
  };
}
