import Link from 'next/link';
import { TASK_KIND_LABEL, taskStatusesFrom, type TaskKind, type TaskStatus } from '@oncobrief/domain';
import { listTasks } from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EmptyFinding, SectionHeading } from '@/components/evidence';
import { taskStatusAction, commentTaskAction } from '@/lib/actions';

/**
 * Administrative tasks. There is deliberately no "add task" affordance: every
 * task is created from a source object, and the card renders that origin so the
 * question "why does this exist?" is always one click from its answer.
 */
export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tasks = await withSession(async (q) => listTasks(q, id));

  const open = tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
  const closed = tasks.filter((t) => ['done', 'cancelled'].includes(t.status));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Source-backed administrative tasks" count={open.length} />
        <p className="mono text-[11px] text-[var(--color-ink-soft)]">
          {closed.length} closed · no unanchored tasks can exist
        </p>
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink-soft)]">
        A task may only originate from an explicit instruction in a source document, a missing
        required document, an unresolved conflict, or a human decision. The database refuses to
        store a task without a source link.
      </p>

      {open.length === 0 ? (
        <div className="mt-6">
          <EmptyFinding>No open administrative tasks.</EmptyFinding>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {open.map((t) => (
            <li key={t.id} data-testid="task-row" className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="mono border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
                  {TASK_KIND_LABEL[t.taskKind as TaskKind] ?? t.taskKind}
                </span>
                <span className="mono text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {t.status.replaceAll('_', ' ')}
                </span>
                {t.dueOn ? (
                  <span className="mono text-[11px] text-[var(--color-ink-soft)]">due {t.dueOn}</span>
                ) : null}
                <span className="mono ml-auto text-[11px] text-[var(--color-ink-soft)]">
                  {t.assigneeName ? `assigned to ${t.assigneeName}` : 'unassigned'}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-medium">{t.title}</h3>
              {t.detail ? <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{t.detail}</p> : null}

              <div className="mt-2 flex flex-wrap items-center gap-4">
                <OriginLink patientId={id} origin={t.origin} originKind={t.originKind} />
                <span className="mono text-[11px] text-[var(--color-ink-soft)]">
                  created by {t.creatorName ?? '—'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--color-rule)] pt-3">
                <form action={taskStatusAction} className="flex items-end gap-2">
                  <input type="hidden" name="patientId" value={id} />
                  <input type="hidden" name="taskId" value={t.id} />
                  <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                    move to
                    <select
                      name="toStatus"
                      defaultValue=""
                      required
                      className="mono mt-1 block border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                    >
                      <option value="" disabled>
                        select…
                      </option>
                      {taskStatusesFrom(t.status as TaskStatus).map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    name="note"
                    placeholder="note (optional)"
                    className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                  />
                  <button type="submit" className="mono border border-[var(--color-ink)] px-3 py-1.5 text-[11px] uppercase">
                    update
                  </button>
                </form>

                <form action={commentTaskAction} className="flex items-end gap-2">
                  <input type="hidden" name="patientId" value={id} />
                  <input type="hidden" name="taskId" value={t.id} />
                  <input
                    name="note"
                    required
                    placeholder="add a comment"
                    className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
                  />
                  <button type="submit" className="mono border border-[var(--color-rule-strong)] px-3 py-1.5 text-[11px] uppercase">
                    comment
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 ? (
        <section className="mt-10">
          <h3 className="mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Closed
          </h3>
          <ul className="mono border-t border-[var(--color-rule-strong)] text-xs">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-[var(--color-rule)] px-3 py-2">
                <span>{t.title}</span>
                <span className="ml-auto text-[var(--color-ink-soft)]">{t.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function OriginLink({
  patientId,
  origin,
  originKind,
}: {
  patientId: string;
  origin: { evidenceFactId: string | null; recordGapId: string | null; conflictSetId: string | null; documentId: string | null };
  originKind: string;
}) {
  if (originKind === 'evidence' && origin.evidenceFactId) {
    return (
      <Link
        href={`/patients/${patientId}/evidence`}
        className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted"
      >
        origin: extracted evidence
      </Link>
    );
  }
  if (originKind === 'record_gap' && origin.recordGapId) {
    return (
      <Link
        href={`/patients/${patientId}/record-map`}
        className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted"
      >
        origin: missing document
      </Link>
    );
  }
  if (originKind === 'conflict' && origin.conflictSetId) {
    return (
      <Link
        href={`/patients/${patientId}/conflicts/${origin.conflictSetId}`}
        className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted"
      >
        origin: source conflict
      </Link>
    );
  }
  if (originKind === 'document' && origin.documentId) {
    return (
      <Link
        href={`/patients/${patientId}/sources/${origin.documentId}`}
        className="mono text-[11px] text-[var(--color-accent)] underline decoration-dotted"
      >
        origin: document
      </Link>
    );
  }
  return <span className="mono text-[11px] text-[var(--color-state-conflicting)]">origin missing</span>;
}
