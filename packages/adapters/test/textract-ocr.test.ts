import { describe, expect, it } from 'vitest';
import { normalizeTextractBlocks } from '../src/textract-ocr';

const options = { engine: 'textract', engineVersion: 'v1' };

describe('normalizeTextractBlocks', () => {
  const blocks = [
    { BlockType: 'PAGE', Id: 'p1', Page: 1 },
    {
      BlockType: 'LINE',
      Id: 'l1',
      Text: 'Second line',
      Page: 1,
      Confidence: 95,
      Geometry: { BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.5, Height: 0.03 } },
    },
    {
      BlockType: 'LINE',
      Id: 'l2',
      Text: 'First line',
      Page: 1,
      Confidence: 80,
      Geometry: { BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.5, Height: 0.03 } },
    },
    { BlockType: 'WORD', Id: 'w1', Text: 'ignored', Page: 1, Confidence: 90 },
    {
      BlockType: 'LINE',
      Id: 'l3',
      Text: 'Page two',
      Page: 2,
      Confidence: 99,
      Geometry: { BoundingBox: { Left: 0.2, Top: 0.1, Width: 0.4, Height: 0.04 } },
    },
  ];

  it('groups lines by page and orders them by reading geometry', () => {
    const pages = normalizeTextractBlocks(blocks, options);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(pages[0]!.plainText).toBe('First line\nSecond line');
    expect(pages[0]!.spans.map((s) => s.text)).toEqual(['First line', 'Second line']);
  });

  it('normalises confidence from 0-100 to 0-1 and keeps bounding boxes', () => {
    const page = normalizeTextractBlocks(blocks, options)[0]!;
    expect(page.spans[0]!.confidence).toBe(0.8);
    expect(page.spans[0]!.bbox).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.03 });
  });

  it('records char offsets contiguous across the page', () => {
    const page = normalizeTextractBlocks(blocks, options)[0]!;
    expect(page.spans[0]!.charStart).toBe(0);
    expect(page.spans[0]!.charEnd).toBe('First line'.length);
    expect(page.spans[1]!.charStart).toBe('First line'.length + 1);
  });

  it('returns nothing for a response with no LINE blocks', () => {
    expect(normalizeTextractBlocks([{ BlockType: 'PAGE', Page: 1 }], options)).toEqual([]);
  });
});
