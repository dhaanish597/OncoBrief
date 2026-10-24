import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { can, OPD_TRANSITIONS } from '@oncobrief/domain';
import { listPatients, listOpdWorkspace } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { ReadinessBand } from '@/components/evidence';
import { isClinicDate } from '@/lib/opd-presentation';
import { OpdWorkspace } from '@/components/OpdWorkspace';

/**
 * Today's consultation workspace. Deliberately not a dashboard: there is no
 * landing page of charts. The entry surface is a worklist of patients ordered
 * by record readiness, and each row states what is outstanding.
 */
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, 'patient:read')) {
    forbidden();
  }

  const params = await searchParams;
  const date = isClinicDate(params.date) ? params.date : undefined;
  const { patients, workspace } = await withSession(async (q) => ({
    patients: await listPatients(q),
    workspace: await listOpdWorkspace(q, { orgId: session.orgId, date }),
  }));

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Oncology consultation workspace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-soft)] sm:text-base">
            Every patient below is ordered by <strong>record readiness</strong>, an operational
            measure of document completeness, unresolved source conflicts, unverified evidence and
            open administrative tasks. It is not a clinical risk score.
          </p>
        </div>
        <p className="mono text-xs text-[var(--color-ink-soft)]">
          {patients.length} patient{patients.length === 1 ? '' : 's'} in this hospital
        </p>
      </div>

      <OpdWorkspace transitions={OPD_TRANSITIONS} containsSyntheticData={patients.some(p => p.isDemoFixture)} workspace={workspace} canManage={can(session.role, 'opd:manage')} worklist={<>
      <div className="mt-8 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">Patients ordered by record readiness</caption>
            <thead>
              <tr className="mono border-b border-[var(--color-rule-strong)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                <th scope="col" className="px-4 py-2.5">Patient</th>
                <th scope="col" className="px-4 py-2.5">Readiness</th>
                <th scope="col" className="px-4 py-2.5">Docs</th>
                <th scope="col" className="px-4 py-2.5">Missing required</th>
                <th scope="col" className="px-4 py-2.5">Conflicts</th>
                <th scope="col" className="px-4 py-2.5">Unverified</th>
                <th scope="col" className="px-4 py-2.5">Open tasks</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--color-rule)] last:border-b-0 hover:bg-[var(--color-accent-soft)]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/patients/${p.id}/evidence`}
                      className="block hover:underline"
                      aria-label={`Open evidence journey for ${p.displayName}`}
                    >
                      <span className="font-medium text-[var(--color-ink)]">{p.displayName}</span>
                      <span className="mono block text-[11px] text-[var(--color-ink-soft)]">
                        {p.demoCode ?? p.id.slice(0, 8)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ReadinessBand band={p.readinessBand} />
                  </td>
                  <td className="mono px-4 py-3">{p.documentCount}</td>
                  <td
                    className="mono px-4 py-3"
                    style={{ color: p.missingRequired > 0 ? 'var(--color-state-conflicting)' : undefined }}
                  >
                    {p.missingRequired > 0 ? p.missingRequired : '—'}
                  </td>
                  <td
                    className="mono px-4 py-3"
                    style={{ color: p.openConflicts > 0 ? 'var(--color-state-conflicting)' : undefined }}
                  >
                    {p.openConflicts > 0 ? p.openConflicts : '—'}
                  </td>
                  <td className="mono px-4 py-3">{p.unverifiedFacts > 0 ? p.unverifiedFacts : '—'}</td>
                  <td className="mono px-4 py-3">{p.openTasks > 0 ? p.openTasks : '—'}</td>
                </tr>
              ))}
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="mono px-4 py-8 text-center text-[var(--color-ink-soft)]">
                    No patients in this hospital. Run <code>pnpm demo:reset</code> to seed the demo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mono mt-6 max-w-3xl text-xs leading-relaxed text-[var(--color-ink-soft)]">
        Readiness is a band computed from explicit rules, not a score. It is explainable by
        enumeration: open a patient to see exactly which documents are missing, which sources
        disagree and which facts no human has confirmed.
      </p>
      </>} />
    </main>
  );
}
