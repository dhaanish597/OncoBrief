import {
  buildLongitudinalLabFlowsheet,
  buildMedicationHistory,
  computeIntervalDelta,
  type ConflictMetaInput,
  type FactType,
  type FactValue,
  type TimelineFactInput,
} from '@oncobrief/domain';
import type { Querier } from '../client';

/** Read-only projection from source facts and ledger events under caller RLS.
 * Callers must establish the authenticated tenant context, just as for getTimeline.
 * No last-consultation date is inferred or written by this service.
 */
export async function getLongitudinalReview(q: Querier, patientId: string) {
  const patient = await q.query<{
    last_consultation_date: string | null;
    approved_at: Date | null;
    ledger_seq_at_approval: string | null;
  }>(
    `SELECT p.last_consultation_date::text, cp.approved_at, cp.ledger_seq_at_approval::text
        FROM patient p
        LEFT JOIN LATERAL (
          SELECT approved_at, ledger_seq_at_approval FROM consultation_packet
           WHERE patient_id = p.id AND approved_at IS NOT NULL
             AND status IN ('approved', 'superseded')
           ORDER BY approved_at DESC, id LIMIT 1
        ) cp ON true
       WHERE p.id = $1`,
    [patientId],
  );
  const baseline = patient.rows[0];
  if (!baseline) return null;
  const facts = await q.query<{
    id: string;
    fact_type: FactType;
    value_json: FactValue;
    observed_on: string | null;
    state: TimelineFactInput['state'];
    document_id: string;
    original_filename: string;
    page_number: number | null;
    verbatim_quote: string;
    created_at: Date;
    changed_at: Date | null;
    last_seq: string | null;
    replaced_by: string | null;
  }>(
    `SELECT ef.id, ef.fact_type, ef.value_json, ef.observed_on::text,
             coalesce(es.state, 'extracted') AS state, ef.document_id, d.original_filename,
             ef.verbatim_quote, ef.created_at, changes.changed_at, changes.last_seq::text,
             (SELECT replacement.id FROM evidence_fact replacement
               WHERE replacement.corrects_fact_id = ef.id ORDER BY replacement.created_at, replacement.id LIMIT 1) AS replaced_by,
             (SELECT dp.page_number FROM evidence_span_link link
               JOIN text_span span ON span.id = link.text_span_id
               JOIN document_page dp ON dp.id = span.page_id
              WHERE link.evidence_fact_id = ef.id ORDER BY link.ordinal LIMIT 1) AS page_number
        FROM evidence_fact ef
        JOIN document d ON d.id = ef.document_id
        LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
        LEFT JOIN LATERAL (
          SELECT max(seq) AS last_seq, max(occurred_at) AS changed_at FROM ledger_entry
           WHERE evidence_fact_id = ef.id
        ) changes ON true
       WHERE ef.patient_id = $1
       ORDER BY ef.created_at, ef.id`,
    [patientId],
  );
  const documents = await q.query<{ id: string; uploaded_at: Date }>(
    `SELECT id, uploaded_at FROM document WHERE patient_id = $1
       AND ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'`,
    [patientId],
  );
  const conflicts = await q.query<{
    id: string;
    status: ConflictMetaInput['status'];
    detected_at: Date;
    reopened_at: Date | null;
    last_seq: string | null;
  }>(
    `SELECT c.id, c.status, c.detected_at, events.reopened_at, events.last_seq::text
        FROM conflict_set c
        LEFT JOIN LATERAL (
          SELECT max(occurred_at) AS reopened_at, max(seq) AS last_seq FROM ledger_entry
           WHERE conflict_set_id = c.id AND action = 'fact_flagged_conflicting'
        ) events ON true
       WHERE c.patient_id = $1`,
    [patientId],
  );
  const inputs: TimelineFactInput[] = facts.rows.map((f) => ({
    evidenceFactId: f.id,
    factType: f.fact_type,
    value: f.value_json,
    observedOn: f.observed_on,
    state: f.state,
    documentId: f.document_id,
    documentName: f.original_filename,
    pageNumber: f.page_number,
    verbatimQuote: f.verbatim_quote,
    createdAt: f.created_at.toISOString(),
    updatedAt: f.changed_at?.toISOString() ?? null,
    ...(f.last_seq ? { ledgerSeq: Number(f.last_seq) } : {}),
    replacedByFactId: f.replaced_by,
  }));
  const baselineDate =
    baseline.last_consultation_date ??
    baseline.approved_at?.toISOString() ??
    null;
  const interval = computeIntervalDelta(
    inputs,
    documents.rows.map((d) => ({
      documentId: d.id,
      uploadedAt: d.uploaded_at.toISOString(),
    })),
    baselineDate,
    {
      ...(!baseline.last_consultation_date && baseline.ledger_seq_at_approval
        ? { baselineLedgerSeq: Number(baseline.ledger_seq_at_approval) }
        : {}),
      conflicts: conflicts.rows.map((c) => ({
        conflictSetId: c.id,
        status: c.status,
        detectedAt: c.detected_at.toISOString(),
        reopenedAt: c.reopened_at?.toISOString() ?? null,
        ...(c.last_seq ? { ledgerSeq: Number(c.last_seq) } : {}),
      })),
    },
  );
  return {
    interval,
    labFlowsheet: buildLongitudinalLabFlowsheet(inputs),
    medicationHistory: buildMedicationHistory(inputs),
  };
}
