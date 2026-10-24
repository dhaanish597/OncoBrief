import { PDFDocument } from 'pdf-lib';
import type {
  AsyncOcrPort,
  AsyncOcrStartInput,
  AsyncOcrJob,
  AsyncOcrStatus,
  AsyncOcrPageResult,
  OcrPort,
  OcrPageInput,
  OcrPageResult,
  OcrDocumentInput,
  OcrSpanDraft,
} from '@oncobrief/ports';

export interface SarvamVisionConfig {
  apiKey?: string;
  baseUrl?: string;
  language?: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  timeoutMs?: number;
}
type Json = Record<string, unknown>;
interface Batch {
  id: string;
  offset: number;
  count: number;
}
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sarvam Document AI job API. Provider job IDs are persisted in the envelope,
 * so a restarted worker can poll without an in-memory result store. */
export class SarvamVisionOcrAdapter implements AsyncOcrPort, OcrPort {
  readonly name = 'sarvam-vision';
  readonly version = 'doc-ai-v1';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private lastRequestTime = 0;
  constructor(private readonly config: SarvamVisionConfig = {}) {
    this.apiKey = config.apiKey ?? process.env['SARVAM_API_KEY'] ?? '';
    this.baseUrl = (
      config.baseUrl ??
      process.env['SARVAM_BASE_URL'] ??
      'https://api.sarvam.ai'
    ).replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }
  transcodeIfNeeded(
    data: Buffer,
    mimeType: string,
  ): { data: Buffer; mimeType: string; filename: string } {
    // Unsupported images must be decoded by a real image codec, never relabelled.
    const types: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
    };
    const extension = types[mimeType];
    if (!extension) throw new Error('ocr_unsupported_media');
    return { data, mimeType, filename: `document.${extension}` };
  }
  async countPdfPages(buffer: Buffer): Promise<number> {
    return (await PDFDocument.load(buffer)).getPageCount();
  }
  async splitPdfIntoBatches(
    buffer: Buffer,
    _totalPages?: number,
  ): Promise<Buffer[]> {
    const source = await PDFDocument.load(buffer);
    if (source.getPageCount() <= 10) return [buffer];
    const batches: Buffer[] = [];
    for (let start = 0; start < source.getPageCount(); start += 10) {
      const batch = await PDFDocument.create();
      const indices = Array.from(
        { length: Math.min(10, source.getPageCount() - start) },
        (_, i) => start + i,
      );
      for (const page of await batch.copyPages(source, indices))
        batch.addPage(page);
      batches.push(Buffer.from(await batch.save({ useObjectStreams: false })));
    }
    return batches;
  }
  private async request(path: string, init?: RequestInit): Promise<Json> {
    if (!this.apiKey) throw new Error('ocr_missing_sarvam_api_key');
    for (let retry = 0; retry <= 3; retry++) {
      const interval = this.config.minIntervalMs ?? 6000;
      await delay(Math.max(0, interval - (Date.now() - this.lastRequestTime)));
      this.lastRequestTime = Date.now();
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'api-subscription-key': this.apiKey },
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
      });
      if ((response.status === 429 || response.status === 503) && retry < 3) {
        await delay(1000 * 2 ** retry);
        continue;
      }
      // Response bodies can contain sensitive source text; keep error codes only.
      if (!response.ok) throw new Error(`ocr_sarvam_http_${response.status}`);
      return (await response.json()) as Json;
    }
    throw new Error('ocr_sarvam_unavailable');
  }
  private batches(job: string): Batch[] {
    if (!job.startsWith('sarvam:')) throw new Error('ocr_invalid_sarvam_job');
    return JSON.parse(
      Buffer.from(job.slice(7), 'base64url').toString('utf8'),
    ) as Batch[];
  }
  async startDocumentAnalysis(input: AsyncOcrStartInput): Promise<AsyncOcrJob> {
    if (!input.bytes?.length) throw new Error('ocr_document_bytes_required');
    const media = this.transcodeIfNeeded(
      input.bytes,
      input.mimeType ?? 'application/pdf',
    );
    const buffers =
      media.mimeType === 'application/pdf'
        ? await this.splitPdfIntoBatches(media.data)
        : [media.data];
    const batches: Batch[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const data = buffers[i]!;
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(data)], { type: media.mimeType }),
        media.filename,
      );
      form.append(
        'language',
        input.language ?? this.config.language ?? 'en-IN',
      );
      form.append('output_format', 'json');
      const result = await this.request('/doc-ai/v1/job/digitise', {
        method: 'POST',
        body: form,
      });
      if (typeof result['job_id'] !== 'string')
        throw new Error('ocr_sarvam_missing_job_id');
      batches.push({
        id: result['job_id'],
        offset: i * 10,
        count:
          media.mimeType === 'application/pdf'
            ? await this.countPdfPages(data)
            : 1,
      });
    }
    return {
      providerJobId: `sarvam:${Buffer.from(JSON.stringify(batches)).toString('base64url')}`,
    };
  }
  async getJob(job: string): Promise<AsyncOcrStatus> {
    let pending = false;
    for (const batch of this.batches(job)) {
      const result = await this.request(
        `/doc-ai/v1/job/${encodeURIComponent(batch.id)}/status`,
      );
      const status = result['status'];
      if (
        status === 'failed' ||
        status === 'rejected' ||
        status === 'partially_completed'
      )
        return { status: 'FAILED', statusMessage: 'ocr_sarvam_incomplete' };
      if (status !== 'completed') pending = true;
    }
    return { status: pending ? 'IN_PROGRESS' : 'SUCCEEDED' };
  }
  async getResults(
    job: string,
  ): Promise<{ pages: AsyncOcrPageResult[]; raw: unknown }> {
    const pages: AsyncOcrPageResult[] = [];
    const raw: unknown[] = [];
    for (const batch of this.batches(job)) {
      const result = await this.request(
        `/doc-ai/v1/job/${encodeURIComponent(batch.id)}/results?format=json`,
      );
      if (result['status'] !== 'completed')
        throw new Error('ocr_sarvam_incomplete');
      raw.push(result);
      const documents = result['documents'] as
        Array<{ pages?: Json[] }> | undefined;
      if (!Array.isArray(documents) || documents.length !== 1)
        throw new Error('ocr_sarvam_invalid_results');
      const sourcePages = documents[0]?.pages;
      if (!sourcePages || sourcePages.length !== batch.count)
        throw new Error('ocr_sarvam_page_count_mismatch');
      const seen = new Set<number>();
      for (const page of sourcePages) {
        const local = Number(page['page_number']);
        if (
          !Number.isInteger(local) ||
          local < 1 ||
          local > batch.count ||
          seen.has(local)
        )
          throw new Error('ocr_sarvam_invalid_page_number');
        seen.add(local);
        let content: Json = page;
        if (typeof page['content'] === 'string') {
          try {
            content = { ...page, ...(JSON.parse(page['content']) as Json) };
          } catch {
            throw new Error('ocr_sarvam_missing_layout');
          }
        }
        pages.push(
          normalizePage(content, batch.offset + local, this.name, this.version),
        );
      }
    }
    return { pages: pages.sort((a, b) => a.pageNumber - b.pageNumber), raw };
  }
  async processDocument(
    buffer: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<{ pages: AsyncOcrPageResult[]; raw: unknown }> {
    const { providerJobId } = await this.startDocumentAnalysis({
      documentId: 'direct',
      orgId: '',
      s3Key: '',
      s3Bucket: '',
      correlationId: '',
      bytes: buffer,
      mimeType,
      language,
    });
    for (let poll = 0; poll < (this.config.maxPolls ?? 40); poll++) {
      const status = await this.getJob(providerJobId);
      if (status.status === 'FAILED')
        throw new Error(status.statusMessage ?? 'ocr_sarvam_failed');
      if (status.status === 'SUCCEEDED') return this.getResults(providerJobId);
      await delay(this.config.pollIntervalMs ?? 1500);
    }
    throw new Error('ocr_sarvam_timeout');
  }
  async extractDocument(
    input: OcrDocumentInput,
  ): Promise<AsyncOcrPageResult[]> {
    return (
      await this.processDocument(input.bytes, input.mimeType, input.language)
    ).pages;
  }
  async extract(page: OcrPageInput): Promise<OcrPageResult> {
    if (page.fixture)
      return {
        ...page.fixture,
        engine: this.name,
        engineVersion: this.version,
      };
    if (!page.imageBytes?.length)
      throw new Error('ocr_document_bytes_required');
    const mime =
      page.imageBytes.subarray(0, 5).toString('ascii') === '%PDF-'
        ? 'application/pdf'
        : page.imageBytes[0] === 0xff
          ? 'image/jpeg'
          : 'image/png';
    const result = await this.processDocument(page.imageBytes, mime);
    const match = result.pages.find((p) => p.pageNumber === page.pageNumber);
    if (!match) throw new Error('ocr_page_not_found');
    return match;
  }
}

