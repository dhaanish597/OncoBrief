import { type Action } from './domain';
import type { PatientPortalApiClient } from './api-client';

export interface QueuedMutation {
  id: string;
  action: Action;
  idempotencyKey: string;
  createdAt: string;
  status: 'pending' | 'in_flight' | 'failed' | 'completed';
  retryCount: number;
  lastError?: string;
}

export class OfflineSyncQueue {
  private queue: QueuedMutation[] = [];
  private inFlight = false;
  onSessionExpired: (() => void) | null = null;
  onQueueChange: (() => void) | null = null;

  size(): number {
    return this.queue.length;
  }

  peekAll(): QueuedMutation[] {
    return [...this.queue];
  }

  enqueue(action: Action, customKey?: string): QueuedMutation {
    const item: QueuedMutation = {
      id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      action,
      idempotencyKey:
        customKey ?? `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    };
    this.queue.push(item);
    if (this.onQueueChange) this.onQueueChange();
    return item;
  }

  clear() {
    this.queue = [];
    if (this.onQueueChange) this.onQueueChange();
  }

  async flush(client: PatientPortalApiClient): Promise<{ processed: number; failed: number }> {
    if (this.inFlight) return { processed: 0, failed: 0 };
    this.inFlight = true;

    let processed = 0;
    let failed = 0;

    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        if (!item) break;
        item.status = 'in_flight';

        try {
          await client.executeMutation({
            action: item.action as unknown as { type: string; id?: string; reason?: string },
            idempotencyKey: item.idempotencyKey,
          });

          // Successfully processed: remove from FIFO queue
          item.status = 'completed';
          this.queue.shift();
          processed++;
          if (this.onQueueChange) this.onQueueChange();
        } catch (err: unknown) {
          const status = (err as { status?: number }).status;

          // 401 Unauthorized: session expired
          if (status === 401) {
            item.status = 'failed';
            item.lastError = 'session_expired';
            if (this.onSessionExpired) this.onSessionExpired();
            failed++;
            break; // Stop queue processing on expired auth
          }

          // Network or 5xx server error: keep in queue for future retry, stop sequential processing
          item.status = 'pending';
          item.retryCount++;
          item.lastError = err instanceof Error ? err.message : String(err);
          failed++;
          break; // Preserve FIFO order on network/server failure
        }
      }
    } finally {
      this.inFlight = false;
    }

    return { processed, failed };
  }
}
