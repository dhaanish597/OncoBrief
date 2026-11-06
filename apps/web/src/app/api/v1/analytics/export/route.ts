import { NextResponse } from 'next/server';
import { can } from '@oncobrief/domain';
import { getOperationalAnalyticsSummary } from '@oncobrief/db';
import { withSession } from '@/lib/session';

/**
 * Audited Operational Telemetry CSV Export (`TASK-013`, `REQ-042`).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const summary = await withSession(async (q, s) => {
      if (!can(s.role, 'patient:read')) {
        throw new Error('forbidden');
      }
      return getOperationalAnalyticsSummary(q, s.orgId);
    });

    const rows: Array<[string, string, string, string]> = [
      ['metric_category', 'metric_name', 'stored_value', 'provenance_and_pilot_target'],
      ['patients', 'total_patients', String(summary.patients.total), 'stored_database_count'],
      ['patients', 'live_non_fixture_patients', String(summary.patients.livePatients), 'live_hospital_records'],
      ['patients', 'synthetic_demo_fixture_patients', String(summary.patients.demoFixturePatients), 'synthetic_demo_fixtures'],
      ['patients', 'readiness_ready', String(summary.patients.readinessReady), 'pilot_target_pct>=80'],
      ['patients', 'readiness_gaps', String(summary.patients.readinessGaps), 'stored_database_count'],
      ['patients', 'readiness_blocked', String(summary.patients.readinessBlocked), 'stored_database_count'],
      ['provenance', 'total_documents', String(summary.ingestionAndProvenance.totalDocuments), 'stored_database_count'],
      ['provenance', 'segmented_subpackets', String(summary.ingestionAndProvenance.segmentedSubpackets), 'stored_database_count'],
      ['provenance', 'candidates_promoted', String(summary.ingestionAndProvenance.candidatesPromoted), 'two_stage_span_gate_passed'],
      ['provenance', 'candidates_rejected', String(summary.ingestionAndProvenance.candidatesRejected), 'two_stage_span_gate_rejected'],
      ['provenance', 'verified_facts', String(summary.ingestionAndProvenance.verifiedFacts), 'human_verified_or_corrected'],
      ['conflicts_tasks', 'open_conflicts', String(summary.conflictsAndTasks.openConflicts), 'pre_consultation_contradictions'],
      ['conflicts_tasks', 'resolved_conflicts', String(summary.conflictsAndTasks.resolvedConflicts), 'audited_reconciliations'],
      ['conflicts_tasks', 'open_admin_tasks', String(summary.conflictsAndTasks.openTasks), 'source_anchored_tasks'],
      ['opd_continuity', 'total_opd_slots', String(summary.opdAndContinuity.totalOpdSlots), 'stored_capacity'],
      ['opd_continuity', 'utilized_opd_slots', String(summary.opdAndContinuity.utilizedOpdSlots), 'active_or_completed_slots'],
      ['opd_continuity', 'pending_slot_offers', String(summary.opdAndContinuity.pendingSlotOffers), 'awaiting_patient_acceptance'],
      ['opd_continuity', 'accepted_backfills_and_walkins', String(summary.opdAndContinuity.acceptedBackfillsAndWalkIns), 'pilot_target_ranking_latency<5s'],
      ['opd_continuity', 'attendance_confirmed', String(summary.opdAndContinuity.attendanceConfirmed), 'inbound_continuity_confirmations'],
      ['opd_continuity', 'attendance_reschedule_requested', String(summary.opdAndContinuity.attendanceRescheduleRequested), 'escalated_to_coordinator_task'],
    ];

    const csv = rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="oncobrief-operational-telemetry.csv"',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'export_failed';
    return NextResponse.json({ ok: false, error: msg }, { status: /forbidden/i.test(msg) ? 403 : 400 });
  }
}