function normalizePage(
  page: Json,
  pageNumber: number,
  engine: string,
  engineVersion: string,
): AsyncOcrPageResult {
  const width = Number(page['width']);
  const height = Number(page['height']);
  const blocks = page['blocks'];
  if (!Array.isArray(blocks)) throw new Error('ocr_sarvam_missing_layout');
  const spans: OcrSpanDraft[] = [];
  let offset = 0;
  for (const block of [...blocks].sort(
    (a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0),
  )) {
    const text = typeof block.text === 'string' ? block.text : '';
    if (!text.trim()) continue;
    const coords = block.bbox;
    if (
      !Array.isArray(coords) ||
      coords.length !== 4 ||
      coords.some((v) => typeof v !== 'number' || !Number.isFinite(v))
    )
      throw new Error('ocr_sarvam_invalid_bbox');
    const [x0, y0, x1, y1] = coords as [number, number, number, number];
    const normalized = coords.every((v) => v >= 0 && v <= 1);
    if (!normalized && (!(width > 0) || !(height > 0)))
      throw new Error('ocr_sarvam_missing_dimensions');
    const bbox = {
      x: x0 / (normalized ? 1 : width),
      y: y0 / (normalized ? 1 : height),
      w: (x1 - x0) / (normalized ? 1 : width),
      h: (y1 - y0) / (normalized ? 1 : height),
    };
    if (
      bbox.x < 0 ||
      bbox.y < 0 ||
      bbox.w <= 0 ||
      bbox.h <= 0 ||
      bbox.x + bbox.w > 1.001 ||
      bbox.y + bbox.h > 1.001
    )
      throw new Error('ocr_sarvam_invalid_bbox');
    spans.push({
      granularity: 'block',
      index: spans.length,
      text,
      charStart: offset,
      charEnd: offset + text.length,
      bbox,
      confidence:
        typeof block.ocr_confidence === 'number'
          ? block.ocr_confidence
          : undefined,
    });
    offset += text.length + 1;
  }
  return {
    pageNumber,
    widthPx: width > 0 ? width : null,
    heightPx: height > 0 ? height : null,
    plainText: spans.map((s) => s.text).join('\n'),
    spans,
    engine,
    engineVersion,
  };
}
