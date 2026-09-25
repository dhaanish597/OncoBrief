import type {
  AsyncOcrJob,
  AsyncOcrPageResult,
  AsyncOcrPort,
  AsyncOcrStartInput,
  AsyncOcrStatus,
  OcrSpanDraft,
} from '@oncobrief/ports';
import { signRequest, type AwsCredentials } from './aws-sigv4';

/**
 * Amazon Textract asynchronous document analysis adapter (Phase 3/4).
 *
 * The async API is: `StartDocumentAnalysis` → `JobId` → wait → completion
 * notification (SNS/EventBridge) → `GetDocumentAnalysis` → raw blocks. This
 * adapter covers start, poll and fetch; the worker owns the state machine.
 *
 * Raw blocks are returned untouched so they can be retained for
 * reproducibility, and `normalizeTextractBlocks` (pure) maps them to the
 * project's span model. No raw OCR output is discarded (architecture §15.1).
 *
 * The Textract API returns confidence as 0–100; we normalise to 0–1 to match
 * every other span producer.
 */

export interface TextractConfig {
  region: string;
  credentials: AwsCredentials;
  /** LocalStack endpoint, e.g. `http://localhost:4566`. */
  endpoint?: string;
  /** Optional SNS topic notified on completion (async pipeline). */
  notificationTopicArn?: string;
  notificationRoleArn?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export const TEXTRACT_ENGINE = 'textract';
export const TEXTRACT_ENGINE_VERSION = 'AnalyzeDocument-v1';

interface TextractBlock {
  BlockType?: string;
  Id?: string;
  Text?: string;
  Confidence?: number;
  Page?: number;
  Geometry?: { BoundingBox?: { Left?: number; Top?: number; Width?: number; Height?: number } };
}

interface TextractRawResponse {
  JobStatus?: string;
  StatusMessage?: string;
  Blocks?: TextractBlock[];
  NextToken?: string;
  DocumentMetadata?: { Pages?: number };
}

export class TextractOcrAdapter implements AsyncOcrPort {
  readonly name = TEXTRACT_ENGINE;
  readonly version = TEXTRACT_ENGINE_VERSION;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: TextractConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  private async call<T>(target: string, payload: Record<string, unknown>): Promise<T> {
    const endpoint = this.config.endpoint ?? `https://textract.${this.config.region}.amazonaws.com`;
    const parsed = new URL(endpoint);
    const body = JSON.stringify(payload);
    const headers = signRequest({
      url: `${parsed.origin}/`,
      path: '/',
      region: this.config.region,
      service: 'textract',
      method: 'POST',
      credentials: this.config.credentials,
      now: this.now(),
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `Textract.${target}`,
      },
      body,
    });
    const res = await this.fetchImpl(`${parsed.origin}/`, { method: 'POST', headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`textract_${target}_failed:${res.status}:${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async startDocumentAnalysis(input: AsyncOcrStartInput): Promise<AsyncOcrJob> {
    const payload: Record<string, unknown> = {
      DocumentLocation: { S3Object: { Bucket: input.s3Bucket, Name: input.s3Key } },
      FeatureTypes: ['TABLES', 'FORMS'],
    };
    if (this.config.notificationTopicArn) {
      payload['NotificationChannel'] = {
        SNSTopicArn: this.config.notificationTopicArn,
        RoleArn: this.config.notificationRoleArn,
      };
    }
    const res = await this.call<{ JobId?: string }>('StartDocumentAnalysis', payload);
    if (!res.JobId) throw new Error('textract_start_no_job_id');
    return { providerJobId: res.JobId };
  }

  async getJob(providerJobId: string): Promise<AsyncOcrStatus> {
    const res = await this.call<TextractRawResponse>('GetDocumentAnalysis', { JobId: providerJobId });
    const status = res.JobStatus ?? 'IN_PROGRESS';
    return {
      status: normaliseStatus(status),
      ...(res.StatusMessage ? { statusMessage: res.StatusMessage } : {}),
    };
  }

  async getResults(providerJobId: string): Promise<{ pages: AsyncOcrPageResult[]; raw: unknown }> {
    const allBlocks: TextractBlock[] = [];
    const rawParts: TextractRawResponse[] = [];
    let nextToken: string | undefined;
    do {
      const payload: Record<string, unknown> = { JobId: providerJobId };
      if (nextToken) payload['NextToken'] = nextToken;
      const res = await this.call<TextractRawResponse>('GetDocumentAnalysis', payload);
      if (res.JobStatus && res.JobStatus !== 'SUCCEEDED' && res.JobStatus !== 'PARTIAL_SUCCESS') {
        throw new Error(`textract_job_not_succeeded:${res.JobStatus}`);
      }
      rawParts.push(res);
      for (const block of res.Blocks ?? []) allBlocks.push(block);
      nextToken = res.NextToken;
    } while (nextToken);

    const raw = { parts: rawParts };
    return { pages: normalizeTextractBlocks(allBlocks, { engine: this.name, engineVersion: this.version }), raw };
  }
}

function normaliseStatus(status: string): AsyncOcrStatus['status'] {
  if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'PARTIAL_SUCCESS') return status;
  return 'IN_PROGRESS';
}

export interface NormalizeOptions {
  engine: string;
  engineVersion: string;
}

/**
 * Pure mapping from Textract blocks to per-page spans. Never mutates input.
 * Lines are ordered by their normalised top/left geometry, since Textract does
 * not promise reading order across a paginated response.
 */
export function normalizeTextractBlocks(
  blocks: readonly TextractBlock[],
  options: NormalizeOptions,
): AsyncOcrPageResult[] {
  const byPage = new Map<number, TextractBlock[]>();
  for (const block of blocks) {
    if (block.BlockType !== 'LINE' || typeof block.Text !== 'string') continue;
    const page = block.Page ?? 1;
    const list = byPage.get(page) ?? [];
    list.push(block);
    byPage.set(page, list);
  }

  const pages: AsyncOcrPageResult[] = [];
  for (const pageNumber of [...byPage.keys()].sort((a, b) => a - b)) {
    const lines = byPage.get(pageNumber)!.slice().sort((a, b) => {
      const at = a.Geometry?.BoundingBox?.Top ?? 0;
      const bt = b.Geometry?.BoundingBox?.Top ?? 0;
      if (Math.abs(at - bt) > 0.005) return at - bt;
      return (a.Geometry?.BoundingBox?.Left ?? 0) - (b.Geometry?.BoundingBox?.Left ?? 0);
    });

    const spans: OcrSpanDraft[] = [];
    let offset = 0;
    lines.forEach((line, index) => {
      const text = line.Text ?? '';
      const box = line.Geometry?.BoundingBox ?? {};
      spans.push({
        granularity: 'line',
        index,
        text,
        charStart: offset,
        charEnd: offset + text.length,
        bbox: {
          x: box.Left ?? 0,
          y: box.Top ?? 0,
          w: box.Width ?? 0,
          h: box.Height ?? 0,
        },
        confidence: typeof line.Confidence === 'number' ? line.Confidence / 100 : undefined,
      });
      offset += text.length + 1;
    });

    pages.push({
      pageNumber,
      widthPx: null,
      heightPx: null,
      plainText: lines.map((l) => l.Text ?? '').join('\n'),
      spans,
      engine: options.engine,
      engineVersion: options.engineVersion,
    });
  }
  return pages;
}
