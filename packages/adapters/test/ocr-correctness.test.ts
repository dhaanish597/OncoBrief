import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { LocalMultimodalOcrAdapter } from '../src/local-multimodal-ocr';
import { SarvamVisionOcrAdapter } from '../src/sarvam-vision-ocr';
import { createOcrAdapter } from '../src/ocr-routing';
import { buildSyntheticPdf } from '../../../apps/worker/src/fixture-pdf';
import {
  decodePngPixelsToGrayscale,
  renderTextToRasterPng,
} from '../src/raster-pixel-ocr';

describe('LocalMultimodalOcrAdapter — TASK-006 Genuine Pixel OCR Correctness', () => {
  const adapter = new LocalMultimodalOcrAdapter();

  it('emits integer page dimensions for fractional A4 media boxes without changing source text', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595.28, 841.89]).drawText('Synthetic source. Hemoglobin: 11.2 g/dL');
    const pages = await adapter.extractDocument({ documentId: 'synthetic-a4', bytes: Buffer.from(await pdf.save({ useObjectStreams: false })), mimeType: 'application/pdf' });
    expect(pages[0]!.widthPx).toBe(595);
    expect(pages[0]!.heightPx).toBe(842);
    expect(pages[0]!.plainText).toContain('Hemoglobin: 11.2 g/dL');
  });

  it('performs genuine pixel-based OCR on a rasterized PNG with ZERO embedded text metadata chunks', async () => {
    const sourceLines = [
      'LABORATORY REPORT',
      'Hemoglobin: 11.4 g/dL',
      'Platelets: 185000 /uL',
    ];
    const rasterPng = renderTextToRasterPng(sourceLines, { scale: 3 });

    // Prove the PNG contains ONLY IHDR, IDAT (compressed pixels), and IEND — zero tEXt/zTXt/iTXt metadata
    const rawLatin1 = rasterPng.toString('latin1');
    expect(rawLatin1).not.toContain('tEXt');
    expect(rawLatin1).not.toContain('zTXt');
    expect(rawLatin1).not.toContain('iTXt');
    expect(rawLatin1).not.toContain('Hemoglobin');
    expect(rawLatin1).not.toContain('Platelets');

    // Verify grayscale pixel decoding works directly on the IDAT scanlines
    const decoded = decodePngPixelsToGrayscale(rasterPng);
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBeGreaterThan(200);
    expect(decoded!.height).toBeGreaterThan(80);

    // Run LocalMultimodalOcrAdapter on the pixel-only PNG
    const result = await adapter.extract({
      documentId: 'doc-pixel-only-png',
      pageNumber: 1,
      imageBytes: rasterPng,
    });

    expect(result.plainText).toContain('LABORATORY REPORT');
    expect(result.plainText).toContain('Hemoglobin: 11.4 g/dL');
    expect(result.plainText).toContain('Platelets: 185000 /uL');
    expect(result.spans).toHaveLength(3);

    // Verify bounding boxes are computed from actual pixel coordinates in [0, 1] and ordered top-to-bottom
    expect(result.spans[0]!.bbox.y).toBeLessThan(result.spans[1]!.bbox.y);
    expect(result.spans[1]!.bbox.y).toBeLessThan(result.spans[2]!.bbox.y);

    for (const span of result.spans) {
      expect(result.plainText.slice(span.charStart, span.charEnd)).toBe(span.text);
      expect(span.bbox.x).toBeGreaterThanOrEqual(0);
      expect(span.bbox.y).toBeGreaterThanOrEqual(0);
      expect(span.bbox.w).toBeGreaterThan(0);
      expect(span.bbox.h).toBeGreaterThan(0);
      expect(span.bbox.x + span.bbox.w).toBeLessThanOrEqual(1);
      expect(span.bbox.y + span.bbox.h).toBeLessThanOrEqual(1);
    }
  });

  it('recognizes oncology histopathology receptor lines from pixel-only PNG bitmaps', async () => {
    const rasterPng = renderTextToRasterPng(
      [
        'HISTOPATHOLOGY REPORT',
        'ER: Positive (8/8)',
        'HER2: Negative (1+)',
      ],
      { scale: 2 },
    );

    const result = await adapter.extract({
      documentId: 'doc-pixel-histo',
      pageNumber: 1,
      imageBytes: rasterPng,
    });

    expect(result.plainText).toContain('HISTOPATHOLOGY REPORT');
    expect(result.plainText).toContain('ER: Positive (8/8)');
    expect(result.plainText).toContain('HER2: Negative (1+)');
    expect(result.spans).toHaveLength(3);
  });

  it('throws ocr_manual_transcription_required in extractDocument when a blank raster image has zero dark ink pixels', async () => {
    const blankPng = renderTextToRasterPng(['   '], { scale: 2 });

    await expect(
      adapter.extractDocument({
        documentId: 'doc-blank-raster',
        bytes: blankPng,
        mimeType: 'image/png',
        filename: 'blank_scan.png',
      }),
    ).rejects.toThrow('ocr_manual_transcription_required');
  });
});

