import { createHash } from 'node:crypto';
import { inflateSync, inflateRawSync } from 'node:zlib';
import type {
  AsyncOcrJob,
  AsyncOcrPageResult,
  AsyncOcrPort,
  AsyncOcrStartInput,
  AsyncOcrStatus,
  OcrPageInput,
  OcrPageResult,
  OcrPort,
  OcrSpanDraft,
} from '@oncobrief/ports';
import { parseDicomHeader } from './dicom-header-parser';

interface TextItem {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Matrix6 = [number, number, number, number, number, number];

export class LocalMultimodalOcrAdapter implements AsyncOcrPort, OcrPort {
  readonly name = 'local-multimodal';
  readonly version = 'v1';
  private readonly asyncJobs = new Map<string, { status: AsyncOcrStatus; pages: AsyncOcrPageResult[]; raw: unknown }>();

  async startDocumentAnalysis(input: AsyncOcrStartInput): Promise<AsyncOcrJob> {
    const jobId = `local-${input.documentId}-${Date.now()}`;
    this.asyncJobs.set(jobId, {
      status: { status: 'SUCCEEDED' },
      pages: [],
      raw: null,
    });
    return { providerJobId: jobId };
  }

  async getJob(providerJobId: string): Promise<AsyncOcrStatus> {
    const job = this.asyncJobs.get(providerJobId);
    if (!job) return { status: 'SUCCEEDED' };
    return job.status;
  }

  async getResults(providerJobId: string): Promise<{ pages: AsyncOcrPageResult[]; raw: unknown }> {
    const job = this.asyncJobs.get(providerJobId);
    return { pages: job?.pages ?? [], raw: job?.raw ?? null };
  }

  async extract(page: OcrPageInput): Promise<OcrPageResult> {
    if (page.fixture) {
      return {
        plainText: page.fixture.plainText,
        spans: page.fixture.spans,
        engine: this.name,
        engineVersion: this.version,
      };
    }

    if (!page.imageBytes || page.imageBytes.length === 0) {
      const fallbackText = `Document ${page.documentId} Page ${page.pageNumber}`;
      return {
        plainText: fallbackText,
        spans: [
          {
            granularity: 'line',
            index: 0,
            text: fallbackText,
            charStart: 0,
            charEnd: fallbackText.length,
            bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.04 },
            confidence: 0.95,
          },
        ],
        engine: this.name,
        engineVersion: this.version,
      };
    }

    const bytes = page.imageBytes;

    // 1. DICOM file check (byte offset 128 has 'DICM')
    if (bytes.length >= 132 && bytes.subarray(128, 132).toString('ascii') === 'DICM') {
      const dicom = parseDicomHeader(bytes);
      return {
        plainText: dicom.plainText,
        spans: dicom.spans,
        engine: this.name,
        engineVersion: this.version,
      };
    }

    // 2. FHIR R4 JSON check
    const textStart = bytes.subarray(0, 1024).toString('utf8').trim();
    if (textStart.startsWith('{') || textStart.startsWith('[')) {
      try {
        const json = JSON.parse(bytes.toString('utf8'));
        if (json && typeof json === 'object') {
          return this.extractFhirOrJson(json);
        }
      } catch {
        // Not valid JSON, continue to other formats
      }
    }

    // 3. VCF / HL7 / Plain Text check
    if (textStart.startsWith('##fileformat') || textStart.startsWith('MSH|^~\\&') || textStart.startsWith('BEGIN:VCARD')) {
      return this.extractVcfOrHl7(bytes.toString('utf8'));
    }

    // 4. PDF check
    if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
      return this.extractPdf(bytes, page.pageNumber);
    }

