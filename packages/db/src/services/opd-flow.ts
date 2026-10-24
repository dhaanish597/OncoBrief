import {
  can,
  canTransitionOpd,
  clinicLocalDate,
  rankWaitlistForVacantSlot,
  type OpdStatus,
  type Role,
  type WaitlistCandidateInput,
} from '@oncobrief/domain';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';
import { computeAndPersistReadiness } from './twin';

interface ActorInput {
  orgId: string;
  actorId: string;
}
interface MutationInput extends ActorInput {
  slotId: string;
  requestId: string;
}
interface OfferInput extends MutationInput {
  waitlistEntryId: string;
}
export interface OpdSlotRow {
  id: string;
  clinic_date: string;
  slot_start_time: string;
  slot_end_time: string;
  room_label: string;
  clinic_key: string | null;
  clinic_timezone: string;
  patient_id: string | null;
  patient_name: string | null;
  token_number: string | null;
  status: OpdStatus;
  priority_tag: string;
  priority_provenance: string | null;
  checked_in_at: string | null;
  bottleneck_note: string | null;
  readiness_band: string | null;
  readiness_reasons: string[];
  offered_patient_name: string | null;
  offer_waitlist_id: string | null;
}
interface SlotRecord {
  id: string;
  org_id: string;
  clinic_date: string;
  slot_start_time: string;
  slot_end_time: string;
  room_label: string;
  clinic_key: string | null;
  clinic_timezone: string;
  patient_id: string | null;
  status: OpdStatus;
  priority_tag: string;
}
export async function requireOpdActor(
  q: Querier,
  input: ActorInput,
): Promise<Role> {
  const r = await q.query<{ role: Role }>(
    `SELECT m.role FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2 AND u.is_active AND current_setting('app.org_id',true)=$1::text AND current_setting('app.user_id',true)=$2::text AND current_setting('app.role',true)=m.role::text`,
    [input.orgId, input.actorId],
  );
  const role = r.rows[0]?.role;
  if (!role || !can(role, 'opd:manage')) throw new Error('forbidden');
  return role;
}
async function lockOperations(q: Querier, orgId: string) {
  await q.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('opd:'||$1::text,0))`,
    [orgId],
  );
}
async function slot(q: Querier, input: MutationInput): Promise<SlotRecord> {
  const r = await q.query<SlotRecord>(
    `SELECT *,clinic_date::text,slot_start_time::text,slot_end_time::text FROM opd_appointment_slot WHERE org_id=$1 AND id=$2 FOR UPDATE`,
    [input.orgId, input.slotId],
  );
  if (!r.rows[0]) throw new Error('slot_not_found');
  return r.rows[0];
}
async function replay(
  q: Querier,
  input: MutationInput,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!input.requestId || input.requestId.length > 120)
    throw new Error('invalid_request_id');
  const r = await q.query<{
    actor_id: string;
    request_payload: Record<string, unknown>;
  }>(
    `SELECT actor_id,request_payload FROM opd_slot_event WHERE org_id=$1 AND request_id=$2`,
    [input.orgId, input.requestId],
  );
  if (!r.rows[0]) return false;
  if (
    r.rows[0].actor_id !== input.actorId ||
    JSON.stringify(r.rows[0].request_payload) !==
      JSON.stringify(
        JSON.parse(JSON.stringify(payload, Object.keys(payload).sort())),
      )
  ) {
    // PostgreSQL JSONB key order is not JavaScript insertion order.
    if (
      r.rows[0].actor_id !== input.actorId ||
      Object.keys(payload).length !==
        Object.keys(r.rows[0].request_payload).length ||
      Object.entries(payload).some(
        ([k, v]) => r.rows[0]!.request_payload[k] !== v,
      )
    )
      throw new Error('idempotency_conflict');
  }
  return true;
}
async function event(
  q: Querier,
  input: MutationInput,
  old: SlotRecord,
  action: 'status_changed' | 'offered' | 'walk_in',
  toStatus: OpdStatus,
  payload: Record<string, unknown>,
  extra: {
    patientId?: string | null;
    waitlistId?: string;
    reason?: string;
  } = {},
) {
  await q.query(
    `INSERT INTO opd_slot_event(org_id,slot_id,patient_id,waitlist_entry_id,action,from_status,to_status,actor_id,request_id,request_payload,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.orgId,
      input.slotId,
      extra.patientId ?? old.patient_id,
      extra.waitlistId ?? null,
      action,
      old.status,
      toStatus,
      input.actorId,
      input.requestId,
      JSON.stringify(payload),
      extra.reason ?? null,
    ],
  );
  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role: await requireOpdActor(q, input) },
    action: `opd.${action}`,
    entityKind: 'opd_appointment_slot',
    entityId: input.slotId,
    outcome: 'success',
    metadata: {
      from: old.status,
      to: toStatus,
      waitlist_id: extra.waitlistId ?? null,
      request_id: input.requestId,
    },
  });
}
export async function updateOpdSlotStatus(
  q: Querier,
  input: MutationInput & {
    toStatus: string;
    expectedStatus: string;
    reason?: string;
  },
): Promise<void> {
  await requireOpdActor(q, input);
  await lockOperations(q, input.orgId);
  const payload = {
    slotId: input.slotId,
    toStatus: input.toStatus,
    expectedStatus: input.expectedStatus,
    reason: input.reason ?? '',
  };
  if (await replay(q, input, payload)) return;
  const s = await slot(q, input);
  if (
    ['checked_in', 'in_consult', 'completed', 'walk_in'].includes(
      input.toStatus,
    ) &&
    !s.patient_id
  )
    throw new Error('patient_required');
  if (s.status !== input.expectedStatus) throw new Error('stale_slot');
  const offer = await q.query(
    `SELECT id FROM opd_waitlist_entry WHERE org_id=$1 AND offered_slot_id=$2 AND status='offered' FOR UPDATE`,
    [input.orgId, input.slotId],
  );
  if (
    !(input.toStatus === 'vacant' && s.status === 'vacant' && offer.rowCount) &&
    !canTransitionOpd(s.status, input.toStatus)
  )
    throw new Error('invalid_opd_transition');
  if (
    ['vacant', 'delayed_investigation', 'cancelled', 'no_show'].includes(
      input.toStatus,
    ) &&
    (!input.reason || input.reason.trim().length < 3)
  )
    throw new Error('reason_required');
  if (['cancelled', 'no_show'].includes(input.toStatus)) {
    await q.query(
      "UPDATE opd_waitlist_entry SET status='cancelled' WHERE org_id=$1 AND offered_slot_id=$2 AND status='slotted'",
      [input.orgId, input.slotId],
    );
  }
  if (input.toStatus === 'vacant')
    await q.query(
      `UPDATE opd_waitlist_entry SET status='waiting',offered_slot_id=NULL WHERE org_id=$1 AND offered_slot_id=$2 AND status='offered'`,
      [input.orgId, input.slotId],
    );
  await q.query(
    `UPDATE opd_appointment_slot SET status=$3::opd_slot_status,patient_id=CASE WHEN $3='vacant' THEN NULL ELSE patient_id END,priority_source_fact_id=CASE WHEN $3='vacant' THEN NULL ELSE priority_source_fact_id END,priority_tag=CASE WHEN $3='vacant' THEN 'routine_followup'::admin_priority_tag ELSE priority_tag END,token_number=CASE WHEN $3='vacant' THEN NULL ELSE token_number END,checked_in_at=CASE WHEN $3='checked_in' THEN now() WHEN $3='vacant' THEN NULL ELSE checked_in_at END,bottleneck_note=CASE WHEN $3='delayed_investigation' THEN $4 ELSE NULL END,updated_by=$5,updated_at=now() WHERE org_id=$1 AND id=$2`,
    [
      input.orgId,
      input.slotId,
      input.toStatus,
      input.reason ?? null,
      input.actorId,
    ],
  );
  await event(
    q,
    input,
    s,
    'status_changed',
    input.toStatus as OpdStatus,
    payload,
    { reason: input.reason },
  );
}
async function candidateInputs(
  q: Querier,
  input: ActorInput,
  s: SlotRecord,
): Promise<WaitlistCandidateInput[]> {
  if (!s.clinic_key) return [];
  const rows = await q.query<{
    id: string;
    patient_id: string;
    display_name: string;
    priority_tag: string;
    requested_date: string;
    created_at: Date;
    status: string;
    clinic_key: string | null;
    priority_selected_by: string | null;
    priority_source_fact_id: string | null;
    verbatim_quote: string | null;
    source_valid: boolean;
    human_valid: boolean;
    has_conflict: boolean;
  }>(
    `SELECT w.*,w.requested_date::text,p.display_name,f.verbatim_quote,
  NOT EXISTS(SELECT 1 FROM document d WHERE d.org_id=w.org_id AND d.patient_id=w.patient_id AND (d.ingest_error='consent_revoked_or_expired' OR d.ingest_status='quarantined')) AS source_valid,
  EXISTS(SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.org_id=w.org_id AND m.user_id=w.priority_selected_by AND m.role IN ('clinician','coordinator','records_officer','org_admin') AND u.is_active AND EXISTS(SELECT 1 FROM audit_event ae WHERE ae.org_id=w.org_id AND ae.entity_id=w.id AND ae.action='opd.priority_selected' AND ae.actor_user_id=w.priority_selected_by AND ae.metadata_json->>'priority_tag'=w.priority_tag::text AND ae.metadata_json->>'selected_at'=w.priority_selected_at::text)) AS human_valid,
  (EXISTS(SELECT 1 FROM opd_appointment_slot a WHERE a.org_id=w.org_id AND a.patient_id=w.patient_id AND a.status NOT IN ('completed','cancelled','no_show','vacant') AND ((a.clinic_date+a.slot_start_time) AT TIME ZONE a.clinic_timezone)<(($3::date+$5::time) AT TIME ZONE $6) AND (($3::date+$4::time) AT TIME ZONE $6)<((a.clinic_date+a.slot_end_time) AT TIME ZONE a.clinic_timezone))
   OR EXISTS(SELECT 1 FROM opd_waitlist_entry o WHERE o.org_id=w.org_id AND o.patient_id=w.patient_id AND o.status='offered')) AS has_conflict
 FROM opd_waitlist_entry w JOIN patient p ON p.org_id=w.org_id AND p.id=w.patient_id
 LEFT JOIN evidence_fact f ON f.org_id=w.org_id AND f.patient_id=w.patient_id AND f.id=w.priority_source_fact_id
 WHERE w.org_id=$1 AND w.clinic_key=$2 AND w.status='waiting' AND w.requested_date<=$3::date ORDER BY w.patient_id,w.id`,
    [
      input.orgId,
      s.clinic_key,
      s.clinic_date,
      s.slot_start_time,
      s.slot_end_time,
      s.clinic_timezone,
    ],
  );
  const result: WaitlistCandidateInput[] = [];
  for (const r of rows.rows) {
    // Lock before reading any readiness inputs; mutation triggers use this same row.
    await q.query(
      `SELECT id FROM patient WHERE org_id=$1 AND id=$2 FOR UPDATE`,
      [input.orgId, r.patient_id],
    );
    const currentSource = await q.query(
      `SELECT id FROM document WHERE org_id=$1 AND patient_id=$2 AND (ingest_error='consent_revoked_or_expired' OR ingest_status='quarantined')`,
      [input.orgId, r.patient_id],
    );
    const checklist = await q.query(
      `SELECT id FROM patient_checklist WHERE org_id=$1 AND patient_id=$2`,
      [input.orgId, r.patient_id],
    );
    const ready = await computeAndPersistReadiness(q, {
      orgId: input.orgId,
      patientId: r.patient_id,
      computedBy: input.actorId,
    });
    // Priority text is displayed for inspection only. No source phrase is interpreted as a priority.
    // Non-routine source-only legacy labels require authorized selection as well.
    const provenance = r.human_valid
      ? `Authorized staff selection (${r.priority_selected_by})`
      : null;
    result.push({
      orgId: input.orgId,
      waitlistEntryId: r.id,
      patientId: r.patient_id,
      patientName: r.display_name,
      readinessBand: ready.band,
      clinicKey: r.clinic_key,
      priorityTag: r.priority_tag,
      prioritySourceQuote: provenance ? r.verbatim_quote : null,
      priorityProvenance: provenance,
      requestedDate: r.requested_date,
      createdAt: new Date(r.created_at).toISOString(),
      hasConflict: r.has_conflict,
      sourceAccessValid: currentSource.rowCount === 0 && !!checklist.rowCount,
      status: r.status,
    });
  }
  return result;
}
export async function listBackfillCandidates(
  q: Querier,
  input: ActorInput & { slotId: string },
) {
  await requireOpdActor(q, input);
  await lockOperations(q, input.orgId);
  const s = await slot(q, { ...input, requestId: 'read' });
  if (s.status !== 'vacant') return [];
  const reserved = await q.query(
    `SELECT id FROM opd_waitlist_entry WHERE org_id=$1 AND offered_slot_id=$2 AND status='offered'`,
    [input.orgId, s.id],
  );
  if (reserved.rowCount) return [];
  return rankWaitlistForVacantSlot(
    {
      orgId: input.orgId,
      clinicDate: s.clinic_date,
      clinicKey: s.clinic_key ?? '',
      status: s.status,
    },
    await candidateInputs(q, input, s),
  );
}
async function reserve(
  q: Querier,
  input: OfferInput,
  walkIn: boolean,
): Promise<void> {
  await requireOpdActor(q, input);
  await lockOperations(q, input.orgId);
  const payload = {
    slotId: input.slotId,
    waitlistEntryId: input.waitlistEntryId,
    action: walkIn ? 'walk_in' : 'offered',
  };
  if (await replay(q, input, payload)) return;
  const s = await slot(q, input);
  if (s.status !== 'vacant') throw new Error('slot_taken');
  const candidates = await listBackfillCandidates(q, input);
  const c = candidates.find((x) => x.waitlistEntryId === input.waitlistEntryId);
  if (!c) throw new Error('candidate_ineligible');
  const w = await q.query(
    `SELECT id FROM opd_waitlist_entry WHERE org_id=$1 AND id=$2 AND status='waiting' FOR UPDATE`,
    [input.orgId, input.waitlistEntryId],
  );
  if (!w.rowCount) throw new Error('candidate_ineligible');
  await q.query(
    `UPDATE opd_waitlist_entry SET status=$3,offered_slot_id=$4 WHERE org_id=$1 AND id=$2`,
    [
      input.orgId,
      input.waitlistEntryId,
      walkIn ? 'slotted' : 'offered',
      input.slotId,
    ],
  );
  if (walkIn)
    await q.query(
      `UPDATE opd_appointment_slot SET patient_id=$3,status='walk_in',checked_in_at=now(),priority_tag=$4::admin_priority_tag,priority_source_fact_id=(SELECT priority_source_fact_id FROM opd_waitlist_entry WHERE org_id=$1 AND id=$6),updated_by=$5,updated_at=now() WHERE org_id=$1 AND id=$2`,
      [
        input.orgId,
        input.slotId,
        c.patientId,
        c.priorityTag,
        input.actorId,
        input.waitlistEntryId,
      ],
    );
  await event(
    q,
    input,
    s,
    walkIn ? 'walk_in' : 'offered',
    walkIn ? 'walk_in' : 'vacant',
    payload,
    { patientId: c.patientId, waitlistId: input.waitlistEntryId },
  );
}
/** Staff records an offer only; no patient acceptance or message is implied. */
export async function offerOpdSlot(q: Querier, input: OfferInput) {
  await reserve(q, input, false);
  return { offered: true };
}
/** Staff confirms an arrived waitlisted patient into persisted vacant capacity. */
export async function registerWalkIn(q: Querier, input: OfferInput) {
  await reserve(q, input, true);
  return { registered: true };
}
export async function listOpdWorkspace(
  q: Querier,
  input: { orgId: string; date?: string },
) {
  const date = input.date ?? clinicLocalDate(new Date(), 'Asia/Kolkata');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
    throw new Error('invalid_date');
  const rows = await q.query<OpdSlotRow>(
    `SELECT a.id,a.clinic_date::text,a.slot_start_time::text,a.slot_end_time::text,a.room_label,a.clinic_key,a.clinic_timezone,a.patient_id,p.display_name AS patient_name,a.token_number,a.status,CASE WHEN f.id IS NOT NULL OR selection.actor_user_id IS NOT NULL THEN a.priority_tag ELSE 'routine_followup'::admin_priority_tag END AS priority_tag,
 CASE WHEN selection.actor_user_id IS NOT NULL THEN 'Authorized staff selection ('||selection.actor_user_id::text||')' WHEN a.priority_source_fact_id IS NOT NULL AND f.id IS NOT NULL THEN 'Source reference (inspect before use)' ELSE NULL END AS priority_provenance,
 a.checked_in_at::text,a.bottleneck_note,r.readiness_band,coalesce(r.inputs_json->'reasons','[]'::jsonb) AS readiness_reasons,op.display_name AS offered_patient_name,w.id AS offer_waitlist_id
 FROM opd_appointment_slot a LEFT JOIN patient p ON p.org_id=a.org_id AND p.id=a.patient_id
 LEFT JOIN evidence_fact f ON f.id=a.priority_source_fact_id
 LEFT JOIN LATERAL(SELECT ae.actor_user_id FROM opd_waitlist_entry selected JOIN audit_event ae ON ae.org_id=selected.org_id AND ae.entity_id=selected.id AND ae.action='opd.priority_selected' AND ae.actor_user_id=selected.priority_selected_by AND ae.metadata_json->>'priority_tag'=selected.priority_tag::text AND ae.metadata_json->>'selected_at'=selected.priority_selected_at::text WHERE selected.org_id=a.org_id AND selected.offered_slot_id=a.id AND selected.patient_id=a.patient_id AND selected.priority_tag=a.priority_tag ORDER BY ae.seq DESC LIMIT 1) selection ON true
 LEFT JOIN LATERAL(SELECT readiness_band,inputs_json FROM record_readiness_snapshot WHERE org_id=a.org_id AND patient_id=a.patient_id ORDER BY computed_at DESC LIMIT 1) r ON true
 LEFT JOIN opd_waitlist_entry w ON w.org_id=a.org_id AND w.offered_slot_id=a.id AND w.status='offered'
 LEFT JOIN patient op ON op.org_id=w.org_id AND op.id=w.patient_id WHERE a.org_id=$1 AND a.clinic_date=$2::date ORDER BY a.slot_start_time,a.room_label,a.id`,
    [input.orgId, date],
  );
  const patients = await q.query<{ id: string; display_name: string }>(
    `SELECT id,display_name FROM patient WHERE org_id=$1 ORDER BY display_name,id`,
    [input.orgId],
  );
  const counts = await q.query<{
    span_passed: string;
    span_total: string;
    tasks: string;
    backfills: string;
    contradictions: string;
  }>(
    `SELECT
 (SELECT count(*) FROM extraction_candidate WHERE org_id=$1 AND validation_status='promoted')::text AS span_passed,
 (SELECT count(*) FROM extraction_candidate WHERE org_id=$1 AND validation_status IN ('promoted','rejected'))::text AS span_total,
 (SELECT count(*) FROM admin_task WHERE org_id=$1 AND status IN ('open','assigned','in_progress','blocked'))::text AS tasks,
 (SELECT count(*) FROM opd_slot_event e JOIN opd_appointment_slot a ON a.id=e.slot_id WHERE e.org_id=$1 AND e.action='walk_in' AND a.clinic_date=$2::date)::text AS backfills,
 (SELECT count(DISTINCT c.id) FROM conflict_set c JOIN opd_appointment_slot a ON a.patient_id=c.patient_id AND a.org_id=c.org_id WHERE c.org_id=$1 AND a.clinic_date=$2::date AND c.detected_at<coalesce((SELECT min(e.occurred_at) FROM opd_slot_event e WHERE e.slot_id=a.id AND e.to_status='in_consult'),'infinity'::timestamptz))::text AS contradictions`,
    [input.orgId, date],
  );
  const c = counts.rows[0]!;
  const scheduled = rows.rows.filter(
    (r) =>
      r.patient_id && !['cancelled', 'no_show', 'vacant'].includes(r.status),
  );
  return {
    date,
    timeZone: 'Asia/Kolkata',
    slots: rows.rows,
    patients: patients.rows,
    metrics: {
      ready: scheduled.filter((s) => s.readiness_band === 'ready').length,
      scheduled: scheduled.length,
      utilized: scheduled.length,
      totalSlots: rows.rows.length,
      successfulBackfills: Number(c.backfills),
      outstandingTasks: Number(c.tasks),
      contradictions: Number(c.contradictions),
      spanPassed: Number(c.span_passed),
      spanTotal: Number(c.span_total),
    },
  };
}

