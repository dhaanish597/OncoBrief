import Link from 'next/link';
import { listConflicts } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EmptyFinding, SectionHeading } from '@/components/evidence';

export default async function ConflictsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conflicts = await withSession(async (q) => listConflicts(q, id));

  const open = conflicts.filter((c) => c.status === 'open');
  const resolved = conflicts.filter((c) => c.status !== 'open');

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Reconciliation queue" count={open.length} danger={open.length > 0} />
        <p className="mono text-[11px] text-[var(--color-ink-soft)]">
          detected deterministically — never resolved automatically
        </p>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        When two sources disagree about the same administrative fact, the system keeps both, shows
        both, and asks a person to decide. There is no recency heuristic and no confidence
        tie-break. “We do not know which is right” is a legitimate answer, and it is the first
        option offered.
      </p>

      <section className="mt-7">
        <h3 className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          Open
        </h3>
        {open.length === 0 ? (
          <EmptyFinding>No unresolved conflicts in this record.</EmptyFinding>
        ) : (
          <ul className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
            {open.map((c) => (
              <li key={c.id} className="border-b border-[var(--color-rule)] px-3 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="mono text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    {c.factType.replaceAll('.', ' · ').replaceAll('_', ' ')}
                  </span>
                  <span className="mono border border-[var(--color-state-conflicting)] px-1.5 py-0.5 text-[11px] uppercase text-[var(--color-state-conflicting)]">
                    {c.detectionReason === 'incomparable' ? 'needs human comparison' : 'sources disagree'}
                  </span>
                  <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                    {c.memberCount} sources
                  </span>
                </div>

                <ul className="mono mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {c.memberValueTexts.map((v, i) => (
                    <li key={`${v}-${i}`} className="border border-[var(--color-rule-strong)] bg-white px-2 py-1">
                      {v}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/patients/${id}/conflicts/${c.id}`}
                  className="mono mt-3 inline-block border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase tracking-wider"
                >
                  open reconciliation room →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="mt-8">
          <h3 className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Resolved ({resolved.length})
          </h3>
          <ul className="mono border-t border-[var(--color-rule-strong)] text-xs">
            {resolved.map((c) => (
              <li key={c.id} className="flex items-center gap-3 border-b border-[var(--color-rule)] px-3 py-2">
                <span className="text-[var(--color-ink-soft)]">{c.factType}</span>
                <span>{c.resolvedKind ?? c.status}</span>
                <span className="text-[var(--color-ink-soft)]">{c.memberValueTexts.join('  |  ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
