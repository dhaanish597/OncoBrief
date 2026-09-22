import { TASK_KINDS, TASK_KIND_LABEL } from '@oncobrief/domain';
import { listRecordMap } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EmptyFinding, OriginBadge, ReadinessBand, SectionHeading } from '@/components/evidence';
import { createTaskAction } from '@/lib/actions';

/**
 * The administrative digital twin (architecture §9).
 *
 * A grid of checklist items × status where missing items are as visually
 * prominent as present ones and each missing cell offers "create retrieval
 * task". This is the omission-as-first-class surface: "the record is
 * incomplete" becomes "someone is retrieving it by Thursday".
 */
export default async function RecordMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const map = await withSession(async (q) => listRecordMap(q, id));

  const ordered = [...map.gaps].sort((a, b) => {
    const rank = (s: string) => (s === 'missing' ? 0 : s === 'partial' ? 1 : s === 'waived' ? 3 : 2);
    return rank(a.status) - rank(b.status);
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Administrative record map" />
        <ReadinessBand band={map.readiness?.band ?? null} />
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Requirements here are authored by the hospital records office and version-pinned when
        assigned. The system never invents a requirement. A document only satisfies an item once a
        human has confirmed its type — until then it reads <em>partial</em>, not <em>present</em>.
      </p>

      {map.gaps.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>No checklist has been assigned to this patient.</EmptyFinding>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((g) => {
            const statusMeta: Record<string, { label: string; fg: string; bg: string; glyph: string }> = {
              missing: { label: 'missing', fg: 'var(--color-state-conflicting)', bg: '#fbe9e8', glyph: '□' },
              partial: { label: 'type not confirmed', fg: 'var(--color-state-extracted)', bg: '#fdf3df', glyph: '◐' },
              satisfied: { label: 'present', fg: 'var(--color-state-verified)', bg: '#e8f3ea', glyph: '■' },
              waived: { label: 'waived by a human', fg: 'var(--color-ink-soft)', bg: '#eeeeee', glyph: '—' },
            };
            const s = statusMeta[g.status] ?? statusMeta.missing!;
            const actionable = g.status === 'missing' || g.status === 'partial';
            return (
              <li
                key={g.id}
                data-testid="record-gap"
                data-status={g.status}
                className="border bg-[var(--color-paper-raised)] p-3"
                style={{ borderColor: s.fg }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium">{g.label}</h3>
                  <span className="mono inline-flex items-center gap-1 whitespace-nowrap text-[11px] uppercase" style={{ color: s.fg }}>
                    <span aria-hidden>{s.glyph}</span>
                    {s.label}
                  </span>
                </div>
                <p className="mono mt-1 text-[11px] text-[var(--color-ink-soft)]">
                  requires: {g.requiredDocumentType.replaceAll('_', ' ')} · {g.requirementKind}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">{g.rationale}</p>

                {actionable ? (
                  <details className="mt-3">
                    <summary
                      data-testid="create-task-from-gap"
                      className="mono cursor-pointer list-none border border-[var(--color-ink)] px-2.5 py-1 text-center text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
                    >
                      create retrieval task
                    </summary>
                    <form action={createTaskAction} className="mt-2 space-y-2">
                      <input type="hidden" name="patientId" value={id} />
                      <input type="hidden" name="originKind" value="record_gap" />
                      <input type="hidden" name="originId" value={g.id} />
                      <input type="hidden" name="taskKind" value="retrieve_document" />
                      <input
                        name="title"
                        required
                        defaultValue={`Retrieve ${g.label.toLowerCase()}`}
                        className="mono w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                      />
                      <input
                        name="dueOn"
                        type="date"
                        className="mono w-full border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="mono w-full border border-[var(--color-ink)] px-2 py-1 text-[11px] uppercase tracking-wider"
                      >
                        create task from this gap
                      </button>
                      <p className="mono text-[11px] text-[var(--color-ink-soft)]">
                        The gap is the task’s source link, so the task can always explain why it
                        exists.
                      </p>
                    </form>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-10">
        <SectionHeading title="Where the records came from" />
        <ul className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {map.origins.map((o) => (
            <li key={o.recordOrigin} className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-3">
              <OriginBadge origin={o.recordOrigin} />
              <p className="mono mt-1 text-2xl">{o.count}</p>
              <p className="mono mt-1 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                {o.documentTypes.map((t) => t.replaceAll('_', ' ')).join(', ')}
              </p>
            </li>
          ))}
        </ul>
        <p className="mono mt-3 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
          This models the document journey — what exists, where it came from, what is missing —
          never disease progression.
        </p>
      </section>

      <details className="mt-8">
        <summary className="mono cursor-pointer list-none border border-[var(--color-rule-strong)] px-3 py-2 text-[11px] uppercase tracking-wider">
          how this readiness band was computed
        </summary>
        <pre className="mono mt-2 overflow-x-auto border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-3 text-[11px]">
{JSON.stringify(map.readiness?.inputs ?? {}, null, 2)}
        </pre>
      </details>

      <p className="mono mt-6 text-[11px] text-[var(--color-ink-soft)]">
        Task kinds available: {TASK_KINDS.map((k) => TASK_KIND_LABEL[k]).join(' · ')}
      </p>
    </div>
  );
}
