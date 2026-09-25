import type { QueueMessage, QueuePort, ReceiveOptions } from '@oncobrief/ports';
import { signRequest, type AwsCredentials } from './aws-sigv4';

/**
 * Amazon SQS adapter using the AWS JSON 1.0 protocol over `fetch`.
 *
 * S3 event notifications are **at-least-once**; consumers must be idempotent
 * and must tolerate duplicates and reordering. The queue is only a transport —
 * the evidence ledger is the source of truth. See ADR 0015 and architecture
 * §16.1.
 */

export interface SqsConfig {
  region: string;
  credentials: AwsCredentials;
  /** LocalStack endpoint, e.g. `http://localhost:4566`. */
  endpoint?: string;
  /** AWS account id, needed to build queue URLs without a custom endpoint. */
  accountId?: string;
  /** Explicit queue-name → URL map; overrides construction. */
  queueUrls?: Record<string, string>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface SqsResponse {
  Messages?: {
    MessageId: string;
    ReceiptHandle: string;
    Body: string;
    Attributes?: Record<string, string>;
    MessageAttributes?: Record<string, { StringValue?: string }>;
  }[];
  MessageId?: string;
}

export class SqsQueueAdapter implements QueuePort {
  readonly name = 'sqs';
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: SqsConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  queueUrl(queueName: string): string {
    const explicit = this.config.queueUrls?.[queueName];
    if (explicit) return explicit;
    const base = this.config.endpoint ?? `https://sqs.${this.config.region}.amazonaws.com`;
    const account = this.config.accountId ?? '000000000000';
    return `${base.replace(/\/$/, '')}/${account}/${queueName}`;
  }

  private async call<T>(target: string, payload: Record<string, unknown>): Promise<T> {
    const url = this.queueUrl('');
    const endpoint = this.config.endpoint ?? `https://sqs.${this.config.region}.amazonaws.com`;
    const parsed = new URL(endpoint);
    const headers = signRequest({
      url: `${parsed.origin}/`,
      path: '/',
      region: this.config.region,
      service: 'sqs',
      method: 'POST',
      credentials: this.config.credentials,
      now: this.now(),
      headers: {
        'content-type': 'application/x-amz-json-1.0',
        'x-amz-target': `AmazonSQS.${target}`,
      },
      body: JSON.stringify(payload),
    });
    void url;
    const res = await this.fetchImpl(`${parsed.origin}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`sqs_${target}_failed:${res.status}:${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async send(
    queueName: string,
    body: unknown,
    options?: { correlationId?: string; delaySeconds?: number },
  ): Promise<{ id: string }> {
    const payload: Record<string, unknown> = {
      QueueUrl: this.queueUrl(queueName),
      MessageBody: JSON.stringify(body),
    };
    if (options?.delaySeconds) payload['DelaySeconds'] = options.delaySeconds;
    if (options?.correlationId) {
      payload['MessageAttributes'] = {
        correlationId: { DataType: 'String', StringValue: options.correlationId },
      };
    }
    const res = await this.call<SqsResponse>('SendMessage', payload);
    return { id: res.MessageId ?? '' };
  }

  async receive(queueName: string, options?: ReceiveOptions): Promise<QueueMessage[]> {
    const res = await this.call<SqsResponse>('ReceiveMessage', {
      QueueUrl: this.queueUrl(queueName),
      MaxNumberOfMessages: options?.maxMessages ?? 10,
      WaitTimeSeconds: options?.waitSeconds ?? 20,
      VisibilityTimeout: options?.visibilityTimeoutSeconds ?? 300,
      AttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    });
    return (res.Messages ?? []).map((m) => ({
      id: m.MessageId,
      receiptHandle: m.ReceiptHandle,
      body: safeJson(m.Body),
      correlationId: m.MessageAttributes?.['correlationId']?.StringValue ?? '',
      receiveCount: Number(m.Attributes?.['ApproximateReceiveCount'] ?? '1'),
      attributes: m.Attributes ?? {},
    }));
  }

  async delete(queueName: string, receiptHandle: string): Promise<void> {
    await this.call('DeleteMessage', {
      QueueUrl: this.queueUrl(queueName),
      ReceiptHandle: receiptHandle,
    });
  }

  async changeVisibility(queueName: string, receiptHandle: string, timeoutSeconds: number): Promise<void> {
    await this.call('ChangeMessageVisibility', {
      QueueUrl: this.queueUrl(queueName),
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: timeoutSeconds,
    });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
