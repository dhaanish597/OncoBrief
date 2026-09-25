import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Worker configuration (ADR 0015). Every value comes from the environment;
 * nothing is hard-coded, and the Bedrock model id is never assumed.
 */

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const repoRoot = findRepoRoot(process.cwd());
const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) loadDotenv({ path: envPath });
else if (existsSync(resolve(repoRoot, '.env.example'))) loadDotenv({ path: resolve(repoRoot, '.env.example') });

export interface AwsCredentialsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface WorkerConfig {
  workerName: string;
  region: string;
  endpoint?: string;
  credentials: AwsCredentialsConfig;
  queueDriver: 'sqs' | 'memory';
  storageDriver: 'fs' | 's3';
  documentQueue: string;
  ocrResultQueue: string;
  documentQueueUrl?: string;
  ocrResultQueueUrl?: string;
  s3Bucket: string;
  textractNotificationTopicArn?: string;
  textractNotificationRoleArn?: string;
  extractionDriver: 'rule' | 'bedrock';
  bedrockModelId: string;
  pollWaitSeconds: number;
  visibilityTimeoutSeconds: number;
  ocrPollDelaySeconds: number;
  ocrMaxPolls: number;
  maxReceiveCount: number;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): WorkerConfig {
  const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'ap-south-1';
  const endpoint = process.env['AWS_ENDPOINT_URL'];
  const credentials: AwsCredentialsConfig = {
    accessKeyId: required('AWS_ACCESS_KEY_ID', 'test'),
    secretAccessKey: required('AWS_SECRET_ACCESS_KEY', 'test'),
  };
  if (process.env['AWS_SESSION_TOKEN']) credentials.sessionToken = process.env['AWS_SESSION_TOKEN'];

  const config: WorkerConfig = {
    workerName: process.env['WORKER_NAME'] ?? 'oncobrief-ingest',
    region,
    credentials,
    queueDriver: (process.env['QUEUE_DRIVER'] ?? 'memory') as 'sqs' | 'memory',
    storageDriver: (process.env['STORAGE_DRIVER'] ?? 'fs') as 'fs' | 's3',
    documentQueue: process.env['SQS_DOCUMENT_QUEUE'] ?? 'oncobrief-document-ingest',
    ocrResultQueue: process.env['SQS_OCR_RESULT_QUEUE'] ?? 'oncobrief-ocr-result',
    s3Bucket: process.env['S3_DOCUMENTS_BUCKET'] ?? 'oncobrief-documents',
    extractionDriver: (process.env['EXTRACTION_DRIVER'] ?? 'rule') as 'rule' | 'bedrock',
    bedrockModelId: process.env['BEDROCK_MODEL_ID'] ?? '',
    pollWaitSeconds: int('WORKER_POLL_WAIT_SECONDS', 20),
    visibilityTimeoutSeconds: int('WORKER_VISIBILITY_TIMEOUT_SECONDS', 300),
    ocrPollDelaySeconds: int('OCR_POLL_DELAY_SECONDS', 15),
    ocrMaxPolls: int('OCR_MAX_POLLS', 40),
    maxReceiveCount: int('MAX_RECEIVE_COUNT', 3),
  };
  if (endpoint) config.endpoint = endpoint;
  if (process.env['SQS_DOCUMENT_QUEUE_URL']) config.documentQueueUrl = process.env['SQS_DOCUMENT_QUEUE_URL'];
  if (process.env['SQS_OCR_RESULT_QUEUE_URL']) config.ocrResultQueueUrl = process.env['SQS_OCR_RESULT_QUEUE_URL'];
  if (process.env['TEXTRACT_NOTIFICATION_TOPIC_ARN'])
    config.textractNotificationTopicArn = process.env['TEXTRACT_NOTIFICATION_TOPIC_ARN'];
  if (process.env['TEXTRACT_NOTIFICATION_ROLE_ARN'])
    config.textractNotificationRoleArn = process.env['TEXTRACT_NOTIFICATION_ROLE_ARN'];
  return config;
}
