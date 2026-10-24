import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { LocalMultimodalOcrAdapter } from '../src/local-multimodal-ocr';
import { SarvamVisionOcrAdapter } from '../src/sarvam-vision-ocr';
import { buildSyntheticPdf } from '../../../apps/worker/src/fixture-pdf';

describe('OCR correctness', () => {
  it('never calls image metadata extracted document text', async () => {
    const result = await new LocalMultimodalOcrAdapter().extract({
      documentId: 'doc',
      pageNumber: 1,
      imageBytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    expect(result.plainText).toBe('');
    expect(result.spans).toEqual([]);
  });
  it('missing bytes cannot fabricate text', async () => {
    const result = await new LocalMultimodalOcrAdapter().extract({
      documentId: 'doc',
      pageNumber: 1,
      imageBytes: null,
    });
    expect(result.plainText).toBe('');
  });
  it('splits real 23-page PDF preserving original page content and ordering', async () => {
    const original = buildSyntheticPdf(
      Array.from({ length: 23 }, (_, i) => [`Administrative source ${i + 1}`]),
    );
    const adapter = new SarvamVisionOcrAdapter();
    const chunks = await adapter.splitPdfIntoBatches(original, 23);
    expect(chunks).toHaveLength(3);
    const local = new LocalMultimodalOcrAdapter();
    let page = 1;
    for (const chunk of chunks) {
      const pdf = await PDFDocument.load(chunk);
      for (let i = 1; i <= pdf.getPageCount(); i++) {
        const result = await local.extract({
          documentId: 'doc',
          pageNumber: i,
          imageBytes: chunk,
        });
        expect(result.plainText).toContain(`Administrative source ${page++}`);
      }
    }
    expect(page).toBe(24);
  });
  it('rejects unsupported TIFF instead of corrupting its bytes into fake PNG', () => {
    expect(() =>
      new SarvamVisionOcrAdapter().transcodeIfNeeded(
        Buffer.from('II*\u0000'),
        'image/tiff',
      ),
    ).toThrow('ocr_unsupported_media');
  });
  it('uses real provider job lifecycle, dynamic language and exact normalized source spans', async () => {
    const calls: string[] = [];
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        if (init?.method === 'POST') {
          expect((init.body as FormData).get('language')).toBe('ta-IN');
          return Response.json({ job_id: 'job-1', status: 'pending' });
        }
        if (String(url).endsWith('/status'))
          return Response.json({ status: 'completed' });
        return Response.json({
          status: 'completed',
          documents: [
            {
              pages: [
                {
                  page_number: 1,
                  content: JSON.stringify({
                    width: 1000,
                    height: 2000,
                    blocks: [
                      {
                        text: 'Bring previous imaging CD',
                        bbox: [100, 200, 900, 300],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        });
      },
    });
    const result = await adapter.processDocument(
      buildSyntheticPdf([['Source']]),
      'application/pdf',
      'ta-IN',
    );
    expect(calls[0]).toContain('/doc-ai/v1/job/digitise');
    expect(result.pages[0]?.spans[0]?.text).toBe('Bring previous imaging CD');
    expect(result.pages[0]?.spans[0]?.bbox).toEqual({
      x: 0.1,
      y: 0.1,
      w: 0.8,
      h: 0.05,
    });
  });
});

describe('configured OCR routing', () => {
  it('routes explicit drivers and prioritizes configured Sarvam over Textract in auto', async () => {
    const { createOcrAdapter } = await import('../src/ocr-routing');
    expect(
      createOcrAdapter({ driver: 'auto', sarvam: { apiKey: 'test' } }).name,
    ).toBe('sarvam-vision');
    expect(
      createOcrAdapter({ driver: 'local-pdf', sarvam: { apiKey: 'test' } })
        .name,
    ).toBe('local-multimodal');
    expect(createOcrAdapter({ driver: 'auto' }).name).toBe('local-multimodal');
    expect(
      createOcrAdapter({
        driver: 'textract',
        textract: {
          region: 'test',
          credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
        },
      }).name,
    ).toBe('textract');
    expect(() => createOcrAdapter({ driver: 'textract' })).toThrow(
      'ocr_missing_textract_configuration',
    );
    expect(() => createOcrAdapter({ driver: 'sarvam' })).toThrow(
      'ocr_missing_sarvam_api_key',
    );
  });
  it('local document extraction keeps empty pages and original dimensions in correct positions', async () => {
    const pages = await new LocalMultimodalOcrAdapter().extractDocument({
      documentId: 'doc',
      mimeType: 'application/pdf',
      bytes: buildSyntheticPdf([['First source'], [], ['Third source']]),
    });
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(pages[0]?.plainText).toContain('First source');
    expect(pages[1]?.plainText).toBe('');
    expect(pages[2]?.plainText).toContain('Third source');
    expect(pages[2]?.widthPx).toBe(612);
  });
});

describe('external OCR failure boundaries', () => {
  it('rejects partial provider success and never promotes missing pages', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      fetchImpl: async (_url, init) =>
        Response.json(
          init?.method === 'POST'
            ? { job_id: 'j' }
            : { status: 'partially_completed' },
        ),
    });
    await expect(
      adapter.processDocument(
        buildSyntheticPdf([['First'], ['Second']]),
        'application/pdf',
      ),
    ).rejects.toThrow('ocr_sarvam_incomplete');
  });
  it('reports provider failure without copying response source text into error', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      fetchImpl: async () =>
        new Response('PRIVATE SOURCE TEXT', { status: 403 }),
    });
    await expect(
      adapter.processDocument(
        buildSyntheticPdf([['Source']]),
        'application/pdf',
      ),
    ).rejects.toThrow(/^ocr_sarvam_http_403$/);
  });
  it('reports bounded timeout while a provider never completes', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      maxPolls: 2,
      fetchImpl: async (_url, init) =>
        Response.json(
          init?.method === 'POST' ? { job_id: 'j' } : { status: 'running' },
        ),
    });
    await expect(
      adapter.processDocument(
        buildSyntheticPdf([['Source']]),
        'application/pdf',
      ),
    ).rejects.toThrow('ocr_sarvam_timeout');
  });
  it('Textract handles real image bytes using AnalyzeDocument', async () => {
    const { TextractOcrAdapter } = await import('../src/textract-ocr');
    const adapter = new TextractOcrAdapter({
      region: 'ap-south-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.Document.Bytes).toBe(
          Buffer.from('image-source').toString('base64'),
        );
        return Response.json({
          Blocks: [
            {
              BlockType: 'LINE',
              Page: 1,
              Text: 'Bring prior records',
              Geometry: {
                BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.5, Height: 0.1 },
              },
            },
          ],
        });
      },
    });
    const pages = await adapter.extractDocument({
      documentId: 'doc',
      bytes: Buffer.from('image-source'),
      mimeType: 'image/png',
    });
    expect(pages[0]?.plainText).toBe('Bring prior records');
    expect(pages[0]?.spans[0]?.bbox).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.5,
      h: 0.1,
    });
  });
});

