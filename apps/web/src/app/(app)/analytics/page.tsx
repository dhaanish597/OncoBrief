import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { getOperationalAnalyticsSummary } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';

export default async function OperationalAnalyticsPage() {
  const session = await requireSession();
  if (!can(session.role, 'patient:read')) {
    forbidden();
  }

  const summary = await withSession(async (q, s) => {
    return getOperationalAnalyticsSummary(q, s.orgId);
  });

  const { patients, ingestionAndProvenance, conflictsAndTasks, opdAndContinuity } = summary;

  return (
    <div
      data-testid="operational-analytics-page"
      className="mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-6 sm:py-10"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-6">
        <div>
          <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Operational Telemetry &amp; Governance Ledger Metrics
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Oncology Operational Analytics
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Every metric below is computed live from tenant-isolated PostgreSQL tables (`patient`, `document`, `extraction_candidate`, `evidence_fact`, `conflict_set`, `opd_appointment_slot`, `patient_message`). Real records, synthetic demo fixtures, and pilot targets are explicitly separated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/v1/analytics/export"
            data-testid="export-analytics-csv"
            className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-3.5 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-black"
          >
            Export Telemetry CSV
          </a>
          <Link
            href="/workspace?view=opd"
            className="mono border border-[var(--color-rule-strong)] bg-white px-3.5 py-1.5 text-xs uppercase tracking-wider text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
          >
            Open Live OPD Board →
          </Link>
        </div>
      </div>

      {summary.containsSyntheticFixtures ? (
        <div
          role="status"
          data-testid="analytics-synthetic-banner"
          className="mt-6 border border-amber-700 bg-[#fdf3df] p-4 text-xs text-amber-950"
        >
          <strong className="mono uppercase">Provenance Disclosure — Synthetic Demo Fixtures Present:</strong>{' '}
          This tenant currently contains <strong>{patients.demoFixturePatients}</strong> synthetic demo fixture patient(s) and{' '}
          <strong>{patients.livePatients}</strong> live non-fixture patient(s) ({ingestionAndProvenance.demoFixtureDocuments} demo fixture documents vs.{' '}
          {ingestionAndProvenance.liveDocuments} live uploaded documents). Demo fixture counts verify system behavior and do not represent clinical hospital impact.
        </div>
      ) : null}

      {/* Section 1: Record Readiness & Pilot Target Comparison */}
      <section className="mt-8" aria-labelledby="readiness-metrics-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="readiness-metrics-heading" className="mono text-sm font-semibold uppercase tracking-wider">
            1. Consultation Record Readiness (Live Stored vs. Demo vs. Pilot Target)
          </h2>
          <span className="mono text-xs text-[var(--color-ink-soft)]">
            Pilot Target: &ge;{patients.pilotTargetReadinessPct}% consultation-ready before OPD check-in
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Total Registered Patients</p>
            <p className="mt-2 text-2xl font-semibold" data-testid="analytics-total-patients">
              {patients.total}
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {patients.livePatients} live · {patients.demoFixturePatients} synthetic demo
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Consultation-Ready Rate</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-800" data-testid="analytics-readiness-pct">
              {patients.actualReadinessPct}% ({patients.readinessReady}/{patients.total})
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              Pilot Target: &ge;{patients.pilotTargetReadinessPct}% (Stored record count)
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Missing Required / Expected Gaps</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">
              {patients.readinessGaps} patient(s)
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {patients.readinessNone} uncomputed (`none`)
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Blocked by Open Conflicts</p>
            <p className="mt-2 text-2xl font-semibold text-rose-800">
              {patients.readinessBlocked} patient(s)
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {conflictsAndTasks.openConflicts} open conflict set(s)
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Two-Stage Provenance Gate & Multi-Modal Ingestion */}
      <section className="mt-8" aria-labelledby="provenance-metrics-heading">
        <h2 id="provenance-metrics-heading" className="mono text-sm font-semibold uppercase tracking-wider">
          2. Multi-Modal Ingestion &amp; Two-Stage Provenance Gate
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Stored Source Documents</p>
            <p className="mt-2 text-2xl font-semibold">
              {ingestionAndProvenance.totalDocuments}
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {ingestionAndProvenance.liveDocuments} live · {ingestionAndProvenance.demoFixtureDocuments} demo · {ingestionAndProvenance.segmentedSubpackets} sub-packets
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Provenance Gate Pass Rate</p>
            <p className="mt-2 text-2xl font-semibold" data-testid="analytics-promotion-rate">
              {ingestionAndProvenance.promotionPassRatePct}%
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {ingestionAndProvenance.candidatesPromoted} promoted · {ingestionAndProvenance.candidatesRejected} rejected
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Evidence Ledger Facts</p>
            <p className="mt-2 text-2xl font-semibold">
              {ingestionAndProvenance.verifiedFacts} / {ingestionAndProvenance.totalFacts}
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              Verified/corrected · {ingestionAndProvenance.extractedUnverifiedFacts} unverified
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Quarantined / Manual Review</p>
            <p className="mt-2 text-2xl font-semibold">
              {ingestionAndProvenance.quarantinedDocuments}
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {ingestionAndProvenance.readyDocuments} ready in ledger
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: OPD Flow, Slot Backfill & Care Continuity */}
      <section className="mt-8" aria-labelledby="opd-continuity-heading">
        <h2 id="opd-continuity-heading" className="mono text-sm font-semibold uppercase tracking-wider">
          3. OPD Capacity Utilization, Slot Backfill &amp; Care Continuity
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">OPD Slot Utilization</p>
            <p className="mt-2 text-2xl font-semibold">
              {opdAndContinuity.utilizedOpdSlots} / {opdAndContinuity.totalOpdSlots}
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {opdAndContinuity.vacantOpdSlots} vacant · {opdAndContinuity.pendingSlotOffers} pending offer(s)
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Confirmed Slot Backfills</p>
            <p className="mt-2 text-2xl font-semibold">
              {opdAndContinuity.acceptedBackfillsAndWalkIns}
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              Pilot Target: &lt;{opdAndContinuity.pilotTargetBackfillLatencySec}s candidate ranking
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Source-Anchored Admin Tasks</p>
            <p className="mt-2 text-2xl font-semibold">
              {conflictsAndTasks.openTasks} open
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {conflictsAndTasks.overdueTasks} overdue · {conflictsAndTasks.completedTasks} completed
            </p>
          </div>

          <div className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
            <p className="mono text-xs uppercase text-[var(--color-ink-soft)]">Care Continuity &amp; Attendance</p>
            <p className="mt-2 text-2xl font-semibold">
              {opdAndContinuity.attendanceConfirmed} confirmed
            </p>
            <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
              {opdAndContinuity.messagesDelivered} delivered · {opdAndContinuity.attendanceRescheduleRequested} reschedule req · {opdAndContinuity.consentedActiveCaregivers} active caregiver(s)
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
