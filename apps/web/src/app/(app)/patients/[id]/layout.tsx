import { notFound } from 'next/navigation';
import { getPatient, listConflicts, listRecordMap, listTasks } from '@oncobrief/db';
import { withSession } from '@/lib/session';
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

  const data = await withSession(async (q) => {
    const patient = await getPatient(q, id);
    if (!patient) return null;
    const [recordMap, conflicts, tasks] = await Promise.all([
      listRecordMap(q, id),
      listConflicts(q, id, 'open'),
      listTasks(q, id),
    ]);
    return { patient, recordMap, openConflicts: conflicts.length, tasks };
  });

  if (!data) notFound();
  const { patient, recordMap, openConflicts, tasks } = data;
  const openTasks = tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).length;
  const gaps = recordMap.readiness
    ? (recordMap.readiness.inputs as { counts?: { missingRequired?: number; missingExpected?: number } })
        .counts
    : null;

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6">
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
          <form action={refreshReadinessAction}>
            <input type="hidden" name="patientId" value={patient.id} />
            <button
              type="submit"
              className="mono border border-[var(--color-rule-strong)] px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              recompute
            </button>
          </form>
        </div>
      </div>

      {recordMap.readiness ? (
        <ul className="mono mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--color-ink-soft)]">
          {((recordMap.readiness.inputs as { reasons?: string[] }).reasons ?? []).map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
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