it('submits all 23 original pages once and resumes Sarvam batches with stable global provenance', async () => {
  const submitted: Buffer[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    if (init?.method === 'POST') {
      const file = (init.body as FormData).get('file') as File;
      submitted.push(Buffer.from(await file.arrayBuffer()));
      return Response.json({ job_id: `batch-${submitted.length}` });
    }
    if (String(url).endsWith('/status'))
      return Response.json({ status: 'completed' });
    const id = Number(String(url).match(/batch-(\d+)/)?.[1]);
    const local = await new LocalMultimodalOcrAdapter().extractDocument({
      documentId: 'doc',
      bytes: submitted[id - 1]!,
      mimeType: 'application/pdf',
    });
    return Response.json({
      status: 'completed',
      documents: [
        {
          pages: local.map((p) => ({
            page_number: p.pageNumber,
            content: JSON.stringify({
              blocks: p.spans.map((s) => ({
                text: s.text,
                bbox: [
                  s.bbox.x,
                  s.bbox.y,
                  s.bbox.x + s.bbox.w,
                  s.bbox.y + s.bbox.h,
                ],
              })),
            }),
          })),
        },
      ],
    });
  };
  const adapter = new SarvamVisionOcrAdapter({
    apiKey: 'test',
    minIntervalMs: 0,
    fetchImpl: fakeFetch,
  });
  const { providerJobId } = await adapter.startDocumentAnalysis({
    documentId: 'doc',
    orgId: 'org',
    s3Key: 'source',
    s3Bucket: 'bucket',
    correlationId: 'trace',
    mimeType: 'application/pdf',
    bytes: buildSyntheticPdf(
      Array.from({ length: 23 }, (_, i) => [`Original page ${i + 1}`]),
    ),
  });
  expect(submitted).toHaveLength(3);
  const restarted = new SarvamVisionOcrAdapter({
    apiKey: 'test',
    minIntervalMs: 0,
    fetchImpl: fakeFetch,
  });
  expect((await restarted.getJob(providerJobId)).status).toBe('SUCCEEDED');
  const { pages } = await restarted.getResults(providerJobId);
  expect(pages).toHaveLength(23);
  for (let i = 0; i < 23; i++) {
    expect(pages[i]?.pageNumber).toBe(i + 1);
    expect(pages[i]?.plainText).toBe(`Original page ${i + 1}`);
    expect(pages[i]?.spans[0]?.charStart).toBe(0);
    expect(pages[i]?.spans[0]?.charEnd).toBe(`Original page ${i + 1}`.length);
  }
});

