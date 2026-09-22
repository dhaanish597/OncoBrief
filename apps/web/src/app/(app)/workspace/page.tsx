import Link from 'next/link';
import { listPatients } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { ReadinessBand } from '@/components/evidence';

/**
 * Today's consultation workspace. Deliberately not a dashboard: there is no
 * landing page of charts. The entry surface is a worklist of patients ordered
 * by record readiness, and each row states what is outstanding.
 */
export default async function WorkspacePage() {
  const patients = await withSession(async (q) => listPatients(q));

  return (
    <main className="mx-auto max-w-[1500px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Today’s consultation workspace</h1>
          <p className="mt-2 max-w-3xl text-[var(--color-ink-soft)]">
            Every patient below is ordered by <strong>record readiness</strong>, an operational
            measure of document completeness, unresolved source conflicts, unverified evidence and
            open administrative tasks. It is not a clinical risk score.
          </p>
        </div>
        <p className="mono text-xs text-[var(--color-ink-soft)]">
          {patients.length} patient{patients.length === 1 ? '' : 's'} in this hospital
        </p>
      </div>

      <div className="mt-8 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="mono border-b border-[var(--color-rule-strong)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              <th className="px-4 py-2.5">Patient</th>
              <th className="px-4 py-2.5">Readiness</th>
              <th className="px-4 py-2.5">Docs</th>
              <th className="px-4 py-2.5">Missing required</th>
              <th className="px-4 py-2.5">Conflicts</th>
              <th className="px-4 py-2.5">Unverified</th>
              <th className="px-4 py-2.5">Open tasks</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--color-rule)] last:border-b-0 hover:bg-[var(--color-accent-soft)]"
              >
                <td className="px-4 py-3">
                  <Link href={`/patients/${p.id}/evidence`} className="block">
                    <span className="font-medium">{p.displayName}</span>
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

      <p className="mono mt-6 max-w-3xl text-xs leading-relaxed text-[var(--color-ink-soft)]">
        Readiness is a band computed from explicit rules, not a score. It is explainable by
        enumeration: open a patient to see exactly which documents are missing, which sources
        disagree and which facts no human has confirmed.
      </p>
    </main>
  );
}