/** Explicit staff selection; tags are administrative labels, never inferred from source text. */
export async function setOpdWaitlistPriority(
  q: Querier,
  input: ActorInput & {
    waitlistEntryId: string;
    priorityTag: string;
    sourceFactId?: string;
  },
) {
  const role = await requireOpdActor(q, input);
  await lockOperations(q, input.orgId);
  const tags = [
    'routine_followup',
    'new_referral',
    'post_op_wound_check_documented',
    'chemo_cycle_clearance_documented',
    'expedited_slot_requested',
  ];
  if (!tags.includes(input.priorityTag)) throw new Error('invalid_priority');
  const r = await q.query<{ patient_id: string }>(
    `SELECT patient_id FROM opd_waitlist_entry WHERE org_id=$1 AND id=$2 AND status='waiting' FOR UPDATE`,
    [input.orgId, input.waitlistEntryId],
  );
  if (!r.rows[0]) throw new Error('waitlist_not_found');
  if (input.sourceFactId) {
    const source = await q.query(
      `SELECT f.id FROM evidence_fact f JOIN evidence_state s ON s.evidence_fact_id=f.id JOIN document d ON d.id=f.document_id WHERE f.org_id=$1 AND f.patient_id=$2 AND f.id=$3 AND s.state IN ('verified','corrected') AND d.ingest_status='ready'`,
      [input.orgId, r.rows[0].patient_id, input.sourceFactId],
    );
    if (!source.rowCount) throw new Error('invalid_priority_source');
  }
  const changed = await q.query<{ selected_at: string }>(
    `UPDATE opd_waitlist_entry SET priority_tag=$3::admin_priority_tag,priority_source_fact_id=$4,priority_selected_by=$5,priority_selected_at=now() WHERE org_id=$1 AND id=$2 RETURNING priority_selected_at::text AS selected_at`,
    [
      input.orgId,
      input.waitlistEntryId,
      input.priorityTag,
      input.sourceFactId ?? null,
      input.actorId,
    ],
  );
  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.actorId, role },
    action: 'opd.priority_selected',
    entityKind: 'opd_waitlist_entry',
    entityId: input.waitlistEntryId,
    outcome: 'success',
    metadata: {
      priority_tag: input.priorityTag,
      source_fact_id: input.sourceFactId ?? null,
      selected_at: changed.rows[0]!.selected_at,
    },
  });
}
