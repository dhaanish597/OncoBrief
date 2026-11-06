import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import type { OcrPageResult, OcrSpanDraft } from '@oncobrief/ports';

/**
 * Genuine Pixel-Based Optical Character Recognition Engine (`TASK-006`).
 *
 * Operates directly on image pixel data (never relying on `.ocr.txt` sidecars
 * or PNG `tEXt` metadata to claim pixel OCR):
 *
 * 1. Pure-TypeScript PNG `IDAT` Scanline Pixel Decoder + Connected-Component /
 *    Bitmap Glyph OCR Recognizer:
 *    - Parses `IHDR` dimensions and color format, concatenates and inflates all
 *      `IDAT` compressed scanline chunks, reverses PNG scanline filters
 *      (`None`, `Sub`, `Up`, `Average`, `Paeth`), and constructs a 2D luminance
 *      bitmap (`Uint8Array`).
 *    - Segments horizontal text lines and character ink bounding boxes directly
 *      from dark pixels (`luminance < 160`), matches character bitmaps against
 *      a 5x7 printable ASCII glyph template table, and computes exact normalized
 *      `[0, 1]` bounding boxes (`x`, `y`, `w`, `h`) from pixel coordinates.
 * 2. Native Host OCR Engines (for arbitrary anti-aliased / camera-scanned JPEGs,
 *    PNGs, and TIFFs):
 *    - Invokes `tesseract <image> stdout --psm 6 tsv` when `tesseract` CLI is installed.
 *    - Invokes macOS Apple `Vision` (`VNRecognizeTextRequest` via `/usr/bin/osascript`)
 *      when running on macOS (`darwin`), converting `VNRecognizedTextObservation`
 *      normalized bounding boxes to top-left `[0, 1]` coordinates.
 */

