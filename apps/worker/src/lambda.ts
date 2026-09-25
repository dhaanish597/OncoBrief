import { JsonLogger } from './logger';
import { loadConfig } from './config';
import { buildAsyncOcr, buildExtractor, buildQueue, buildStorage } from './ports';
import { PostgresIngestionStore } from './postgres-store';
import { handleDocumentIngest } from './handlers/document-ingest';
import { handleOcrResult } from './handlers/ocr-result';
import { parseIngestMessage, parseOcrMessage } from './messages';

/**
 * AWS Lambda entry points (ADR 0015).
 *
 * The same handler functions used by the long-running worker are invoked here
 * per SQS batch. Partial-batch responses are returned so that only the failed
 * messages are redelivered, and the queue's redrive policy still moves a
 * repeatedly-failing message to the DLQ.
 *
 * The Lambda package must be bundled (esbuild) with native modules externalised;
 * see docs/aws-setup.md. This file is the entry the Terraform `handler` names.
 */

interface SqsEvent {
  Records: {
    messageId: string;
    body: string;
    attributes?: Record<string, string>;
  }[];
}

interface SqsBatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

export async function documentIngestHandler(event: SqsEvent): Promise<SqsBatchResponse> {
  return runBatch(event, 'document');
}

export async function ocrResultHandler(event: SqsEvent): Promise<SqsBatchResponse> {
  return runBatch(event, 'ocr');
}

async function runBatch(event: SqsEvent, stage: 'document' | 'ocr'): Promise<SqsBatchResponse> {
  const config = loadConfig();
  const logger = new JsonLogger(config.workerName);
  const queue = buildQueue(config);
  const storage = buildStorage(config);
  const ocr = buildAsyncOcr(config);
  const { extractor, kind } = buildExtractor(config);
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      if (stage === 'document') {
        const parsed = parseIngestMessage(record.body);
        if (!parsed) {
          // S3 event bodies contain only bucket/key identifiers, never document
          // text, so a short preview here is safe and makes the cause obvious.
          logger.error(
            {
              error_code: 'unparseable_message',
              stage,
              message_id: record.messageId,
              body_preview: record.body.slice(0, 200),
            },
            'unparseable document-ingest message',
          );
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }
        await handleDocumentIngest(parsed, {
          store: new PostgresIngestionStore(parsed.orgId),
          queue,
          storage,
          ocr,
          extractor,
          logger,
          config: {
            documentQueue: config.documentQueue,
            ocrResultQueue: config.ocrResultQueue,
            ocrPollDelaySeconds: config.ocrPollDelaySeconds,
            useTextractNotifications: Boolean(config.textractNotificationTopicArn),
          },
          orgId: parsed.orgId,
        });
      } else {
        const parsed = parseOcrMessage(record.body);
        if (!parsed || !parsed.orgId) {
          logger.error(
            {
              error_code: 'unparseable_message',
              stage,
              message_id: record.messageId,
              body_preview: record.body.slice(0, 200),
            },
            'unparseable ocr-result message',
          );
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }
        await handleOcrResult(parsed, {
          store: new PostgresIngestionStore(parsed.orgId),
          queue,
          storage,
          ocr,
          extractor,
          logger,
          config: {
            ocrResultQueue: config.ocrResultQueue,
            ocrPollDelaySeconds: config.ocrPollDelaySeconds,
            ocrMaxPolls: config.ocrMaxPolls,
            extractorKind: kind,
          },
          orgId: parsed.orgId,
        });
      }
    } catch (err) {
      logger.error(
        {
          error_code: err instanceof Error ? err.message.split(':')[0]! : 'handler_error',
          stage,
          message_id: record.messageId,
        },
        err instanceof Error ? err.message : 'handler failed',
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
