import type { OcrPageInput, OcrPageResult, OcrPort } from '@oncobrief/ports';

/**
 * Deterministic OCR adapter (architecture §16.2).
 *
 * Used for demo fixtures, tests, and as an env-var fallback on the presenting
 * machine. Byte-identical on every run. When a page supplies no fixture and no
 * image bytes, it fails loudly rather than inventing text.
 */
export class FixtureOcrAdapter implements OcrPort {
  readonly name = 'fixture';
  readonly version = 'v1';

  async extract(page: OcrPageInput): Promise<OcrPageResult> {
    if (!page.fixture) {
      throw new Error(
        `fixture_ocr_no_fixture:document=${page.documentId}:page=${page.pageNumber}`,
      );
    }
    return {
      plainText: page.fixture.plainText,
      spans: page.fixture.spans,
      engine: this.name,
      engineVersion: this.version,
    };
  }
}