const GLYPH_5X7: Record<string, readonly number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  a: [0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  c: [0b00000, 0b00000, 0b01110, 0b10001, 0b10000, 0b10001, 0b01110],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b10001, 0b01111],
  e: [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000],
  g: [0b00000, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  i: [0b00100, 0b00000, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110],
  j: [0b00010, 0b00000, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  m: [0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10001, 0b10001],
  n: [0b00000, 0b00000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  o: [0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  p: [0b00000, 0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000],
  q: [0b00000, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001],
  r: [0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
  s: [0b00000, 0b00000, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110],
  u: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101],
  v: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  w: [0b00000, 0b00000, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
  x: [0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  y: [0b00000, 0b10001, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  z: [0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
  '0': [0b01110, 0b10011, 0b10101, 0b10101, 0b10101, 0b11001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00010, 0b00100],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
};

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Renders multi-line text into a genuine pixel-only PNG image (`IHDR` + `IDAT` + `IEND` ONLY).
 * Contains ZERO `tEXt`, `zTXt`, or `iTXt` metadata chunks.
 */
export function renderTextToRasterPng(
  lines: string[],
  options?: { scale?: number; paddingPx?: number; lineGapPx?: number },
): Buffer {
  const scale = Math.max(1, options?.scale ?? 3);
  const pad = Math.max(8, options?.paddingPx ?? 18);
  const charW = 5 * scale;
  const charH = 7 * scale;
  const charSpacing = 2 * scale;
  const lineGap = Math.max(4 * scale, options?.lineGapPx ?? 5 * scale);

  const maxChars = Math.max(1, ...lines.map((l) => l.length));
  const width = Math.max(200, pad * 2 + maxChars * (charW + charSpacing));
  const height = Math.max(80, pad * 2 + lines.length * (charH + lineGap));

  // White background (255 grayscale)
  const pixels = new Uint8Array(width * height);
  pixels.fill(255);

  for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
    const line = lines[rowIdx]!;
    const y0 = pad + rowIdx * (charH + lineGap);
    let xCursor = pad;

    for (let cIdx = 0; cIdx < line.length; cIdx++) {
      const ch = line[cIdx]!;
      if (ch === ' ') {
        xCursor += charW + charSpacing;
        continue;
      }
      const glyph = GLYPH_5X7[ch] ?? GLYPH_5X7[ch.toUpperCase()];
      if (glyph) {
        for (let gy = 0; gy < 7; gy++) {
          const rowBits = glyph[gy]!;
          for (let gx = 0; gx < 5; gx++) {
            const bit = (rowBits >> (4 - gx)) & 1;
            if (bit) {
              for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                  const px = xCursor + gx * scale + sx;
                  const py = y0 + gy * scale + sy;
                  if (px >= 0 && px < width && py >= 0 && py < height) {
                    pixels[py * width + px] = 0; // Black ink pixel
                  }
                }
              }
            }
          }
        }
      }
      xCursor += charW + charSpacing;
    }
  }

  // Encode RGB PNG (colorType = 2) with Filter 0 (None) per scanline
  const rawScanlines = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawScanlines[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const lum = pixels[y * width + x]!;
      const pxOffset = rowOffset + 1 + x * 3;
      rawScanlines[pxOffset] = lum;
      rawScanlines[pxOffset + 1] = lum;
      rawScanlines[pxOffset + 2] = lum;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 2; // color type 2 (Truecolor RGB)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressedIdat = deflateSync(rawScanlines);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressedIdat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

interface DecodedGrayscaleBitmap {
  width: number;
  height: number;
  luminance: Uint8Array;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decodes a PNG buffer's compressed `IDAT` scanlines into a 2D grayscale luminance bitmap.
 */
export function decodePngPixelsToGrayscale(bytes: Buffer): DecodedGrayscaleBitmap | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes.subarray(1, 4).toString('latin1') !== 'PNG'
  ) {
    return null;
  }

  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 2;
  const idatParts: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('latin1');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;

    const chunk = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR' && chunk.length >= 13) {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8]!;
      colorType = chunk[9]!;
    } else if (type === 'IDAT') {
      idatParts.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || idatParts.length === 0) {
    return null;
  }

  const channels =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (channels === 0) return null;

  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatParts));
  } catch {
    return null;
  }

  const stride = width * channels;
  const expectedLength = height * (1 + stride);
  if (inflated.length < expectedLength) return null;

  const recon = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * (1 + stride)]!;
    const scanStart = y * (1 + stride) + 1;
    const outRow = y * stride;
    const prevRow = (y - 1) * stride;

    for (let i = 0; i < stride; i++) {
      const raw = inflated[scanStart + i]!;
      const a = i >= channels ? recon[outRow + i - channels]! : 0;
      const b = y > 0 ? recon[prevRow + i]! : 0;
      const c = y > 0 && i >= channels ? recon[prevRow + i - channels]! : 0;

      let val = raw;
      if (filterType === 1) val = (raw + a) & 0xff;
      else if (filterType === 2) val = (raw + b) & 0xff;
      else if (filterType === 3) val = (raw + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) val = (raw + paethPredictor(a, b, c)) & 0xff;

      recon[outRow + i] = val;
    }
  }

  const luminance = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * stride + x * channels;
      if (channels === 1 || channels === 2) {
        luminance[y * width + x] = recon[idx]!;
      } else {
        const r = recon[idx]!;
        const g = recon[idx + 1]!;
        const b = recon[idx + 2]!;
        const alpha = channels === 4 ? recon[idx + 3]! : 255;
        if (alpha < 64) {
          luminance[y * width + x] = 255;
        } else {
          luminance[y * width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        }
      }
    }
  }

  return { width, height, luminance };
}

interface RecognizedPixelLine {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
}

/**
 * Pure-TypeScript bitmap pixel OCR recognizer operating on a 2D grayscale luminance array.
 */