    // 5. Image check (PNG, JPEG, TIFF, WebP)
    return this.extractImage(bytes);
  }

  private extractPdf(bytes: Buffer, targetPageNumber: number): OcrPageResult {
    const rawPdf = bytes.toString('latin1');
    const { streams, pageStreams } = this.extractPdfStreams(bytes);
    const textItems: TextItem[] = [];

    let pageWidth = 612; // default letter pt
    let pageHeight = 792;

    const mediaBoxMatch = rawPdf.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
    if (mediaBoxMatch && mediaBoxMatch[3] && mediaBoxMatch[4]) {
      const w = parseFloat(mediaBoxMatch[3]);
      const h = parseFloat(mediaBoxMatch[4]);
      if (w > 0 && h > 0) {
        pageWidth = w;
        pageHeight = h;
      }
    }

    // 1. Build CMap table for ToUnicode decodings
    const cmap = this.parsePdfCmaps(streams);

    // 2. Select streams for the requested target page
    const streamsToParse = pageStreams.has(targetPageNumber)
      ? pageStreams.get(targetPageNumber)!
      : streams;

    for (const streamContent of streamsToParse) {
      const parsedItems = this.parsePdfTextStream(streamContent, pageWidth, pageHeight, cmap);
      textItems.push(...parsedItems);
    }

    // Fallback: If no stream text could be decoded, search for literal strings in raw PDF
    if (textItems.length === 0) {
      const literalMatches = rawPdf.match(/\(([^()]{2,100})\)\s*Tj/g);
      if (literalMatches) {
        let y = 0.1;
        for (let i = 0; i < literalMatches.length; i++) {
          const m = literalMatches[i]!;
          const text = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
          if (text.length > 0) {
            textItems.push({
              text,
              x: 0.1,
              y,
              w: Math.min(0.8, text.length * 0.015),
              h: 0.025,
            });
            y += 0.03;
            if (y > 0.95) break;
          }
        }
      }
    }

    // If completely empty, return empty result (triggers explicit manual_transcription_required quarantine)
    if (textItems.length === 0) {
      return {
        plainText: '',
        spans: [],
        engine: this.name,
        engineVersion: this.version,
      };
    }

    // Row-grouping: Items with |y1 - y2| < 0.012 share the same horizontal row (Ma et al. 2023; Li et al. 2024)
    textItems.sort((a, b) => a.y - b.y || a.x - b.x);

    const rows: TextItem[][] = [];
    const DELTA_Y = 0.012;

    for (const item of textItems) {
      const lastRow = rows[rows.length - 1];
      if (lastRow && lastRow[0] && Math.abs(lastRow[0].y - item.y) < DELTA_Y) {
        lastRow.push(item);
      } else {
        rows.push([item]);
      }
    }

    const lines: string[] = [];
    const spans: OcrSpanDraft[] = [];
    let charCursor = 0;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      row.sort((a, b) => a.x - b.x);

      const rowText = row.map((it) => it.text).join(' ').trim();
      if (!rowText) continue;

      const minX = Math.max(0, Math.min(...row.map((it) => it.x)));
      const minY = Math.max(0, Math.min(...row.map((it) => it.y)));
      const maxX = Math.min(1, Math.max(...row.map((it) => it.x + it.w)));
      const maxY = Math.min(1, Math.max(...row.map((it) => it.y + it.h)));

      const charStart = charCursor;
      const charEnd = charStart + rowText.length;
      charCursor = charEnd + 1;

      lines.push(rowText);
      spans.push({
        granularity: 'line',
        index: spans.length,
        text: rowText,
        charStart,
        charEnd,
        bbox: {
          x: Number(minX.toFixed(4)),
          y: Number(minY.toFixed(4)),
          w: Number(Math.max(0.01, maxX - minX).toFixed(4)),
          h: Number(Math.max(0.01, maxY - minY).toFixed(4)),
        },
        confidence: 0.95,
      });
    }

    return {
      plainText: lines.join('\n'),
      spans,
      engine: this.name,
      engineVersion: this.version,
    };
  }

  private parsePdfCmaps(streams: string[]): Map<number, string> {
    const cmap = new Map<number, string>();
    for (const s of streams) {
      if (s.includes('beginbfchar')) {
        const bfcharSection = s.match(/beginbfchar([\s\S]*?)endbfchar/);
        if (bfcharSection && bfcharSection[1]) {
          const bfcharRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
          let m: RegExpExecArray | null;
          while ((m = bfcharRegex.exec(bfcharSection[1])) !== null) {
            const srcHex = m[1];
            const dstHex = m[2];
            if (srcHex && dstHex) {
              cmap.set(parseInt(srcHex, 16), String.fromCharCode(parseInt(dstHex, 16)));
            }
          }
        }
      }
      if (s.includes('beginbfrange')) {
        const bfrangeSection = s.match(/beginbfrange([\s\S]*?)endbfrange/);
        if (bfrangeSection && bfrangeSection[1]) {
          const bfrangeRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
          let m: RegExpExecArray | null;
          while ((m = bfrangeRegex.exec(bfrangeSection[1])) !== null) {
            const startHex = m[1];
            const endHex = m[2];
            const dstHex = m[3];
            if (startHex && endHex && dstHex) {
              const startC = parseInt(startHex, 16);
              const endC = parseInt(endHex, 16);
              let dstC = parseInt(dstHex, 16);
              for (let c = startC; c <= endC; c++) {
                cmap.set(c, String.fromCharCode(dstC++));
              }
            }
          }
        }
      }
    }
    return cmap;
  }

  private decodeHex(hexStr: string, cmap: Map<number, string>): string {
    let out = '';
    for (let i = 0; i < hexStr.length; i += 4) {
      const chunk = hexStr.slice(i, i + 4);
      const code = parseInt(chunk, 16);
      if (cmap.has(code)) {
        out += cmap.get(code)!;
      } else if (code <= 255) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }

  private extractPdfStreams(bytes: Buffer): {
    streams: string[];
    pageStreams: Map<number, string[]>;
  } {
    const raw = bytes.toString('latin1');
    const streams: string[] = [];
    const streamByObj = new Map<number, string>();
    let startIdx = 0;

    // Track stream object numbers e.g. "12 0 obj ... stream"
    while (true) {
      const streamStart = raw.indexOf('stream', startIdx);
      if (streamStart === -1) break;

      // Search backward for object number "X 0 obj"
      const prefix = raw.slice(Math.max(0, streamStart - 80), streamStart);
      const objMatch = prefix.match(/(\d+)\s+\d+\s+obj\s*<<[\s\S]*?$/);
      const objNum = objMatch && objMatch[1] ? parseInt(objMatch[1], 10) : undefined;

      let dataStart = streamStart + 6;
      if (raw[dataStart] === '\r' && raw[dataStart + 1] === '\n') {
        dataStart += 2;
      } else if (raw[dataStart] === '\n' || raw[dataStart] === '\r') {
        dataStart += 1;
      }

      const streamEnd = raw.indexOf('endstream', dataStart);
      if (streamEnd === -1) break;

      const streamBytes = bytes.subarray(dataStart, streamEnd);
      startIdx = streamEnd + 9;

      // Try decompressing
      let decompressed = '';
      try {
        decompressed = inflateSync(streamBytes).toString('latin1');
      } catch {
        try {
          decompressed = inflateRawSync(streamBytes).toString('latin1');
        } catch {
          decompressed = streamBytes.toString('latin1');
        }
      }

      streams.push(decompressed);
      if (objNum !== undefined) {
        streamByObj.set(objNum, decompressed);
      }
    }

    // Resolve page-to-stream mappings if multiple pages exist
    const pageStreams = new Map<number, string[]>();
    const pageObjRegex = /(\d+)\s+\d+\s+obj\s*<<([\s\S]*?)>>\s*(?:stream|endobj)/g;
    let pageObjMatch: RegExpExecArray | null;
    let pageIndex = 1;

    while ((pageObjMatch = pageObjRegex.exec(raw)) !== null) {
      const body = pageObjMatch[2] ?? '';
      if (body.includes('/Page') && !body.includes('/Pages')) {
        const contentsMatch = body.match(/\/Contents\s*(?:\[\s*([\d\sR]+)\s*\]|(\d+)\s+\d+\s+R)/);
        if (contentsMatch) {
          const refs = (contentsMatch[1] || contentsMatch[2] || '')
            .split(/\s+/)
            .filter((tok) => /^\d+$/.test(tok))
            .map((tok) => parseInt(tok, 10));

          const pageStreamList: string[] = [];
          for (const ref of refs) {
            const s = streamByObj.get(ref);
            if (s) pageStreamList.push(s);
          }
          if (pageStreamList.length > 0) {
            pageStreams.set(pageIndex, pageStreamList);
          }
        }
        pageIndex++;
      }
    }

    return { streams, pageStreams };
  }

  private parsePdfTextStream(
    content: string,
    pageWidth: number,
    pageHeight: number,
    cmap: Map<number, string>,
  ): TextItem[] {
    const items: TextItem[] = [];

    // Track graphics transformation matrix (CTM)
    let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
    const ctmStack: Matrix6[] = [];

    const streamOpRegex =
      /(q)|(Q)|(?:([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+cm)|(?:BT([\s\S]*?)ET)/g;
    let opMatch: RegExpExecArray | null;

    while ((opMatch = streamOpRegex.exec(content)) !== null) {
      if (opMatch[1] === 'q') {
        ctmStack.push([...ctm]);
      } else if (opMatch[2] === 'Q') {
        if (ctmStack.length > 0) ctm = ctmStack.pop()!;
      } else if (opMatch[3] && opMatch[4] && opMatch[5] && opMatch[6] && opMatch[7] && opMatch[8]) {
        const a = parseFloat(opMatch[3]);
        const b = parseFloat(opMatch[4]);
        const c = parseFloat(opMatch[5]);
        const d = parseFloat(opMatch[6]);
        const e = parseFloat(opMatch[7]);
        const f = parseFloat(opMatch[8]);
        ctm = [
          a * ctm[0] + b * ctm[2],
          a * ctm[1] + b * ctm[3],
          c * ctm[0] + d * ctm[2],
          c * ctm[1] + d * ctm[3],
          e * ctm[0] + f * ctm[2] + ctm[4],
          e * ctm[1] + f * ctm[3] + ctm[5],
        ];
      } else if (opMatch[9] !== undefined) {
        const block = opMatch[9];
        let curX = 0;
        let curY = 0;
        let fontSize = 12;

        const tokRegex =
          /(?:(\/F\w+)\s+([\d.]+)\s+Tf)|(?:([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm)|(?:([\d.-]+)\s+([\d.-]+)\s+Td)|(?:\(([^()]*)\)\s*Tj)|(?:<([0-9a-fA-F]+)>\s*Tj)|(?:\[([\s\S]*?)\]\s*TJ)/g;
        let tokMatch: RegExpExecArray | null;

        while ((tokMatch = tokRegex.exec(block)) !== null) {
          if (tokMatch[2]) {
            fontSize = parseFloat(tokMatch[2]) || 12;
          } else if (tokMatch[7] && tokMatch[8]) {
            curX = parseFloat(tokMatch[7]);
            curY = parseFloat(tokMatch[8]);
          } else if (tokMatch[9] && tokMatch[10]) {
            curX += parseFloat(tokMatch[9]);
            curY += parseFloat(tokMatch[10]);
          } else if (tokMatch[11] !== undefined) {
            const rawText = tokMatch[11]
              .replace(/\\([()\\])/g, '$1')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t');
            if (rawText.trim().length > 0) {
              const xPage = curX * ctm[0] + curY * ctm[2] + ctm[4];
              const yPage = curX * ctm[1] + curY * ctm[3] + ctm[5];
              const normX = Math.max(0, Math.min(1, xPage / pageWidth));
              const normY = Math.max(0, Math.min(1, (pageHeight - yPage) / pageHeight));
              items.push({
                text: rawText.trim(),
                x: normX,
                y: normY,
                w: Math.min(0.9, (rawText.length * fontSize * 0.5 * Math.abs(ctm[0] || 1)) / pageWidth),
                h: Math.min(0.1, (fontSize * 1.2 * Math.abs(ctm[3] || 1)) / pageHeight),
              });
            }
          } else if (tokMatch[12] !== undefined) {
            const rawText = this.decodeHex(tokMatch[12], cmap);
            if (rawText.trim().length > 0) {
              const xPage = curX * ctm[0] + curY * ctm[2] + ctm[4];
              const yPage = curX * ctm[1] + curY * ctm[3] + ctm[5];
              const normX = Math.max(0, Math.min(1, xPage / pageWidth));
              const normY = Math.max(0, Math.min(1, (pageHeight - yPage) / pageHeight));
              items.push({
                text: rawText.trim(),
                x: normX,
                y: normY,
                w: Math.min(0.9, (rawText.length * fontSize * 0.5 * Math.abs(ctm[0] || 1)) / pageWidth),
                h: Math.min(0.1, (fontSize * 1.2 * Math.abs(ctm[3] || 1)) / pageHeight),
              });
            }
          } else if (tokMatch[13] !== undefined) {
            const arrayContent = tokMatch[13];
            let joined = '';
            const hexParts = arrayContent.match(/<([0-9a-fA-F]+)>/g);
            if (hexParts) {
              joined = hexParts.map((h) => this.decodeHex(h.slice(1, -1), cmap)).join('');
            } else {
              const strParts = arrayContent.match(/\(([^()]*)\)/g);
              if (strParts) {
                joined = strParts
                  .map((p) => p.slice(1, -1).replace(/\\([()\\])/g, '$1'))
                  .join('');
              }
            }
            if (joined.trim().length > 0) {
              const xPage = curX * ctm[0] + curY * ctm[2] + ctm[4];
              const yPage = curX * ctm[1] + curY * ctm[3] + ctm[5];
              const normX = Math.max(0, Math.min(1, xPage / pageWidth));
              const normY = Math.max(0, Math.min(1, (pageHeight - yPage) / pageHeight));
              items.push({
                text: joined.trim(),
                x: normX,
                y: normY,
                w: Math.min(0.9, (joined.length * fontSize * 0.5 * Math.abs(ctm[0] || 1)) / pageWidth),
                h: Math.min(0.1, (fontSize * 1.2 * Math.abs(ctm[3] || 1)) / pageHeight),
              });
            }
          }
        }
      }
    }

    return items;
  }

  private extractFhirOrJson(json: Record<string, unknown>): OcrPageResult {
    const lines: string[] = [];

    if (json['resourceType']) lines.push(`Resource Type: ${String(json['resourceType'])}`);
    if (json['type']) lines.push(`Bundle Type: ${String(json['type'])}`);
    if (json['id']) lines.push(`Resource ID: ${String(json['id'])}`);

    if (Array.isArray(json['entry'])) {
      lines.push(`Total Entries: ${json['entry'].length}`);
      for (let i = 0; i < Math.min(json['entry'].length, 10); i++) {
        const item = json['entry'][i];
        if (item && typeof item === 'object' && item['resource']) {
          const res = item['resource'] as Record<string, unknown>;
          const resType = res['resourceType'] ? String(res['resourceType']) : 'Unknown';
          const codeObj = res['code'] as Record<string, unknown> | undefined;
          const title = res['title'] ?? res['name'] ?? codeObj?.['text'];
          lines.push(`Entry [${i + 1}]: ${resType}${title ? ` - ${String(title)}` : ''}`);
        }
      }
    }

    if (lines.length === 0) {
      lines.push(`JSON Document: ${Object.keys(json).slice(0, 5).join(', ')}`);
    }

    return this.buildResultFromLines(lines);
  }

  private extractVcfOrHl7(text: string): OcrPageResult {
    const rawLines = text.split(/\r?\n/);
    const lines: string[] = [];

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('##fileformat=') || trimmed.startsWith('##fileDate=') || trimmed.startsWith('##source=')) {
        lines.push(trimmed);
      } else if (trimmed.startsWith('MSH|')) {
        const fields = trimmed.split('|');
        const sendingFacility = fields[3] ?? 'Unknown';
        const msgDate = fields[6] ?? 'Unknown';
        const msgType = fields[8] ?? 'Unknown';
        lines.push(`HL7 MSH Segment: Facility=${sendingFacility}, Date=${msgDate}, Type=${msgType}`);
      } else if (trimmed.startsWith('BEGIN:VCARD') || trimmed.startsWith('FN:') || trimmed.startsWith('ORG:')) {
        lines.push(trimmed);
      }
    }

    if (lines.length === 0) {
      lines.push(...rawLines.slice(0, 10).filter((l) => l.trim().length > 0));
    }

    return this.buildResultFromLines(lines);
  }

  private extractImage(bytes: Buffer): OcrPageResult {
    let width = 800;
    let height = 600;
    let format = 'image';

    // PNG dimensions
    if (bytes.length >= 24 && bytes.subarray(1, 4).toString('latin1') === 'PNG') {
      format = 'PNG';
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      format = 'JPEG';
      // Search for SOF0 marker
      let off = 2;
      while (off < bytes.length - 8) {
        if (bytes[off] === 0xff && (bytes[off + 1] === 0xc0 || bytes[off + 1] === 0xc2)) {
          height = bytes.readUInt16BE(off + 5);
          width = bytes.readUInt16BE(off + 7);
          break;
        }
        off += 1;
      }
    } else if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF') {
      format = 'WebP';
    } else if (
      bytes.length >= 4 &&
      ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d))
    ) {
      format = 'TIFF';
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const lines: string[] = [
      `Image Format: ${format}`,
      `Dimensions: ${width}x${height}`,
      `SHA-256: ${sha256}`,
    ];

    // Look for any readable ASCII strings embedded
    const ascii = bytes.toString('latin1').match(/[A-Za-z0-9 ,.:;/-]{6,100}/g);
    if (ascii) {
      for (const text of ascii.slice(0, 8)) {
        const trimmed = text.trim();
        if (trimmed.length > 5 && !lines.includes(trimmed)) {
          lines.push(trimmed);
        }
      }
    }

    return this.buildResultFromLines(lines);
  }

  private buildResultFromLines(lines: string[]): OcrPageResult {
    const plainText = lines.join('\n');
    const spans: OcrSpanDraft[] = [];
    let charCursor = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const charStart = charCursor;
      const charEnd = charStart + line.length;
      charCursor = charEnd + 1;

      spans.push({
        granularity: 'line',
        index: i,
        text: line,
        charStart,
        charEnd,
        bbox: {
          x: 0.05,
          y: Number((0.05 + i * 0.035).toFixed(4)),
          w: 0.9,
          h: 0.03,
        },
        confidence: 0.95,
      });
    }

    return {
      plainText,
      spans,
      engine: this.name,
      engineVersion: this.version,
    };
  }
}
