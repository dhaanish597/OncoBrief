import { createHash } from 'node:crypto';
import type {
  AsyncOcrJob,
  AsyncOcrPageResult,
  AsyncOcrPort,
  AsyncOcrStartInput,
  AsyncOcrStatus,
  ExtractionPort,
  OcrSpanDraft,
  StoragePort,
} from '@oncobrief/ports';

export class MemoryStorage implements StoragePort {
  objects = new Map<string, Buffer>();

  async put(key: string, body: Buffer): Promise<{ sha256: string }> {
    this.objects.set(key, body);
    return { sha256: createHash('sha256').update(body).digest('hex') };
  }
  async get(key: string): Promise<Buffer> {
    const body = this.objects.get(key);
    if (!body) throw new Error(`missing_object:${key}`);
    return body;
  }
  async presignGet(key: string): Promise<string> {
    return `mem://${key}`;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

function line(text: string, index: number, charStart: number): OcrSpanDraft {
  return {
    granularity: 'line',
    index,
    text,
    charStart,
    charEnd: charStart + text.length,
    bbox: { x: 0, y: index * 0.05, w: 1, h: 0.05 },
    confidence: 0.99,
  };
}

export class FakeAsyncOcr implements AsyncOcrPort {
  readonly name = 'fake-textract';
  readonly version = 'v1';
  status: AsyncOcrStatus['status'] = 'SUCCEEDED';
  started = 0;
  resultsCalls = 0;
  pages: AsyncOcrPageResult[] = [
    {
      pageNumber: 1,
      widthPx: null,
      heightPx: null,
      plainText: 'Pathology Report\nSpecimen received on 2026-01-05',
      spans: [line('Pathology Report', 0, 0), line('Specimen received on 2026-01-05', 1, 17)],
      engine: 'textract',
      engineVersion: 'v1',
    },
  ];
  raw: unknown = { Blocks: [{ BlockType: 'LINE', Text: 'Pathology Report' }] };

  async startDocumentAnalysis(_input: AsyncOcrStartInput): Promise<AsyncOcrJob> {
    this.started += 1;
    return { providerJobId: 'job-1' };
  }
  async getJob(_providerJobId: string): Promise<AsyncOcrStatus> {
    return { status: this.status };
  }
  async getResults(_providerJobId: string): Promise<{ pages: AsyncOcrPageResult[]; raw: unknown }> {
    this.resultsCalls += 1;
    return { pages: this.pages, raw: this.raw };
  }
}

export const stubExtractor: ExtractionPort = {
  name: 'stub',
  version: 'v1',
  async extract() {
    return [];
  },
};
