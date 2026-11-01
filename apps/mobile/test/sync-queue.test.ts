import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineSyncQueue } from '../src/sync-queue';
import type { PatientPortalApiClient } from '../src/api-client';

describe('MOB-012: OfflineSyncQueue', () => {
  it('enqueues mutations in FIFO order with unique idempotency keys', () => {
    const queue = new OfflineSyncQueue();
    assert.equal(queue.size(), 0);

    const m1 = queue.enqueue({ type: 'review', id: 'doc-1' });
    const m2 = queue.enqueue({ type: 'flag', id: 'doc-2', reason: 'Incorrect lab date' });

    assert.equal(queue.size(), 2);
    assert.ok(m1.idempotencyKey);
    assert.ok(m2.idempotencyKey);
    assert.notEqual(m1.idempotencyKey, m2.idempotencyKey);

    const items = queue.peekAll();
    assert.equal(items[0]!.action.type, 'review');
    assert.equal(items[1]!.action.type, 'flag');
  });

  it('flushes successfully when API calls succeed', async () => {
    const queue = new OfflineSyncQueue();
    queue.enqueue({ type: 'review', id: 'doc-1' });
    queue.enqueue({ type: 'flag', id: 'doc-2', reason: 'Incorrect facility' });

    const executedActions: string[] = [];
    const mockClient = {
      async executeMutation(item: { action: { type: string } }) {
        executedActions.push(item.action.type);
        return { ok: true };
      },
    } as unknown as PatientPortalApiClient;

    const result = await queue.flush(mockClient);
    assert.equal(result.processed, 2);
    assert.equal(result.failed, 0);
    assert.equal(queue.size(), 0);
    assert.deepEqual(executedActions, ['review', 'flag']);
  });

  it('halts FIFO queue processing on network failure and preserves order for retry', async () => {
    const queue = new OfflineSyncQueue();
    queue.enqueue({ type: 'review', id: 'doc-1' });
    queue.enqueue({ type: 'review', id: 'doc-2' });

    let callCount = 0;
    const mockClient = {
      async executeMutation() {
        callCount++;
        throw new TypeError('Failed to fetch'); // Network error
      },
    } as unknown as PatientPortalApiClient;

    const result = await queue.flush(mockClient);
    assert.equal(result.processed, 0);
    assert.equal(result.failed, 1);
    assert.equal(queue.size(), 2); // Both remain in queue
    assert.equal(callCount, 1); // Second item was not attempted (FIFO preserved)
  });

  it('handles 401 unauthorized session expiration by invoking onSessionExpired callback', async () => {
    const queue = new OfflineSyncQueue();
    queue.enqueue({ type: 'review', id: 'doc-1' });

    let sessionExpiredCalled = false;
    queue.onSessionExpired = () => {
      sessionExpiredCalled = true;
    };

    const mockClient = {
      async executeMutation() {
        const error = new Error('Unauthorized');
        (error as { status?: number }).status = 401;
        throw error;
      },
    } as unknown as PatientPortalApiClient;

    await queue.flush(mockClient);
    assert.equal(sessionExpiredCalled, true);
  });

  it('clears all pending items completely on queue.clear()', () => {
    const queue = new OfflineSyncQueue();
    queue.enqueue({ type: 'review', id: 'doc-1' });
    queue.enqueue({ type: 'review', id: 'doc-2' });
    assert.equal(queue.size(), 2);

    queue.clear();
    assert.equal(queue.size(), 0);
    assert.deepEqual(queue.peekAll(), []);
  });
});
