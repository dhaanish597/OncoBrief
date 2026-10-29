import Link from 'next/link';
import { TASK_KINDS, TASK_KIND_LABEL, type TaskKind, type TaskStatus } from '@oncobrief/domain';
import { listMyTasks } from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';
import { EmptyFinding } from '@/components/evidence';
import { taskStatusAction } from '@/lib/actions';

function taskStatusBadge(status: TaskStatus): string {
  switch (status) {
    case 'open':
      return 'border-blue-300 bg-blue-50 text-blue-800';
    case 'assigned':
      return 'border-indigo-300 bg-indigo-50 text-indigo-800';
    case 'in_progress':
      return 'border-purple-300 bg-purple-50 text-purple-800';
    case 'blocked':
      return 'border-red-300 bg-red-50 text-red-800';
    case 'done':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'cancelled':
      return 'border-gray-300 bg-gray-50 text-gray-800';
    default:
      return 'border-gray-300 bg-gray-50 text-gray-800';
  }
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: 'mine' | 'all';
    status?: string;
    kind?: string;
  }>;
}) {
  await requireSession();
  const params = await searchParams;

  const scope = params.scope || 'mine';
  const statusParam = (params.status || 'open_only') as TaskStatus | 'open_only' | 'all';
  const kind = params.kind || undefined;

  const data = await withSession(async (q, s) => {
    const tasks = await listMyTasks(q, s.orgId, {
      assignedTo: scope === 'mine' ? s.userId : undefined,
      status: statusParam,
      taskKind: kind,
    });
    return { tasks };
  });

  const { tasks } = data;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
              Operational Care Coordination
            </span>
            <span className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[11px]">
              {tasks.length} tasks
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Care Team Tasks & Handoffs</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)] max-w-2xl">
            Cross-patient administrative task worklist. Every task is strictly anchored to clinical documentation,
            an evidence fact, a record gap, or a reconciliation conflict.
          </p>
        </div>

        <div className="flex border border-[var(--color-rule-strong)]">
          <Link
            href={`/my-tasks?scope=mine&status=${statusParam}${kind ? `&kind=${kind}` : ''}`}
            className={`mono px-3.5 py-1.5 text-xs uppercase ${
              scope === 'mine' ? 'bg-[var(--color-ink)] text-white' : 'hover:bg-[var(--color-paper)]'
            }`}
          >
            My Assigned
          </Link>
          <Link
            href={`/my-tasks?scope=all&status=${statusParam}${kind ? `&kind=${kind}` : ''}`}
            className={`mono px-3.5 py-1.5 text-xs uppercase ${
              scope === 'all' ? 'bg-[var(--color-ink)] text-white' : 'hover:bg-[var(--color-paper)]'
            }`}
          >
            All Team Tasks
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mt-6 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4">
        <form method="GET" action="/my-tasks" className="grid gap-3 sm:grid-cols-3 items-end">
          <input type="hidden" name="scope" value={scope} />

          <div>
            <label htmlFor="status" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Status Filter
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusParam}
              className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
            >
              <option value="open_only">Active Open Only (Default)</option>
              <option value="all">All Statuses (Including Closed)</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Resolved / Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label htmlFor="kind" className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              Task Kind
            </label>
            <select
              id="kind"
              name="kind"
              defaultValue={kind || ''}
              className="mt-1 block w-full border border-[var(--color-rule-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)]"
            >
              <option value="">All Task Types</option>
              {TASK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TASK_KIND_LABEL[k as TaskKind] || k}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="mono w-full border border-[var(--color-ink)] px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
            >
              Filter
            </button>
            <Link
              href={`/my-tasks?scope=${scope}`}
              className="mono border border-[var(--color-rule-strong)] px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-paper)]"
            >
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Task List */}
      <div className="mt-6">
        {tasks.length === 0 ? (
          <EmptyFinding>
            No tasks found matching this criteria. Tasks automatically originate from missing documents, open conflicts, and clinician encounters.
          </EmptyFinding>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 transition-colors hover:border-[var(--color-ink)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`mono border px-2 py-0.5 text-[10px] font-bold uppercase ${taskStatusBadge(
                        task.status,
                      )}`}
                    >
                      {task.status.replaceAll('_', ' ')}
                    </span>
                    <span className="mono border border-[var(--color-rule)] bg-white px-2 py-0.5 text-[10px] uppercase text-[var(--color-ink-soft)]">
                      {TASK_KIND_LABEL[task.taskKind as TaskKind] || task.taskKind}
                    </span>
                    <span className="mono text-[10px] text-[var(--color-ink-soft)] uppercase">
                      Origin: {task.originKind}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {task.dueOn ? (
                      <span className="mono text-[11px] font-medium text-[var(--color-ink)]">
                        Due: {task.dueOn}
                      </span>
                    ) : null}
                    <Link
                      href={`/patients/${task.patientId}/tasks`}
                      className="mono text-[11px] underline hover:text-[var(--color-accent)]"
                    >
                      Patient Tasks →
                    </Link>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <h3 className="font-semibold text-sm text-[var(--color-ink)]">
                      {task.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-soft)]">
                      <span>
                        Patient:{' '}
                        <Link
                          href={`/patients/${task.patientId}/overview`}
                          className="font-medium underline text-[var(--color-ink)]"
                        >
                          {task.patientName}
                        </Link>{' '}
                        {task.patientIdentifier ? `(${task.patientIdentifier})` : ''}
                      </span>
                      <span>·</span>
                      <span>Assigned to: <strong className="text-[var(--color-ink)]">{task.assigneeName || 'Unassigned'}</strong></span>
                      <span>·</span>
                      <span>Created by {task.creatorName}</span>
                    </div>

                    {task.closureNote ? (
                      <p className="mono mt-2 text-xs text-emerald-800 bg-emerald-50 p-2 border border-emerald-200">
                        Resolution Note: {task.closureNote}
                      </p>
                    ) : null}
                  </div>

                  {/* Inline Status Actions */}
                  {task.status !== 'done' && task.status !== 'cancelled' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {task.status !== 'in_progress' ? (
                        <form action={taskStatusAction} className="inline">
                          <input type="hidden" name="patientId" value={task.patientId} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="toStatus" value="in_progress" />
                          <button
                            type="submit"
                            className="mono border border-purple-600 px-2.5 py-1 text-[11px] uppercase text-purple-700 hover:bg-purple-50"
                          >
                            In Progress
                          </button>
                        </form>
                      ) : null}

                      {task.status !== 'blocked' ? (
                        <form action={taskStatusAction} className="inline">
                          <input type="hidden" name="patientId" value={task.patientId} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="toStatus" value="blocked" />
                          <button
                            type="submit"
                            className="mono border border-red-600 px-2.5 py-1 text-[11px] uppercase text-red-700 hover:bg-red-50"
                          >
                            Mark Blocked
                          </button>
                        </form>
                      ) : null}

                      <form action={taskStatusAction} className="inline">
                        <input type="hidden" name="patientId" value={task.patientId} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="toStatus" value="done" />
                        <input type="hidden" name="note" value="Resolved by coordinator" />
                        <button
                          type="submit"
                          className="mono border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[11px] uppercase text-emerald-800 hover:bg-emerald-100"
                        >
                          Resolve Done
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
