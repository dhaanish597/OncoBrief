import type { FactType, FactValue } from '@oncobrief/domain';

/**
 * Ports: interfaces only (architecture §2.3). Implementations live in
 * `packages/adapters`, so OCR, storage, extraction and delivery can be swapped
 * without touching the domain or the application services.
 */

export interface ClockPort {
  now(): Date;
}

// --- object storage --------------------------------------------------------
export interface StoragePort {
  /** Returns the content hash so the caller can persist it without re-reading. */
  put(key: string, body: Buffer, contentType: string): Promise<{ sha256: string }>;
  get(key: string): Promise<Buffer>;
  /** Short-lived, auditable read URL. Adapter-specific token format. */
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// --- OCR -------------------------------------------------------------------
export type SpanGranularity = 'word' | 'line' | 'block';

export interface OcrSpanDraft {
  granularity: SpanGranularity;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  bbox: { x: number; y: number; w: number; h: number };
  confidence?: number;
}

export interface OcrPageInput {
  documentId: string;
  pageNumber: number;
  imageBytes: Buffer | null;
  /**
   * Deterministic fixture output. Present only when the document is a demo
   * fixture or the FixtureAdapter is forced. Real adapters ignore it.
   */
  fixture?: { plainText: string; spans: OcrSpanDraft[] };
}

export interface OcrPageResult {
  plainText: string;
  spans: OcrSpanDraft[];
  engine: string;
  engineVersion: string;
}

export interface OcrPort {
  name: string;
  version: string;
  extract(page: OcrPageInput): Promise<OcrPageResult>;
}

// --- extraction ------------------------------------------------------------
export interface ExtractionSpanInput {
  id: string;
  pageId: string;
  text: string;
}

export interface ExtractionInput {
  documentId: string;
  patientId: string;
  documentType: string | null;
  documentDate: string | null;
  issuingFacility: string | null;
  pageText: string;
  spans: ExtractionSpanInput[];
  /** Optional tracing id; never contains PHI. */
  correlationId?: string;
}

export interface CandidateDraft {
  factType: FactType;
  value: FactValue;
  /** Must be an exact substring of the concatenated linked spans (§5.2). */
  verbatimQuote: string;
  spanIds: string[];
  confidenceRaw: number;
  extractorName: string;
  extractorVersion: string;
  /** The date the fact refers to, when the extractor can read one. */
  observedOn?: string | null;
}

export interface ExtractionPort {
  name: string;
  version: string;
  extract(input: ExtractionInput): Promise<CandidateDraft[]>;
}

// --- patient delivery ------------------------------------------------------
export interface RenderedMessage {
  patientMessageId: string;
  channel: 'simulated' | 'whatsapp' | 'sms' | 'ivr' | 'email';
  recipientRef: string;
  body: string;
}

export interface DeliveryResult {
  externalRef?: string;
  status: 'accepted' | 'failed';
  simulated: boolean;
}

export interface DeliveryPort {
  channel: RenderedMessage['channel'];
  send(msg: RenderedMessage): Promise<DeliveryResult>;
}

// --- presigned upload capability -------------------------------------------
/**
 * Direct-to-bucket upload, added for the cloud pipeline (Phase 2). This is a
 * *capability* separate from `StoragePort`: the default filesystem store does
 * not implement it, and the S3 adapter does. The application still owns
 * metadata, and the worker re-reads the object and computes SHA-256 and the
 * real MIME type server-side before anything reaches the ledger (ADR 0015),
 * so a client cannot forge a content hash by choosing its own bytes.
 */
export interface PresignPutResult {
  url: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface PresignPutPort {
  presignPut(
    key: string,
    contentType: string,
    ttlSeconds: number,
    contentLengthBytes?: number,
  ): Promise<PresignPutResult>;
}

// --- asynchronous OCR (Amazon Textract) ------------------------------------
export interface AsyncOcrStartInput {
  documentId: string;
  orgId: string;
  /** Tenant-prefixed key of the immutable original in object storage. */
  s3Key: string;
  s3Bucket: string;
  correlationId: string;
}

export interface AsyncOcrJob {
  /** Provider job id (Textract `JobId`). */
  providerJobId: string;
}

export interface AsyncOcrPageResult extends OcrPageResult {
  pageNumber: number;
  widthPx?: number | null;
  heightPx?: number | null;
  /** Key under which the raw provider response was retained. */
  rawKey?: string;
}

export interface AsyncOcrStatus {
  status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'PARTIAL_SUCCESS';
  statusMessage?: string;
}

export interface AsyncOcrPort {
  readonly name: string;
  readonly version: string;
  startDocumentAnalysis(input: AsyncOcrStartInput): Promise<AsyncOcrJob>;
  getJob(providerJobId: string): Promise<AsyncOcrStatus>;
  /**
   * Fetch and normalise results. `raw` is the untouched provider payload,
   * retained so extraction can be re-run and extractor versions diffed.
   */
  getResults(providerJobId: string): Promise<{ pages: AsyncOcrPageResult[]; raw: unknown }>;
}

// --- queue (SQS / local) ----------------------------------------------------
export interface QueueMessage<T = unknown> {
  id: string;
  receiptHandle: string;
  body: T;
  correlationId: string;
  receiveCount: number;
  attributes: Record<string, string>;
}

export interface ReceiveOptions {
  maxMessages?: number;
  waitSeconds?: number;
  visibilityTimeoutSeconds?: number;
}

export interface QueuePort {
  readonly name: string;
  send(queueName: string, body: unknown, options?: { correlationId?: string; delaySeconds?: number }): Promise<{ id: string }>;
  receive(queueName: string, options?: ReceiveOptions): Promise<QueueMessage[]>;
  delete(queueName: string, receiptHandle: string): Promise<void>;
  /** Release a message back to the queue after a transient failure. */
  changeVisibility(queueName: string, receiptHandle: string, timeoutSeconds: number): Promise<void>;
}

// --- LLM provider (architecture §17) ---------------------------------------
/**
 * The LLM may *propose*. It never writes to the ledger, decides a state,
 * resolves a conflict, authors a checklist requirement or interprets anything
 * medically. Every method returns structured data that the deterministic
 * promoter re-validates (span substring, fact-type allow-list, value shape)
 * before it can become evidence.
 */
export interface LlmExtractionRequest {
  documentId: string;
  patientId: string;
  documentType: string | null;
  documentDate: string | null;
  issuingFacility: string | null;
  pageText: string;
  spans: ExtractionSpanInput[];
  /** Propagated for logging only; never contains PHI. */
  correlationId: string;
}

export interface LlmExtractionFact {
  factType: string;
  value: unknown;
  verbatimQuote: string;
  spanIds: string[];
  pageNumber: number;
  confidence: number;
  date?: string | null;
}

export interface LlmExtractionResponse {
  facts: LlmExtractionFact[];
  model: string;
  extractedAt: string;
  /** Raw model items discarded by schema validation; measured, not hidden. */
  discarded: number;
}

export interface LlmPacketEvent {
  factType: string;
  valueText: string;
  state: string;
  verbatimQuote: string;
  documentName: string;
  pageNumber: number | null;
}

export interface LlmPacketRequest {
  patientId: string;
  encounterLabel: string;
  events: LlmPacketEvent[];
  missingDocuments: string[];
  openConflicts: string[];
  correlationId: string;
}

export interface LlmPacketResponse {
  /** Admin-only factual framing. No generated clinical prose. */
  sections: { heading: string; lines: string[] }[];
  model: string;
}

export interface LlmSearchRequest {
  patientId: string;
  query: string;
  correlationId: string;
  /**
   * Candidate facts retrieved deterministically by the application. The model
   * may only *select* from this list; it cannot invent a fact that is not
   * already source-anchored.
   */
  candidates: LlmSearchResult[];
}

export interface LlmSearchResult {
  factType: string;
  valueText: string;
  verbatimQuote: string;
  documentName: string;
  pageNumber: number | null;
}

export interface LlmSearchResponse {
  results: LlmSearchResult[];
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  extract_document(input: LlmExtractionRequest): Promise<LlmExtractionResponse>;
  generate_factual_packet(input: LlmPacketRequest): Promise<LlmPacketResponse>;
  search_records(input: LlmSearchRequest): Promise<LlmSearchResponse>;
}
