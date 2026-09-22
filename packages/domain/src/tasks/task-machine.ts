import type { TaskStatus } from '../vocab/task-kinds';

/**
 * Task status is a small explicit state machine (architecture §10.3).
 * No BPMN engine, no rules DSL, no agent planner.
 */

const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['open', 'in_progress', 'blocked', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

export type TaskTransitionResult =
  | { ok: true; to: TaskStatus }
  | { ok: false; code: 'terminal' | 'no_such_transition' };

export function transitionTask(from: TaskStatus, to: TaskStatus): TaskTransitionResult {
  if (from === to) return { ok: true, to };
  if (TASK_TRANSITIONS[from].length === 0) return { ok: false, code: 'terminal' };
  if (!TASK_TRANSITIONS[from].includes(to)) return { ok: false, code: 'no_such_transition' };
  return { ok: true, to };
}

export function taskStatusesFrom(from: TaskStatus): readonly TaskStatus[] {
  return TASK_TRANSITIONS[from];
}
