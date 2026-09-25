import type { Querier } from '../client';

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
     ORDER BY readiness_band DESC NULLS LAST, p.display_name`,
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
  evidenceFactId: string;
  factType: string;
  valueText: string;
  displayDate: string | null;
  observedOn: string | null;
  state: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  confidenceBand: string;
  extractorKind: string;
  extractorName: string;
  extractorVersion: string;
  verbatimQuote: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  correctsFactId: string | null;
  replacedByFactId: string | null;
  version: number;
}

export async function getTimeline(q: Querier, patientId: string): Promise<TimelineRow[]> {
  const res = await q.query<{
    id: string; evidence_fact_id: string; fact_type: string; value_text: string;
    display_date: string | null; observed_on: string | null; state: string;
    document_id: string; original_filename: string; page_number: number | null;
    confidence_band: string; extractor_kind: string; extractor_name: string; extractor_version: string;
    verbatim_quote: string; reviewer_name: string | null; reviewed_at: Date | null;
    corrects_fact_id: string | null; replaced_by_fact_id: string | null; version: string;
  }>(
    `SELECT te.id, te.evidence_fact_id, te.fact_type, te.value_text,
            te.display_date::text AS display_date, ef.observed_on::text AS observed_on, te.state,
            te.document_id, d.original_filename,
            ef.confidence_band, ef.extractor_kind, ef.extractor_name, ef.extractor_version,
            ef.verbatim_quote, ef.corrects_fact_id,
            u.display_name AS reviewer_name, es.last_changed_at AS reviewed_at,
            (SELECT count(*) FROM ledger_entry le WHERE le.evidence_fact_id = ef.id)::text AS version,
            (SELECT r.id FROM evidence_fact r WHERE r.corrects_fact_id = ef.id ORDER BY r.created_at LIMIT 1) AS replaced_by_fact_id,
            (SELECT dp.page_number
               FROM evidence_span_link esl
               JOIN text_span ts ON ts.id = esl.text_span_id
               JOIN document_page dp ON dp.id = ts.page_id
              WHERE esl.evidence_fact_id = te.evidence_fact_id
              ORDER BY esl.ordinal LIMIT 1) AS page_number
       FROM timeline_event te
       JOIN document d ON d.id = te.document_id
       JOIN evidence_fact ef ON ef.id = te.evidence_fact_id
       LEFT JOIN evidence_state es ON es.evidence_fact_id = te.evidence_fact_id
       LEFT JOIN app_user u ON u.id = es.last_actor_id
      WHERE te.patient_id = $1
      ORDER BY te.display_date NULLS LAST, te.updated_at`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    evidenceFactId: r.evidence_fact_id,
    factType: r.fact_type,
    valueText: r.value_text,
    displayDate: r.display_date,
    observedOn: r.observed_on,
    state: r.state,
    documentId: r.document_id,
    documentName: r.original_filename,
    pageNumber: r.page_number,
    confidenceBand: r.confidence_band,
    extractorKind: r.extractor_kind,
    extractorName: r.extractor_name,
    extractorVersion: r.extractor_version,
    verbatimQuote: r.verbatim_quote,
    reviewerName: r.reviewer_name,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    correctsFactId: r.corrects_fact_id,
    replacedByFactId: r.replaced_by_fact_id,
    version: Number(r.version),
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
      documentContentSha256: f.content_sha256 ? f.content_sha256.toString('hex') : '',
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

export interface ConflictMemberDetail {
  factId: string;
  valueText: string;
  state: string;
  observedOn: string | null;
  verbatimQuote: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  spanIds: string[];
  pageSpans: PageSpanRow[];
  extractorKind: string;
  extractorName: string;
  confidenceBand: string;
  reviewerName: string | null;
  createdAt: string;
}

export interface ConflictDetail {
  id: string;
  factType: string;
  slotKey: string;
  status: string;
  detectionReason: string;
  detectedAt: string;
  resolvedKind: string | null;
  resolvedReason: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  members: ConflictMemberDetail[];
}

export async function getConflict(
  q: Querier,
  patientId: string,
  conflictId: string,
): Promise<ConflictDetail | null> {
  const cs = await q.query<{
    id: string; fact_type: string; slot_key: string; status: string; detection_reason: string;
    detected_at: Date; resolution_kind: string | null; resolution_reason: string | null;
    resolved_by_name: string | null; resolved_at: Date | null;
  }>(
    `SELECT cs.id, cs.fact_type, cs.slot_key, cs.status, cs.detection_reason, cs.detected_at,
            cs.resolution_kind, cs.resolution_reason, cs.resolved_at,
            ru.display_name AS resolved_by_name
       FROM conflict_set cs LEFT JOIN app_user ru ON ru.id = cs.resolved_by
      WHERE cs.id = $1 AND cs.patient_id = $2`,
    [conflictId, patientId],
  );
  const c = cs.rows[0];
  if (!c) return null;

  const members = await q.query<{
    id: string; value_normalized: string; state: string; observed_on: string | null;
    verbatim_quote: string; document_id: string; original_filename: string; page_number: number | null;
    extractor_kind: string; extractor_name: string; confidence_band: string;
    reviewer_name: string | null; created_at: Date; span_ids: string[] | null;
  }>(
    `SELECT ef.id, ef.value_normalized, coalesce(es.state,'extracted') AS state,
            ef.observed_on::text AS observed_on, ef.verbatim_quote, ef.document_id,
            d.original_filename, ef.extractor_kind, ef.extractor_name, ef.confidence_band,
            u.display_name AS reviewer_name, ef.created_at,
            (SELECT array_agg(esl.text_span_id ORDER BY esl.ordinal)
               FROM evidence_span_link esl WHERE esl.evidence_fact_id = ef.id) AS span_ids,
            (SELECT dp.page_number
               FROM evidence_span_link esl
               JOIN text_span ts ON ts.id = esl.text_span_id
               JOIN document_page dp ON dp.id = ts.page_id
              WHERE esl.evidence_fact_id = ef.id ORDER BY esl.ordinal LIMIT 1) AS page_number
       FROM conflict_member cm
       JOIN evidence_fact ef ON ef.id = cm.evidence_fact_id
       JOIN document d ON d.id = ef.document_id
       LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
       LEFT JOIN app_user u ON u.id = es.last_actor_id
      WHERE cm.conflict_set_id = $1
      ORDER BY ef.created_at`,
    [conflictId],
  );

  const memberDetails: ConflictMemberDetail[] = [];
  for (const m of members.rows) {
    const pageNumber = m.page_number ?? 1;
    const page = await getPageSpans(q, m.document_id, pageNumber);
    memberDetails.push({
      factId: m.id,
      valueText: m.value_normalized,
      state: m.state,
      observedOn: m.observed_on,
      verbatimQuote: m.verbatim_quote,
      documentId: m.document_id,
      documentName: m.original_filename,
      pageNumber,
      spanIds: m.span_ids ?? [],
      pageSpans: page?.spans ?? [],
      extractorKind: m.extractor_kind,
      extractorName: m.extractor_name,
      confidenceBand: m.confidence_band,
      reviewerName: m.reviewer_name,
      createdAt: m.created_at.toISOString(),
    });
  }

  return {
    id: c.id,
    factType: c.fact_type,
    slotKey: c.slot_key,
    status: c.status,
    detectionReason: c.detection_reason,
    detectedAt: c.detected_at.toISOString(),
    resolvedKind: c.resolution_kind,
    resolvedReason: c.resolution_reason,
    resolvedByName: c.resolved_by_name,
    resolvedAt: c.resolved_at ? c.resolved_at.toISOString() : null,
    members: memberDetails,
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
  resolvedKind: string | null;
  resolvedReason: string | null;
  resolvedByName: string | null;
}

export async function getDocument(q: Querier, patientId: string, documentId: string) {
  const res = await q.query<{
    id: string; original_filename: string; mime_type: string; document_type: string | null;
    type_confirmed_by: string | null; document_date: string | null; issuing_facility: string | null;
    record_origin: string; ingest_status: string; ingest_error: string | null; page_count: number | null;
    doc_version: number; duplicate_of_document_id: string | null; is_demo_fixture: boolean;
    content_sha256: Buffer;
  }>(
    `SELECT id, original_filename, mime_type, document_type, type_confirmed_by,
            document_date::text AS document_date, issuing_facility, record_origin, ingest_status,
            ingest_error, page_count, doc_version, duplicate_of_document_id, is_demo_fixture, content_sha256
       FROM document WHERE id = $1 AND patient_id = $2`,
    [documentId, patientId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    filename: r.original_filename,
    mimeType: r.mime_type,
    documentType: r.document_type,
    typeConfirmed: r.type_confirmed_by !== null,
    documentDate: r.document_date,
    issuingFacility: r.issuing_facility,
    recordOrigin: r.record_origin,
    ingestStatus: r.ingest_status,
    ingestError: r.ingest_error,
    pageCount: r.page_count,
    docVersion: r.doc_version,
    duplicateOf: r.duplicate_of_document_id,
    isDemoFixture: r.is_demo_fixture,
    contentSha256: r.content_sha256 ? r.content_sha256.toString('hex') : '',
  };
}

export interface PageSpanRow {
  id: string;
  text: string;
  charStart: number;
  charEnd: number;
  bbox: { x: number; y: number; w: number; h: number };
  ocrEngine: string;
  ocrEngineVersion: string;
  ocrConfidence: number | null;
  granularity: string;
  spanIndex: number;
}

export async function getPageSpans(
  q: Querier,
  documentId: string,
  pageNumber: number,
): Promise<{ plainText: string; pageId: string; spans: PageSpanRow[] } | null> {
  const page = await q.query<{ id: string; plain_text: string }>(
    'SELECT id, plain_text FROM document_page WHERE document_id = $1 AND page_number = $2',
    [documentId, pageNumber],
  );
  const p = page.rows[0];
  if (!p) return null;

  const spans = await q.query<{
    id: string; text: string; char_start: number; char_end: number; bbox_x: number;
    bbox_y: number; bbox_w: number; bbox_h: number; ocr_engine: string;
    ocr_engine_version: string; ocr_confidence: number | null; granularity: string; span_index: number;
  }>(
    `SELECT id, text, char_start, char_end, bbox_x, bbox_y, bbox_w, bbox_h,
            ocr_engine, ocr_engine_version, ocr_confidence, granularity, span_index
       FROM text_span WHERE page_id = $1 ORDER BY span_index`,
    [p.id],
  );

  return {
    plainText: p.plain_text,
    pageId: p.id,
    spans: spans.rows.map((s) => ({
      id: s.id,
      text: s.text,
      charStart: s.char_start,
      charEnd: s.char_end,
      bbox: { x: s.bbox_x, y: s.bbox_y, w: s.bbox_w, h: s.bbox_h },
      ocrEngine: s.ocr_engine,
      ocrEngineVersion: s.ocr_engine_version,
      ocrConfidence: s.ocr_confidence,
      granularity: s.granularity,
      spanIndex: s.span_index,
    })),
  };
}

export async function listConflicts(
  q: Querier,
  patientId: string,
  status?: string,
): Promise<ConflictListRow[]> {
  const res = await q.query<{
    id: string; fact_type: string; slot_key: string; status: string; detection_reason: string;
    detected_at: Date; member_count: string; member_values: string[] | null;
    resolution_kind: string | null; resolution_reason: string | null; resolved_by_name: string | null;
  }>(
    `SELECT cs.id, cs.fact_type, cs.slot_key, cs.status, cs.detection_reason, cs.detected_at,
            cs.resolution_kind, cs.resolution_reason,
            ru.display_name AS resolved_by_name,
            count(cm.evidence_fact_id)::text AS member_count,
            array_agg(ef.value_normalized ORDER BY ef.created_at) AS member_values
       FROM conflict_set cs
       JOIN conflict_member cm ON cm.conflict_set_id = cs.id
       JOIN evidence_fact ef ON ef.id = cm.evidence_fact_id
       LEFT JOIN app_user ru ON ru.id = cs.resolved_by
      WHERE cs.patient_id = $1 AND ($2::text IS NULL OR cs.status::text = $2)
      GROUP BY cs.id, ru.display_name
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
    resolvedKind: r.resolution_kind,
    resolvedReason: r.resolution_reason,
    resolvedByName: r.resolved_by_name,
  }));
}