describe('SarvamVisionOcrAdapter — TASK-02.01 Contract & Fallback Correctness', () => {
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
                        ocr_confidence: 0.95,
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
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.plainText).toBe('Bring previous imaging CD');
    expect(result.pages[0]?.spans[0]?.confidence).toBe(0.95);
    expect(calls[0]).toContain('/doc-ai/v1/job/digitise');
  });

  it('supports both documents[0].pages and top-level result.pages schema in getResults()', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fetchImpl: async (url, init) => {
        if (init?.method === 'POST') {
          return Response.json({ job_id: 'job-top-level', status: 'pending' });
        }
        if (String(url).endsWith('/status')) {
          return Response.json({ status: 'completed' });
        }
        // Top-level pages schema (documented Sarvam Document AI variant)
        return Response.json({
          status: 'completed',
          pages: [
            {
              page_number: 1,
              content: JSON.stringify({
                width: 800,
                height: 1200,
                blocks: [
                  {
                    text: 'Top level page text',
                    bbox: [50, 100, 750, 200],
                    ocr_confidence: 0.92,
                  },
                ],
              }),
            },
          ],
        });
      },
    });

    const result = await adapter.processDocument(
      buildSyntheticPdf([['Top level']]),
      'application/pdf',
    );
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.plainText).toBe('Top level page text');
  });

  it('strict error propagation when fallbackOnError is false (driver="sarvam")', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fallbackOnError: false, // Default / explicit sarvam mode
      fetchImpl: async (_url, init) => {
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
        }
        return Response.json({ status: 'failed' });
      },
    });

    // When fallbackOnError is false, failure MUST throw and NOT silently return local OCR!
    await expect(
      adapter.extractDocument({
        documentId: 'doc-fail',
        bytes: buildSyntheticPdf([['Strict Sarvam Document']]),
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('ocr_sarvam_http_500');
  });

  it('automatic fallback to LocalMultimodalOcrAdapter when fallbackOnError is true (driver="auto")', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fallbackOnError: true, // auto driver mode
      fetchImpl: async (_url, init) => {
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ error: 'Service Unavailable' }), { status: 503 });
        }
        return Response.json({ status: 'failed' });
      },
    });

    // When fallbackOnError is true, failure delegates cleanly to LocalMultimodalOcrAdapter
    const pages = await adapter.extractDocument({
      documentId: 'doc-auto-fallback',
      bytes: buildSyntheticPdf([['Local Multimodal Fallback Text']]),
      mimeType: 'application/pdf',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.plainText).toContain('Local Multimodal Fallback Text');
  });

  it('createOcrAdapter configures fallbackOnError correctly based on driver', async () => {
    const sarvamAdapter = createOcrAdapter({
      driver: 'sarvam',
      sarvam: {
        apiKey: 'test-key',
        minIntervalMs: 0,
        fetchImpl: async () => new Response('error', { status: 500 }),
      },
    });

    // driver: 'sarvam' MUST NOT fall back
    await expect(
      sarvamAdapter.extractDocument!({
        documentId: 'doc',
        bytes: buildSyntheticPdf([['Test']]),
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow();

    const autoAdapter = createOcrAdapter({
      driver: 'auto',
      sarvam: {
        apiKey: 'test-key',
        minIntervalMs: 0,
        fetchImpl: async () => new Response('error', { status: 500 }),
      },
    });

    // driver: 'auto' MUST fall back cleanly
    const autoPages = await autoAdapter.extractDocument!({
      documentId: 'doc',
      bytes: buildSyntheticPdf([['Auto Fallback Text']]),
      mimeType: 'application/pdf',
    });
    expect(autoPages).toHaveLength(1);
    expect(autoPages[0]?.plainText).toContain('Auto Fallback Text');
  });

  it('handles Sarvam Digitise results returning signed download_url pointing to JSON', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test-key',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fetchImpl: async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/digitise')) {
          return Response.json({ job_id: 'job-download-json' });
        }
        if (urlStr.includes('/status')) {
          return Response.json({ status: 'completed' });
        }
        if (urlStr.includes('/results')) {
          return Response.json({
            job_id: 'job-download-json',
            status: 'completed',
            download_url: 'https://sarvam-storage.example/signed/output.json',
          });
        }
        if (urlStr.includes('sarvam-storage.example/signed/output.json')) {
          return Response.json({
            pages: [
              {
                page_number: 1,
                width: 1000,
                height: 1400,
                blocks: [
                  {
                    text: 'Sarvam Download URL Content',
                    bbox: [100, 200, 500, 300],
                    reading_order: 1,
                    ocr_confidence: 0.95,
                  },
                ],
              },
            ],
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const pages = await adapter.extractDocument({
      documentId: 'doc-download-json',
      bytes: buildSyntheticPdf([['Source Page']]),
      mimeType: 'application/pdf',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.plainText).toBe('Sarvam Download URL Content');
    expect(pages[0]?.spans[0]?.confidence).toBe(0.95);
    expect(pages[0]?.spans[0]?.bbox.x).toBe(0.1);
  });

  it('handles Sarvam Digitise results returning signed download_url pointing to ZIP archive', async () => {
    const zlib = await import('node:zlib');

    // Build a deflated ZIP archive containing output.json
    const jsonPayload = Buffer.from(
      JSON.stringify({
        documents: [
          {
            pages: [
              {
                page_number: 1,
                width: 800,
                height: 1000,
                blocks: [
                  {
                    text: 'Extracted from Deflated Sarvam ZIP',
                    bbox: [0.1, 0.2, 0.6, 0.3],
                    reading_order: 0,
                    ocr_confidence: 0.98,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const deflated = zlib.deflateRawSync(jsonPayload);
    const fileName = Buffer.from('output.json');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8); // compression: 8 (deflate)
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14); // crc32
    localHeader.writeUInt32LE(deflated.length, 18);
    localHeader.writeUInt32LE(jsonPayload.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);
    const zipArchiveBuffer = Buffer.concat([localHeader, fileName, deflated]);

    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test-key',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fetchImpl: async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/digitise')) {
          return Response.json({ job_id: 'job-download-zip' });
        }
        if (urlStr.includes('/status')) {
          return Response.json({ status: 'completed' });
        }
        if (urlStr.includes('/results')) {
          return Response.json({
            job_id: 'job-download-zip',
            status: 'completed',
            download_url: 'https://sarvam-storage.example/signed/output.zip',
          });
        }
        if (urlStr.includes('sarvam-storage.example/signed/output.zip')) {
          return new Response(zipArchiveBuffer, {
            headers: { 'content-type': 'application/zip' },
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const pages = await adapter.extractDocument({
      documentId: 'doc-download-zip',
      bytes: buildSyntheticPdf([['Source Page']]),
      mimeType: 'application/pdf',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.plainText).toBe('Extracted from Deflated Sarvam ZIP');
    expect(pages[0]?.spans[0]?.confidence).toBe(0.98);
  });

  it('PH06-REG-001: handles live Sarvam Document AI API response structure (page_num, image_width/height, bbox_norm, coordinates)', async () => {
    const adapter = new SarvamVisionOcrAdapter({
      apiKey: 'test-key',
      minIntervalMs: 0,
      pollIntervalMs: 0,
      fetchImpl: async (url, init) => {
        const urlStr = String(url);
        if (init?.method === 'POST') {
          return Response.json({ job_id: 'job-live-schema', status: 'pending' });
        }
        if (urlStr.endsWith('/status')) {
          return Response.json({ status: 'completed' });
        }
        return Response.json({
          job_id: 'job-live-schema',
          type: 'digitise',
          status: 'completed',
          documents: [
            {
              filename: 'synthetic_onco.pdf',
              page_count: 1,
              status: 'completed',
              language: 'en-IN',
              pages: [
                {
                  page_num: 1, // Live API uses page_num, not page_number
                  status: 'completed',
                  image_width: 2500, // Live API uses image_width, not width
                  image_height: 3334, // Live API uses image_height, not height
                  blocks: [
                    {
                      block_id: 'p1-b1',
                      text: 'REGIONAL CANCER CENTRE - OUTPATIENT RECORD',
                      layout_tag: 'headline',
                      reading_order: 1,
                      coordinates: {
                        x1: 200,
                        y1: 156,
                        x2: 1724,
                        y2: 220,
                      },
                      bbox_norm: [
                        0.08,
                        0.04679,
                        0.6896,
                        0.06598,
                      ], // [x0, y0, x1, y1] normalized
                    },
                    {
                      block_id: 'p1-b2',
                      text: 'Haemoglobin 12.4 g/dL 12.0 - 15.5 g/dL',
                      layout_tag: 'paragraph',
                      reading_order: 2,
                      coordinates: {
                        x1: 200,
                        y1: 960,
                        x2: 1031,
                        y2: 1014,
                      },
                      bbox_norm: [
                        0.08,
                        0.28794,
                        0.4124,
                        0.30413,
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        });
      },
    });

    const pages = await adapter.extractDocument({
      documentId: 'doc-live-schema-test',
      bytes: buildSyntheticPdf([['Source Page']]),
      mimeType: 'application/pdf',
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]?.pageNumber).toBe(1);
    expect(pages[0]?.plainText).toContain('REGIONAL CANCER CENTRE');
    expect(pages[0]?.plainText).toContain('Haemoglobin 12.4 g/dL');
    expect(pages[0]?.spans).toHaveLength(2);
    expect(pages[0]?.spans[0]?.bbox.x).toBeCloseTo(0.08, 2);
    expect(pages[0]?.spans[0]?.bbox.w).toBeCloseTo(0.6896 - 0.08, 2);
  });
});
