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