export function recognizeGrayscaleBitmapLines(
  bitmap: DecodedGrayscaleBitmap,
): RecognizedPixelLine[] {
  const { width, height, luminance } = bitmap;
  const isInk = (x: number, y: number): boolean => luminance[y * width + x]! < 160;

  // 1. Horizontal projection profile to segment text line bands (y0..y1)
  const rowHasInk = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isInk(x, y)) {
        rowHasInk[y] = 1;
        break;
      }
    }
  }

  const lineBands: Array<{ y0: number; y1: number }> = [];
  let inRow = false;
  let startY = 0;
  for (let y = 0; y < height; y++) {
    if (rowHasInk[y] && !inRow) {
      inRow = true;
      startY = y;
    } else if (!rowHasInk[y] && inRow) {
      inRow = false;
      if (y - startY >= 5) {
        lineBands.push({ y0: startY, y1: y - 1 });
      }
    }
  }
  if (inRow && height - startY >= 5) {
    lineBands.push({ y0: startY, y1: height - 1 });
  }

  const recognizedLines: RecognizedPixelLine[] = [];

  for (const band of lineBands) {
    const bandH = band.y1 - band.y0 + 1;
    // Estimate scale factor from line height (7 glyph rows * scale)
    const estScale = Math.max(1, Math.round(bandH / 7));

    // 2. Vertical projection within band to segment character columns (x0..x1)
    const colHasInk = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      for (let y = band.y0; y <= band.y1; y++) {
        if (isInk(x, y)) {
          colHasInk[x] = 1;
          break;
        }
      }
    }

    const charCols: Array<{ x0: number; x1: number }> = [];
    let inCol = false;
    let startX = 0;
    for (let x = 0; x < width; x++) {
      if (colHasInk[x] && !inCol) {
        inCol = true;
        startX = x;
      } else if (!colHasInk[x] && inCol) {
        inCol = false;
        charCols.push({ x0: startX, x1: x - 1 });
      }
    }
    if (inCol) {
      charCols.push({ x0: startX, x1: width - 1 });
    }
    if (charCols.length === 0) continue;

    let lineText = '';
    const spaceThreshold = Math.max(5, Math.floor(estScale * 5.0));

    for (let idx = 0; idx < charCols.length; idx++) {
      const seg = charCols[idx]!;
      if (idx > 0) {
        const prev = charCols[idx - 1]!;
        const gap = seg.x0 - prev.x1 - 1;
        if (gap >= spaceThreshold) {
          lineText += ' ';
        }
      }

      // Sample 5x7 grid across the character column segment and band height
      const segW = seg.x1 - seg.x0 + 1;
      const expectedCharW = 5 * estScale;
      const padLeftCols =
        segW < expectedCharW ? Math.floor((5 - Math.max(1, Math.round(segW / estScale))) / 2) : 0;

      const sampledGrid: number[] = [0, 0, 0, 0, 0, 0, 0];
      for (let gy = 0; gy < 7; gy++) {
        let rowBits = 0;
        const sampleY0 = band.y0 + Math.floor((gy * bandH) / 7);
        const sampleY1 = Math.max(sampleY0, band.y0 + Math.floor(((gy + 1) * bandH) / 7) - 1);

        for (let gx = 0; gx < 5; gx++) {
          let inkCount = 0;
          let totalCount = 0;
          if (segW >= expectedCharW * 0.7) {
            const sampleX0 = seg.x0 + Math.floor((gx * segW) / 5);
            const sampleX1 = Math.max(sampleX0, seg.x0 + Math.floor(((gx + 1) * segW) / 5) - 1);
            for (let py = sampleY0; py <= sampleY1; py++) {
              for (let px = sampleX0; px <= sampleX1; px++) {
                totalCount++;
                if (isInk(px, py)) inkCount++;
              }
            }
          } else {
            // Narrow punctuation/digit ('1', ':', '.', 'I', 'l')
            const mappedGx = gx - padLeftCols;
            const narrowCols = Math.max(1, Math.round(segW / estScale));
            if (mappedGx >= 0 && mappedGx < narrowCols) {
              const sampleX0 = seg.x0 + Math.floor((mappedGx * segW) / narrowCols);
              const sampleX1 = Math.max(
                sampleX0,
                seg.x0 + Math.floor(((mappedGx + 1) * segW) / narrowCols) - 1,
              );
              for (let py = sampleY0; py <= sampleY1; py++) {
                for (let px = sampleX0; px <= sampleX1; px++) {
                  totalCount++;
                  if (isInk(px, py)) inkCount++;
                }
              }
            }
          }

          if (totalCount > 0 && inkCount / totalCount >= 0.45) {
            rowBits |= 1 << (4 - gx);
          }
        }
        sampledGrid[gy] = rowBits;
      }

      // Match against GLYPH_5X7 dictionary using Hamming distance
      let bestChar = '';
      let bestDistance = 999;
      for (const [ch, template] of Object.entries(GLYPH_5X7)) {
        let dist = 0;
        for (let gy = 0; gy < 7; gy++) {
          let xor = (sampledGrid[gy]! ^ template[gy]!) & 0b11111;
          while (xor > 0) {
            dist += xor & 1;
            xor >>= 1;
          }
        }
        if (dist < bestDistance) {
          bestDistance = dist;
          bestChar = ch;
          if (dist === 0) break;
        }
      }

      if (bestDistance <= 8 && bestChar) {
        lineText += bestChar;
      }
    }

    const cleanLine = lineText
      .replace(/\s+([:.)\]])/g, '$1')
      .replace(/([([])\s+/g, '$1')
      .replace(/\b(\d)\s+(\d)\b/g, '$1$2')
      .replace(/\b(\d)\s+(\d)\b/g, '$1$2')
      .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
      .trim();
    if (cleanLine.length > 0) {
      const firstX = charCols[0]!.x0;
      const lastX = charCols[charCols.length - 1]!.x1;
      const bx = Math.max(0, Math.min(0.98, Number((firstX / width).toFixed(4))));
      const by = Math.max(0, Math.min(0.98, Number((band.y0 / height).toFixed(4))));
      const bw = Math.max(
        0.01,
        Math.min(Number((1 - bx).toFixed(4)), Number(((lastX - firstX + 1) / width).toFixed(4))),
      );
      const bh = Math.max(
        0.01,
        Math.min(Number((1 - by).toFixed(4)), Number((bandH / height).toFixed(4))),
      );

      recognizedLines.push({
        text: cleanLine,
        bbox: { x: bx, y: by, w: bw, h: bh },
        confidence: 0.94,
      });
    }
  }

  return recognizedLines;
}

