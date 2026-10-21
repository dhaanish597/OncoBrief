import { closePools } from '@oncobrief/db/worker';
import { loadConfig, type WorkerConfig } from './config';
import { JsonLogger } from './logger';
import { createPorts } from './ports';
import { PostgresIngestionStore } from './postgres-store';
import { handleDocumentIngest } from './handlers/document-ingest';
import { handleOcrResult } from './handlers/ocr-result';
import { parseIngestMessage, parseOcrMessage } from './messages';
import type { QueuePort } from '@oncobrief/ports';

/**
 * OncoBrief ingestion worker (ADR 0015).
 *
 * Two SQS consumers in one process:
 *   document-ingest : S3 ObjectCreated → hash → start Textract / Sarvam / Local OCR
 *   ocr-result      : OCR completion (or self-poll) → normalise → promote
 *
 * S3 and SQS are at-least-once. Every handler is idempotent against the
 * database, and a message is deleted only after the handler returns. A
 * transient failure leaves the message for redelivery and, past
 * `MAX_RECEIVE_COUNT`, the queue's redrive policy moves it to the DLQ.
 */

let running = true;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new JsonLogger(config.workerName);

  if (config.queueDriver === 'memory') {
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        {},
        'QUEUE_DRIVER=memory is forbidden in production; set QUEUE_DRIVER=sqs.',
      );
      process.exit(2);
    } else {
      logger.warn(
        { queue_driver: 'memory' },
        'Starting worker with in-memory queue. Messages will not persist across worker restarts.',
      );
    }
  }

  const ports = createPorts(config);
  const useTextractNotifications = Boolean(config.textractNotificationTopicArn);

  logger.info(
    {
      queue_driver: config.queueDriver,
      storage_driver: config.storageDriver,
      extraction_driver: ports.extractorKind,
      ocr_driver: config.ocrDriver,
      region: config.region,
      document_queue: config.documentQueue,
      ocr_result_queue: config.ocrResultQueue,
      textract_notifications: useTextractNotifications,
    },
    'worker started',
  );

  const stop = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    running = false;
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  await Promise.all([
    poll(ports.queue, config.documentQueue, config, logger, async (message) => {
      const parsed = parseIngestMessage(message.body);
      if (!parsed) {
        logger.warn({ error_code: 'unparseable_message' }, 'unparseable document-ingest message; leaving for DLQ');
        return false;
      }
      const store = new PostgresIngestionStore(parsed.orgId);
      await handleDocumentIngest(parsed, {
        store,
        queue: ports.queue,
        storage: ports.storage,
        ocr: ports.ocr,
        extractor: ports.extractor,
        logger,
        config: {
          documentQueue: config.documentQueue,
          ocrResultQueue: config.ocrResultQueue,
          ocrPollDelaySeconds: config.ocrPollDelaySeconds,
          useTextractNotifications,
        },
        orgId: parsed.orgId,
      });
      return true;
    }),
    poll(ports.queue, config.ocrResultQueue, config, logger, async (message) => {
      const parsed = parseOcrMessage(message.body);
      if (!parsed || !parsed.orgId) {
        logger.warn({ error_code: 'unparseable_message' }, 'unparseable ocr-result message; leaving for DLQ');
        return false;
      }
      const store = new PostgresIngestionStore(parsed.orgId);
      await handleOcrResult(parsed, {
        store,
        queue: ports.queue,
        storage: ports.storage,
        ocr: ports.ocr,
        extractor: ports.extractor,
        logger,
        config: {
          ocrResultQueue: config.ocrResultQueue,
          ocrPollDelaySeconds: config.ocrPollDelaySeconds,
          ocrMaxPolls: config.ocrMaxPolls,
          extractorKind: ports.extractorKind,
        },
        orgId: parsed.orgId,
      });
      return true;
    }),
  ]);

  await closePools();
  logger.info({}, 'worker stopped');
}

async function poll(
  queue: QueuePort,
  queueName: string,
  config: WorkerConfig,
  logger: JsonLogger,
  handle: (message: { body: unknown; receiptHandle: string; receiveCount: number }) => Promise<boolean>,
): Promise<void> {
  while (running) {
    let messages;
    try {
      messages = await queue.receive(queueName, {
        maxMessages: 5,
        waitSeconds: config.pollWaitSeconds,
        visibilityTimeoutSeconds: config.visibilityTimeoutSeconds,
      });
    } catch (err) {
      logger.error({ error_code: 'receive_failed', stage: queueName }, err instanceof Error ? err.message : 'receive failed');
      await sleep(2000);
      continue;
    }

    for (const message of messages) {
      try {
        const ack = await handle(message);
        if (ack) await queue.delete(queueName, message.receiptHandle);
      } catch (err) {
        const errorCode = err instanceof Error && /^[a-z_]+:/.test(err.message) ? err.message.split(':')[0]! : 'handler_error';
        logger.error(
          {
            error_code: errorCode,
            stage: queueName,
            receive_count: message.receiveCount,
          },
          err instanceof Error ? err.message : 'handler failed',
        );
        // Do not delete: SQS will redeliver, then redrive to the DLQ.
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'worker crashed', error: String(err) }));
  process.exit(1);
});