export async function listPackets(q: Querier, patientId: string) {
  const res = await q.query<{
    id: string; encounter_label: string; status: string; created_at: Date;
    approved_at: Date | null; ledger_seq_at_approval: string | null;
  }>(
    `SELECT id, encounter_label, status, created_at, approved_at, ledger_seq_at_approval::text AS ledger_seq_at_approval
       FROM consultation_packet WHERE patient_id = $1 ORDER BY created_at DESC`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    encounterLabel: r.encounter_label,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
    ledgerSeqAtApproval:
      r.ledger_seq_at_approval === null ? null : Number(r.ledger_seq_at_approval),
  }));
}

export async function listMessageTemplates(q: Querier) {
  const res = await q.query<{
    id: string; code: string; locale: string; version: number; body_template: string;
    allowed_variables: string[];
  }>(
    `SELECT id, code, locale, version, body_template, allowed_variables
       FROM message_template ORDER BY code, locale, version DESC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    locale: r.locale,
    version: r.version,
    bodyTemplate: r.body_template,
    allowedVariables: r.allowed_variables,
  }));
}

export async function listMessages(q: Querier, patientId: string) {
  const res = await q.query<{
    id: string; locale: string; body_rendered: string; status: string; created_at: Date;
    approved_at: Date | null; approver_name: string | null; composer_name: string | null;
    template_code: string; simulated: boolean | null; external_ref: string | null;
  }>(
    `SELECT pm.id, pm.locale, pm.body_rendered, pm.status, pm.created_at, pm.approved_at,
            ap.display_name AS approver_name, cp.display_name AS composer_name,
            mt.code AS template_code, ob.simulated, ob.external_ref
       FROM patient_message pm
       JOIN message_template mt ON mt.id = pm.template_id
       LEFT JOIN app_user ap ON ap.id = pm.approved_by
       LEFT JOIN app_user cp ON cp.id = pm.composed_by
       LEFT JOIN LATERAL (
         SELECT simulated, external_ref FROM message_outbox o
          WHERE o.patient_message_id = pm.id ORDER BY attempted_at DESC LIMIT 1
       ) ob ON true
      WHERE pm.patient_id = $1
      ORDER BY pm.created_at DESC`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    locale: r.locale,
    bodyRendered: r.body_rendered,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
    approverName: r.approver_name,
    composerName: r.composer_name,
    templateCode: r.template_code,
    simulated: r.simulated,
    externalRef: r.external_ref,
  }));
}

export async function listMessageVariables(q: Querier, messageId: string) {
  const res = await q.query<{
    variable_name: string; source_kind: string; evidence_fact_id: string | null;
    literal_value: string | null; fact_state: string | null; fact_type: string | null;
    fact_value: string | null; document_id: string | null; original_filename: string | null;
  }>(
    `SELECT mvs.variable_name, mvs.source_kind, mvs.evidence_fact_id, mvs.literal_value,
            es.state AS fact_state, ef.fact_type, ef.value_normalized AS fact_value,
            ef.document_id, d.original_filename
       FROM message_variable_source mvs
       LEFT JOIN evidence_fact ef ON ef.id = mvs.evidence_fact_id
       LEFT JOIN evidence_state es ON es.evidence_fact_id = mvs.evidence_fact_id
       LEFT JOIN document d ON d.id = ef.document_id
      WHERE mvs.patient_message_id = $1
      ORDER BY mvs.variable_name`,
    [messageId],
  );
  return res.rows.map((r) => ({
    variableName: r.variable_name,
    sourceKind: r.source_kind,
    evidenceFactId: r.evidence_fact_id,
    literalValue: r.literal_value,
    factState: r.fact_state,
    factType: r.fact_type,
    factValue: r.fact_value,
    documentId: r.document_id,
    documentName: r.original_filename,
  }));
}

/** Verified appointment facts available to back a message variable. */
export async function listVerifiedAppointments(q: Querier, patientId: string) {
  const res = await q.query<{ id: string; value_normalized: string; observed_on: string | null }>(
    `SELECT ef.id, ef.value_normalized, ef.observed_on::text AS observed_on
       FROM evidence_fact ef JOIN evidence_state es ON es.evidence_fact_id = ef.id
      WHERE ef.patient_id = $1 AND ef.fact_type = 'appointment.recorded'
        AND es.state IN ('verified','corrected')
      ORDER BY ef.observed_on NULLS LAST`,
    [patientId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    valueText: r.value_normalized,
    observedOn: r.observed_on,
  }));
}

export async function listPatientAudit(q: Querier, patientId: string) {
  const res = await q.query<{
    id: string; seq: string; action: string; entity_kind: string; entity_id: string | null;
    outcome: string; actor_role: string | null; actor_name: string | null; occurred_at: Date;
    metadata_json: unknown;
  }>(
    `SELECT a.id, a.seq::text AS seq, a.action, a.entity_kind, a.entity_id, a.outcome,
            a.actor_role, u.display_name AS actor_name, a.occurred_at, a.metadata_json
       FROM audit_event a
       LEFT JOIN app_user u ON u.id = a.actor_user_id
      WHERE a.entity_id = $1
         OR a.entity_id IN (
              SELECT id FROM evidence_fact WHERE patient_id = $1
              UNION SELECT id FROM document WHERE patient_id = $1
              UNION SELECT id FROM conflict_set WHERE patient_id = $1
              UNION SELECT id FROM admin_task WHERE patient_id = $1
              UNION SELECT id FROM consultation_packet WHERE patient_id = $1
              UNION SELECT id FROM patient_message WHERE patient_id = $1
              UNION SELECT id FROM record_gap WHERE patient_id = $1
            )
      ORDER BY a.seq DESC
      LIMIT 400`,
    [patientId],
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

export interface ConversationListItem {
  id: string;
  title: string;
  patientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listConversations(q: Querier, userId: string, patientId?: string | null): Promise<ConversationListItem[]> {
  let whereClause = 'WHERE c.user_id = $1';
  const params: (string | null)[] = [userId];
  if (patientId) {
    whereClause += ' AND c.patient_id = $2';
    params.push(patientId);
  }
  const res = await q.query<{
    id: string; title: string; patient_id: string | null; created_at: Date; updated_at: Date;
  }>(
    `SELECT id, title, patient_id, created_at, updated_at FROM conversation c
       ${whereClause}
       ORDER BY updated_at DESC LIMIT 50`,
    params,
  );
  return res.rows.map((r) => ({
    id: r.id,
    title: r.title,
    patientId: r.patient_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export interface ConversationWithMessages {
  id: string;
  title: string;
  patientId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent: string | null;
  grounded: boolean;
  sources: unknown[];
  navigation: unknown | null;
  createdAt: string;
}

export async function getConversation(q: Querier, conversationId: string, userId: string): Promise<ConversationWithMessages | null> {
  const convRes = await q.query<{
    id: string; title: string; patient_id: string | null; created_at: Date; updated_at: Date;
  }>(
    `SELECT id, title, patient_id, created_at, updated_at FROM conversation
       WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  const conv = convRes.rows[0];
  if (!conv) return null;

  const msgRes = await q.query<{
    id: string; role: string; content: string; intent: string | null; grounded: boolean;
    sources_json: unknown; navigation_json: unknown | null; created_at: Date;
  }>(
    `SELECT id, role, content, intent, grounded, sources_json, navigation_json, created_at
       FROM chat_message WHERE conversation_id = $1 ORDER BY created_at`,
    [conversationId],
  );

  return {
    id: conv.id,
    title: conv.title,
    patientId: conv.patient_id,
    createdAt: conv.created_at.toISOString(),
    updatedAt: conv.updated_at.toISOString(),
    messages: msgRes.rows.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      intent: m.intent,
      grounded: m.grounded,
      sources: m.sources_json as unknown[],
      navigation: m.navigation_json,
      createdAt: m.created_at.toISOString(),
    })),
  };
}