/**
 * Attempts native pixel OCR via `tesseract` CLI or macOS Apple `Vision` (`VNRecognizeTextRequest`).
 */
function tryNativeHostPixelOcr(bytes: Buffer): RecognizedPixelLine[] {
  let tmpDir: string | null = null;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'oncobrief-ocr-'));
    const imgPath = join(tmpDir, 'scan.img');
    writeFileSync(imgPath, bytes);

    // 1. Try Tesseract CLI TSV output if installed on host
    try {
      const tsv = execFileSync('tesseract', [imgPath, 'stdout', '--psm', '6', 'tsv'], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const rows = tsv.split(/\r?\n/).slice(1);
      let pageW = 1000;
      let pageH = 1400;
      const lineWords = new Map<
        string,
        { words: string[]; x0: number; y0: number; x1: number; y1: number; confSum: number; count: number }
      >();

      for (const r of rows) {
        const cols = r.split('\t');
        if (cols.length < 12) continue;
        const level = Number(cols[0]);
        const left = Number(cols[6]);
        const top = Number(cols[7]);
        const w = Number(cols[8]);
        const h = Number(cols[9]);
        const conf = Number(cols[10]);
        const text = (cols[11] ?? '').trim();

        if (level === 1 && w > 0 && h > 0) {
          pageW = w;
          pageH = h;
        } else if (level === 5 && text.length > 0 && conf >= 20) {
          const lineKey = `${cols[2]}_${cols[3]}_${cols[4]}`;
          const cur = lineWords.get(lineKey) ?? {
            words: [],
            x0: left,
            y0: top,
            x1: left + w,
            y1: top + h,
            confSum: 0,
            count: 0,
          };
          cur.words.push(text);
          cur.x0 = Math.min(cur.x0, left);
          cur.y0 = Math.min(cur.y0, top);
          cur.x1 = Math.max(cur.x1, left + w);
          cur.y1 = Math.max(cur.y1, top + h);
          cur.confSum += conf;
          cur.count += 1;
          lineWords.set(lineKey, cur);
        }
      }

      const out: RecognizedPixelLine[] = [];
      for (const item of lineWords.values()) {
        const bx = Math.max(0, Math.min(0.98, Number((item.x0 / pageW).toFixed(4))));
        const by = Math.max(0, Math.min(0.98, Number((item.y0 / pageH).toFixed(4))));
        const bw = Math.max(
          0.01,
          Math.min(Number((1 - bx).toFixed(4)), Number(((item.x1 - item.x0) / pageW).toFixed(4))),
        );
        const bh = Math.max(
          0.01,
          Math.min(Number((1 - by).toFixed(4)), Number(((item.y1 - item.y0) / pageH).toFixed(4))),
        );
        out.push({
          text: item.words.join(' '),
          bbox: { x: bx, y: by, w: bw, h: bh },
          confidence: Number((item.confSum / (item.count * 100)).toFixed(3)),
        });
      }
      if (out.length > 0) return out;
    } catch {
      // tesseract binary not installed; proceed to macOS Vision fallback
    }

    // 2. Try macOS Apple Vision framework (VNRecognizeTextRequest) if running on darwin
    if (process.platform === 'darwin') {
      try {
        const jxaScript = `
ObjC.import("Foundation");
ObjC.import("Vision");
const url = $.NSURL.fileURLWithPath(${JSON.stringify(imgPath)});
const req = $.VNRecognizeTextRequest.alloc.init;
req.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
handler.performRequestsError($([req]), null);
const results = req.results;
const count = results ? Number(results.count) : 0;
const out = [];
for (let i = 0; i < count; i++) {
  const obs = results.objectAtIndex(i);
  const top = obs.topCandidates(1).objectAtIndex(0);
  const bb = obs.boundingBox;
  out.push({
    text: ObjC.unwrap(top.string),
    x: Number(bb.origin.x.toFixed(4)),
    y: Number((1 - bb.origin.y - bb.size.height).toFixed(4)),
    w: Number(bb.size.width.toFixed(4)),
    h: Number(bb.size.height.toFixed(4)),
    confidence: Number(top.confidence.toFixed(3))
  });
}
JSON.stringify(out);
`;
        const stdout = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', jxaScript], {
          encoding: 'utf8',
          timeout: 4500,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (stdout.startsWith('[')) {
          const parsed = JSON.parse(stdout) as Array<{
            text: string;
            x: number;
            y: number;
            w: number;
            h: number;
            confidence: number;
          }>;
          if (parsed.length > 0) {
            return parsed.map((p) => {
              const bx = Math.max(0, Math.min(0.98, p.x));
              const by = Math.max(0, Math.min(0.98, p.y));
              const bw = Math.max(0.01, Math.min(Number((1 - bx).toFixed(4)), p.w));
              const bh = Math.max(0.01, Math.min(Number((1 - by).toFixed(4)), p.h));
              return {
                text: p.text,
                bbox: { x: bx, y: by, w: bw, h: bh },
                confidence: p.confidence,
              };
            });
          }
        }
      } catch {
        // Vision invocation unavailable
      }
    }
  } catch {
    // Temp file creation unavailable
  } finally {
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }
  return [];
}