it('Textract processes filesystem multipage PDF through real single-page inputs', async () => {
  const { TextractOcrAdapter } = await import('../src/textract-ocr');
  const submitted: string[] = [];
  const adapter = new TextractOcrAdapter({
    region: 'ap-south-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    fetchImpl: async (_url, init) => {
      const bytes = Buffer.from(
        JSON.parse(init!.body as string).Document.Bytes,
        'base64',
      );
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
      const text = (
        await new LocalMultimodalOcrAdapter().extractDocument({
          documentId: 'doc',
          bytes,
          mimeType: 'application/pdf',
        })
      )[0]!.plainText;
      submitted.push(text);
      return Response.json({
        Blocks: text ? [{ BlockType: 'LINE', Page: 1, Text: text }] : [],
      });
    },
  });
  const pages = await adapter.extractDocument({
    documentId: 'doc',
    bytes: buildSyntheticPdf([['First'], [], ['Third']]),
    mimeType: 'application/pdf',
  });
  expect(submitted).toEqual(['First', '', 'Third']);
  expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  expect(pages[1]?.spans).toEqual([]);
});

it('preserves blank pages represented by Textract PAGE blocks', async () => {
  const { normalizeTextractBlocks } = await import('../src/textract-ocr');
  const pages = normalizeTextractBlocks(
    [
      { BlockType: 'PAGE', Page: 1 },
      { BlockType: 'PAGE', Page: 2 },
      { BlockType: 'LINE', Page: 2, Text: 'Second page' },
    ],
    { engine: 'textract', engineVersion: 'test' },
  );
  expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
  expect(pages[0]?.plainText).toBe('');
  expect(pages[0]?.spans).toEqual([]);
});

describe('mixed PDF source completeness', () => {
  it('requires transcription when a text PDF contains an unreadable scanned page', async () => {
    const pdf = await PDFDocument.load(
      buildSyntheticPdf([['First source'], []]),
    );
    const png = await pdf.embedPng(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWOQAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    pdf.getPage(1).drawImage(png, { x: 0, y: 0, width: 300, height: 300 });
    const bytes = Buffer.from(await pdf.save());
    await expect(
      new LocalMultimodalOcrAdapter().extractDocument({
        documentId: 'doc',
        mimeType: 'application/pdf',
        bytes,
      }),
    ).rejects.toThrow('ocr_manual_transcription_required');
  });
});