export async function createConversation(q: Querier, input: {
  orgId: string;
  userId: string;
  patientId: string | null;
  title?: string;
}): Promise<{ id: string }> {
  const res = await q.query<{ id: string }>(
    `INSERT INTO conversation (org_id, user_id, patient_id, title)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.orgId, input.userId, input.patientId, input.title ?? 'New conversation'],
  );
  return { id: res.rows[0]!.id };
}

export async function updateConversationTitle(q: Querier, conversationId: string, userId: string, title: string): Promise<void> {
  await q.query(
    `UPDATE conversation SET title = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
    [title, conversationId, userId],
  );
}

export async function deleteConversation(q: Querier, conversationId: string, userId: string): Promise<void> {
  await q.query(
    `DELETE FROM conversation WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
}

export interface AddMessageInput {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: string | null;
  grounded?: boolean;
  sources?: unknown[];
  navigation?: unknown | null;
}

export async function addMessage(q: Querier, input: AddMessageInput): Promise<{ id: string }> {
  // `now()` is transaction time, so a user and an assistant message written in
  // one transaction would share a timestamp and lose their order. Use the
  // statement clock so history replays in the order it was produced.
  const res = await q.query<{ id: string }>(
    `INSERT INTO chat_message (org_id, conversation_id, role, content, intent, grounded, sources_json, navigation_json, created_at)
     SELECT c.org_id, $1, $2, $3, $4, $5, $6, $7, clock_timestamp()
     FROM conversation c WHERE c.id = $1
     RETURNING id`,
    [input.conversationId, input.role, input.content, input.intent ?? null, input.grounded ?? false,
     JSON.stringify(input.sources ?? []), JSON.stringify(input.navigation ?? null)],
  );
  // Update conversation updated_at
  await q.query(
    `UPDATE conversation SET updated_at = now() WHERE id = $1`,
    [input.conversationId],
  );
  return { id: res.rows[0]!.id };
}
