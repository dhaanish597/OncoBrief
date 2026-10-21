import { env } from '@oncobrief/db/worker';
import {
  BedrockLlmProvider,
  LlmExtractionAdapter,
  LocalFsStorageAdapter,
  LocalMultimodalOcrAdapter,
  RuleBasedExtractor,
  S3StorageAdapter,
  SarvamVisionOcrAdapter,
  SqsQueueAdapter,
  TextractOcrAdapter,
} from '@oncobrief/adapters';
import type { AsyncOcrPort, ExtractionPort, QueuePort, StoragePort } from '@oncobrief/ports';
import type { WorkerConfig } from './config';
import { MemoryQueueAdapter } from './memory-queue';

/**
 * Adapter wiring. Local development keeps the filesystem store and the
 * rule-based extractor; cloud development selects S3, SQS, Textract and
 * Bedrock from environment variables. Nothing here is hard-coded to a region
 * or a model. See ADR 0015.
 */

export function buildQueue(config: WorkerConfig): QueuePort {
  if (config.queueDriver === 'memory') return new MemoryQueueAdapter();
  const queueUrls: Record<string, string> = {};
  if (config.documentQueueUrl) queueUrls[config.documentQueue] = config.documentQueueUrl;
  if (config.ocrResultQueueUrl) queueUrls[config.ocrResultQueue] = config.ocrResultQueueUrl;
  const adapter = new SqsQueueAdapter({
    region: config.region,
    credentials: config.credentials,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(process.env['AWS_ACCOUNT_ID'] ? { accountId: process.env['AWS_ACCOUNT_ID'] } : {}),
    queueUrls,
  });
  return adapter;
}

export function buildStorage(config: WorkerConfig): StoragePort {
  if (config.storageDriver === 's3') {
    return new S3StorageAdapter({
      bucket: config.s3Bucket,
      region: config.region,
      credentials: config.credentials,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: true,
    });
  }
  return new LocalFsStorageAdapter(env.storageFsRoot, env.sessionSecret);
}

export function buildAsyncOcr(config: WorkerConfig): AsyncOcrPort {
  if (config.ocrDriver === 'sarvam' || (config.ocrDriver === 'auto' && config.sarvamApiKey)) {
    return new SarvamVisionOcrAdapter({ apiKey: config.sarvamApiKey });
  }

  if (
    config.ocrDriver === 'textract' ||
    (config.ocrDriver === 'auto' &&
      config.credentials.accessKeyId &&
      config.credentials.accessKeyId !== 'test')
  ) {
    return new TextractOcrAdapter({
      region: config.region,
      credentials: config.credentials,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.textractNotificationTopicArn
        ? { notificationTopicArn: config.textractNotificationTopicArn }
        : {}),
      ...(config.textractNotificationRoleArn
        ? { notificationRoleArn: config.textractNotificationRoleArn }
        : {}),
    });
  }

  return new LocalMultimodalOcrAdapter();
}

export function buildExtractor(config: WorkerConfig): { extractor: ExtractionPort; kind: 'rule' | 'llm' } {
  if (config.extractionDriver === 'bedrock') {
    if (!config.bedrockModelId) {
      throw new Error(
        'missing_env:BEDROCK_MODEL_ID — Bedrock extraction requires a configured model id (region availability varies)',
      );
    }
    const provider = new BedrockLlmProvider({
      region: config.region,
      credentials: config.credentials,
      modelId: config.bedrockModelId,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
    return { extractor: new LlmExtractionAdapter(provider), kind: 'llm' };
  }
  return { extractor: new RuleBasedExtractor(), kind: 'rule' };
}

export interface WorkerPorts {
  queue: QueuePort;
  storage: StoragePort;
  ocr: AsyncOcrPort;
  extractor: ExtractionPort;
  extractorKind: 'rule' | 'llm';
}

export function createPorts(config: WorkerConfig): WorkerPorts {
  const queue = buildQueue(config);
  const storage = buildStorage(config);
  const ocr = buildAsyncOcr(config);
  const { extractor, kind: extractorKind } = buildExtractor(config);
  return { queue, storage, ocr, extractor, extractorKind };
}
