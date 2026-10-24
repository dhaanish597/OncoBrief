'use client';
import { useActionState } from 'react';
import {
  confirmTaskOwnershipAction,
  confirmGapWaiverAction,
  confirmInstructionTaskAction,
  type OwnershipResult,
} from '@/lib/task-ownership-actions';
const initial: OwnershipResult = { ok: false, message: '' };
const inputClass = 'mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs';
function Feedback({ state }: { state: OwnershipResult }) {
  return state.message ? (
    <p role={state.ok ? 'status' : 'alert'} className="text-xs">
      {state.message}
    </p>
  ) : null;
}
export function TaskOwnershipControl({
  patientId,
  taskId,
  assignedTo,
  dueOn,
  members,
}: {
  patientId: string;
  taskId: string;
  assignedTo: string | null;
  dueOn: string | null;
  members: { userId: string; displayName: string; role: string }[];
}) {
  const [state, action, pending] = useActionState(confirmTaskOwnershipAction, initial);
  return (
    <form
      action={action}
      className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--color-rule)] pt-3"
      aria-label="Assign task owner"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="expectedAssigneeId" value={assignedTo ?? ''} />
      <label className="text-xs">
        Task owner
        <select
          aria-label="Task owner"
          name="assigneeId"
          defaultValue={assignedTo ?? ''}
          required
          className={`${inputClass} mt-1 block`}
        >
          <option value="" disabled>
            Select staff member
          </option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName} ({m.role.replaceAll('_', ' ')})
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Deadline
        <input
          aria-label="Task deadline"
          type="date"
          name="dueOn"
          defaultValue={dueOn ?? ''}
          className={`${inputClass} mt-1 block`}
        />
      </label>
      <label className="text-xs">
        <input type="checkbox" name="confirmed" required /> Confirm owner and deadline
      </label>
      <button disabled={pending} className={inputClass}>
        {pending ? 'Saving…' : 'Confirm assignment'}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function GapWaiverControl({ patientId, gapId }: { patientId: string; gapId: string }) {
  const [state, action, pending] = useActionState(confirmGapWaiverAction, initial);
  return (
    <details className="mt-3">
      <summary className="mono cursor-pointer text-xs underline">
        Waive expected administrative item
      </summary>
      <form action={action} className="mt-2 space-y-2" aria-label="Administrative gap waiver">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="gapId" value={gapId} />
        <label className="block text-xs">
          Administrative reason
          <textarea
            name="reason"
            required
            maxLength={2000}
            className={`${inputClass} mt-1 block w-full`}
          />
        </label>
        <label className="block text-xs">
          <input name="confirmed" type="checkbox" required /> This expected administrative item is
          not applicable. This does not resolve a clinical question or alter evidence.
        </label>
        <button disabled={pending} className={inputClass}>
          {pending ? 'Saving…' : 'Confirm administrative waiver'}
        </button>
        <Feedback state={state} />
      </form>
    </details>
  );
}
export function InstructionTaskControl({
  patientId,
  factId,
  taskKinds,
}: {
  patientId: string;
  factId: string;
  taskKinds: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(confirmInstructionTaskAction, initial);
  return (
    <form
      action={action}
      className="mt-2 flex flex-wrap items-end gap-3"
      aria-label="Create task from instruction"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="factId" value={factId} />
      <label className="text-xs">
        Administrative action
        <select name="taskKind" required className={`${inputClass} block`}>
          {taskKinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <input name="confirmed" type="checkbox" required /> I confirm the exact source text
        documents an administrative action.
      </label>
      <button disabled={pending} className={inputClass}>
        {pending ? 'Saving…' : 'Confirm source-backed task'}
      </button>
      <Feedback state={state} />
    </form>
  );
}
