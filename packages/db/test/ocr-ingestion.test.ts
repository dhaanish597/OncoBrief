import { describe, it, expect } from 'vitest';
import { ingestDocument } from '../src/services/documents';
import type { Querier } from '../src/client';
import type { OcrPort, StoragePort, ExtractionPort } from '@oncobrief/ports';

function setup(ocr: OcrPort) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const q = {
    query: async (sql: string, params: unknown[] = []) => {
      writes.push({ sql, params });
      if (sql.startsWith('SELECT id, org_id'))
        return {
          rows: [
            {
              id: 'doc',
              org_id: 'org',
              patient_id: 'patient',
              original_filename: 'scan.pdf',
              mime_type: 'application/pdf',
              storage_key: 'source',
            },
          ],
        };
      if (sql.includes('oncobrief_next_audit_seq'))
        return { rows: [{ seq: '1' }] };
      if (sql.includes('INSERT INTO audit_event'))
        return { rows: [{ id: 'audit' }] };
      return { rows: [] };
    },
  } as unknown as Querier;
  const storage = {
    get: async () => Buffer.from('%PDF-source'),
  } as unknown as StoragePort;
  const extractor = { extract: async () => [] } as unknown as ExtractionPort;
  return {
    writes,
    run: () => ingestDocument(q, { ocr, storage, extractor }, 'doc'),
  };
}
describe('document-level OCR ingestion failures', () => {
  it('uses document OCR once and quarantines empty output without synthetic pages', async () => {
    let calls = 0;
    const { writes, run } = setup({
      name: 'real',
      version: 'v1',
      extract: async () => {
        throw new Error('per_page_not_allowed');
      },
      extractDocument: async () => {
        calls++;
        return [];
      },
    });
    expect((await run()).status).toBe('quarantined');
    expect(calls).toBe(1);
    expect(
      writes.some((w) => w.sql.includes('manual_transcription_required')),
    ).toBe(true);
  });
  it('persists provider failure as failed with safe code rather than rendering forever', async () => {
    const { writes, run } = setup({
      name: 'real',
      version: 'v1',
      extract: async () => {
        throw new Error('private source text');
      },
      extractDocument: async () => {
        throw new Error('private source text');
      },
    });
    expect((await run()).status).toBe('failed');
    expect(
      writes.some(
        (w) =>
          w.sql.includes("ingest_status = 'failed'") &&
          w.params.includes('ocr_extraction_failed'),
      ),
    ).toBe(true);
    expect(JSON.stringify(writes)).not.toContain('private source text');
  });
  it('quarantines a mixed scanned PDF requiring manual transcription', async () => {
    const { writes, run } = setup({
      name: 'local-multimodal',
      version: 'v1',
      extract: async () => {
        throw new Error('unused');
      },
      extractDocument: async () => {
        throw new Error('ocr_manual_transcription_required');
      },
    });
    expect((await run()).status).toBe('quarantined');
    expect(
      writes.some(
        (w) =>
          w.sql.includes("ingest_status = 'quarantined'") &&
          w.params.includes('manual_transcription_required'),
      ),
    ).toBe(true);
  });
});
