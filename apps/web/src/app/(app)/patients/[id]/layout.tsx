import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { getPatient, listConflicts, listRecordMap, listTasks } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { DemoBadge, ReadinessBand } from '@/components/evidence';
import { PatientTabs } from '@/components/PatientTabs';
import { refreshReadinessAction } from '@/lib/actions';

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await requireSession();
  if (!can(session.role, 'patient:read')) {
    forbidden();
  }

  const data = await withSession(async (q) => {
    const patient = await getPatient(q, id);
    if (!patient) return null;
    const recordMap = await listRecordMap(q, id);
    const conflicts = await listConflicts(q, id, 'open');
    const tasks = await listTasks(q, id);
    return { patient, recordMap, conflicts, openConflicts: conflicts.length, tasks };
  });

  if (!data) notFound();
  const { patient, recordMap, conflicts, openConflicts, tasks } = data;
  const openTaskRows = tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
  const openTasks = openTaskRows.length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueTasks = openTaskRows.filter((t) => t.dueOn && t.dueOn < todayIso);
  const gaps = recordMap.readiness
    ? (recordMap.readiness.inputs as { counts?: { missingRequired?: number; missingExpected?: number } })
        .counts
    : null;
  const missingRequiredCount = gaps?.missingRequired ?? 0;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 pb-24 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{patient.displayName}</h1>
            {patient.isDemoFixture ? <DemoBadge /> : null}
          </div>
          <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">
            {patient.demoCode ? `${patient.demoCode} · ` : ''}
            administrative record readiness only — this view makes no clinical judgement
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ReadinessBand band={recordMap.readiness?.band ?? null} />
          {can(session.role, 'checklist:author') ? (
            <form action={refreshReadinessAction}>
              <input type="hidden" name="patientId" value={patient.id} />
              <button
                type="submit"
                className="mono border border-[var(--color-rule-strong)] px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
              >
                recompute
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {recordMap.readiness ? (
        <ul className="mono mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--color-ink-soft)]">
          {((recordMap.readiness.inputs as { reasons?: string[] }).reasons ?? []).map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
      ) : null}

      {/* TASK-011: Dynamic Evidence-Driven Patient Snapshot Alert Banners */}
      {(openConflicts > 0 || missingRequiredCount > 0 || overdueTasks.length > 0) ? (
        <section
          aria-label="Active patient record alerts"
          data-testid="patient-snapshot-alerts"
          className="mt-4 grid gap-2 sm:grid-cols-3"
        >
          {openConflicts > 0 ? (
            <div
              data-testid="snapshot-alert-conflicts"
              className="flex items-center justify-between gap-3 border border-[var(--color-state-conflicting)] bg-[#fbe9e8] px-3 py-2 text-xs text-[var(--color-state-conflicting)]"
            >
              <div>
                <span className="mono font-semibold uppercase">
                  {openConflicts} Unresolved Source Conflict{openConflicts === 1 ? '' : 's'}
                </span>
                <span className="mono block text-[11px]">
                  Slot: {conflicts[0]?.slotKey ?? 'ledger discrepancy'}
                </span>
              </div>
              <Link
                href={`/patients/${patient.id}/conflicts`}
                className="mono shrink-0 border border-[var(--color-state-conflicting)] bg-white px-2 py-1 text-[10px] uppercase hover:bg-[#fbe9e8]"
              >
                Resolve →
              </Link>
            </div>
          ) : null}

          {missingRequiredCount > 0 ? (
            <div
              data-testid="snapshot-alert-gaps"
              className="flex items-center justify-between gap-3 border border-amber-700 bg-[#fdf3df] px-3 py-2 text-xs text-amber-950"
            >
              <div>
                <span className="mono font-semibold uppercase">
                  {missingRequiredCount} Missing Required Document{missingRequiredCount === 1 ? '' : 's'}
                </span>
                <span className="mono block text-[11px]">
                  Blocks consultation packet readiness
                </span>
              </div>
              <Link
                href={`/patients/${patient.id}/record-map`}
                className="mono shrink-0 border border-amber-800 bg-white px-2 py-1 text-[10px] uppercase hover:bg-amber-50"
              >
                Inspect Gaps →
              </Link>
            </div>
          ) : null}

          {overdueTasks.length > 0 ? (
            <div
              data-testid="snapshot-alert-overdue-tasks"
              className="flex items-center justify-between gap-3 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-3 py-2 text-xs text-[var(--color-ink)]"
            >
              <div>
                <span className="mono font-semibold uppercase">
                  {overdueTasks.length} Overdue Admin Task{overdueTasks.length === 1 ? '' : 's'}
                </span>
                <span className="mono block text-[11px] text-[var(--color-ink-soft)]">
                  Earliest due {overdueTasks[0]?.dueOn}
                </span>
              </div>
              <Link
                href={`/patients/${patient.id}/tasks`}
                className="mono shrink-0 border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-[10px] uppercase hover:bg-[var(--color-accent-soft)]"
              >
                View Tasks →
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-5">
        <PatientTabs
          patientId={patient.id}
          badges={{
            conflicts: openConflicts,
            gaps: (gaps?.missingRequired ?? 0) + (gaps?.missingExpected ?? 0),
            tasks: openTasks,
          }}
        />
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}