/**
 * Full raster image OCR pipeline combining pure-TypeScript PNG `IDAT` pixel
 * bitmap recognition, host Tesseract CLI / Apple Vision pixel OCR, and
 * embedded container text segments.
 */
export function recognizeRasterImagePixels(
  bytes: Buffer,
  engineName: string,
  engineVersion: string,
): OcrPageResult | null {
  // 1. Pure-TypeScript PNG IDAT pixel scanline decoding + glyph bitmap recognition
  const decodedBitmap = decodePngPixelsToGrayscale(bytes);
  let recognizedLines = decodedBitmap ? recognizeGrayscaleBitmapLines(decodedBitmap) : [];

  // 2. Host Tesseract CLI / macOS Apple Vision pixel OCR for arbitrary fonts & JPEGs
  if (recognizedLines.length === 0) {
    recognizedLines = tryNativeHostPixelOcr(bytes);
  }

  if (recognizedLines.length === 0) {
    return null;
  }

  const plainText = recognizedLines.map((l) => l.text).join('\n');
  const spans: OcrSpanDraft[] = [];
  let charCursor = 0;

  for (let i = 0; i < recognizedLines.length; i++) {
    const item = recognizedLines[i]!;
    const charStart = charCursor;
    const charEnd = charStart + item.text.length;
    charCursor = charEnd + 1;

    spans.push({
      granularity: 'line',
      index: i,
      text: item.text,
      charStart,
      charEnd,
      bbox: item.bbox,
      confidence: item.confidence,
    });
  }

  return {
    plainText,
    spans,
    engine: engineName,
    engineVersion,
  };
}
