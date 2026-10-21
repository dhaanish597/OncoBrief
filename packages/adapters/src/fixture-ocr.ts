import type { OcrPageInput, OcrPageResult, OcrPort } from '@oncobrief/ports';
import { LocalMultimodalOcrAdapter } from './local-multimodal-ocr';

/**
 * Deterministic OCR adapter (architecture §16.2).
 *
 * Used for demo fixtures, tests, and as an env-var fallback on the presenting
 * machine. Byte-identical on every run. When a page supplies a fixture, it returns
 * it; when unseeded image bytes are supplied, it falls back to LocalMultimodalOcrAdapter.
 */
export class FixtureOcrAdapter implements OcrPort {
  readonly name = 'fixture';
  readonly version = 'v1';
  private readonly fallback = new LocalMultimodalOcrAdapter();

  async extract(page: OcrPageInput): Promise<OcrPageResult> {
    if (page.fixture) {
      return {
        plainText: page.fixture.plainText,
        spans: page.fixture.spans,
        engine: this.name,
        engineVersion: this.version,
      };
    }
    if (page.imageBytes && page.imageBytes.length > 0) {
      return this.fallback.extract(page);
    }
    throw new Error(
      `fixture_ocr_no_fixture:document=${page.documentId}:page=${page.pageNumber}`,
    );
  }
}
