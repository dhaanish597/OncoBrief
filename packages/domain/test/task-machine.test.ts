import { describe, expect, it } from 'vitest';
import { transitionTask, taskStatusesFrom, type TaskStatus } from '../src/index.js';

const ALL: TaskStatus[] = ['open', 'assigned', 'in_progress', 'blocked', 'done', 'cancelled'];

describe('task status machine', () => {
  it('allows the documented transitions', () => {
    const legal: [TaskStatus, TaskStatus][] = [
      ['open', 'assigned'],
      ['open', 'in_progress'],
      ['open', 'cancelled'],
      ['assigned', 'in_progress'],
      ['assigned', 'blocked'],
      ['assigned', 'cancelled'],
      ['assigned', 'open'],
      ['in_progress', 'blocked'],
      ['in_progress', 'done'],
      ['in_progress', 'cancelled'],
      ['blocked', 'in_progress'],
      ['blocked', 'cancelled'],
    ];
    for (const [from, to] of legal) {
      expect(transitionTask(from, to), `${from} -> ${to}`).toEqual({ ok: true, to });
    }
  });

  it('rejects illegal transitions', () => {
    expect(transitionTask('open', 'done').ok).toBe(false);
    expect(transitionTask('blocked', 'done').ok).toBe(false);
    expect(transitionTask('done', 'in_progress').ok).toBe(false);
  });

  it('done and cancelled are terminal', () => {
    for (const t of ALL) {
      if (t === 'done' || t === 'cancelled') {
        expect(taskStatusesFrom(t)).toHaveLength(0);
      }
    }
  });

  it('a no-op transition to the same status succeeds', () => {
    for (const t of ALL) expect(transitionTask(t, t)).toEqual({ ok: true, to: t });
  });
});
