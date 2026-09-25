import { randomUUID } from 'node:crypto';
import type { QueueMessage, QueuePort, ReceiveOptions } from '@oncobrief/ports';

interface Entry<T = unknown> {
  id: string;
  receiptHandle: string;
  body: T;
  correlationId: string;
  receiveCount: number;
  attributes: Record<string, string>;
}

/**
 * In-process queue for offline tests. It preserves the property the handlers
 * depend on — delivery is at-least-once and re-inspectable — so idempotency
 * can be exercised without SQS or LocalStack.
 */
export class MemoryQueueAdapter implements QueuePort {
  readonly name = 'memory';
  private readonly queues = new Map<string, Entry[]>();
  private readonly inFlight = new Map<string, Entry>();
  sent: { queueName: string; body: unknown }[] = [];

  async send(queueName: string, body: unknown, options?: { correlationId?: string }): Promise<{ id: string }> {
    const id = randomUUID();
    const entry: Entry = {
      id,
      receiptHandle: `${id}:${randomUUID()}`,
      body,
      correlationId: options?.correlationId ?? '',
      receiveCount: 0,
      attributes: {},
    };
    const list = this.queues.get(queueName) ?? [];
    list.push(entry);
    this.queues.set(queueName, list);
    this.sent.push({ queueName, body });
    return { id };
  }

  async receive(queueName: string, options?: ReceiveOptions): Promise<QueueMessage[]> {
    const list = this.queues.get(queueName) ?? [];
    const max = options?.maxMessages ?? 10;
    const taken = list.splice(0, max);
    return taken.map((entry) => {
      entry.receiveCount += 1;
      entry.attributes['ApproximateReceiveCount'] = String(entry.receiveCount);
      this.inFlight.set(entry.receiptHandle, entry);
      return {
        id: entry.id,
        receiptHandle: entry.receiptHandle,
        body: entry.body,
        correlationId: entry.correlationId,
        receiveCount: entry.receiveCount,
        attributes: entry.attributes,
      };
    });
  }

  async delete(_queueName: string, receiptHandle: string): Promise<void> {
    this.inFlight.delete(receiptHandle);
  }

  async changeVisibility(queueName: string, receiptHandle: string, _timeoutSeconds: number): Promise<void> {
    const entry = this.inFlight.get(receiptHandle);
    if (!entry) return;
    this.inFlight.delete(receiptHandle);
    const list = this.queues.get(queueName) ?? [];
    list.push(entry);
    this.queues.set(queueName, list);
  }

  size(queueName: string): number {
    return (this.queues.get(queueName) ?? []).length;
  }
}
