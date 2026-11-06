import { afterEach, expect, it, vi } from 'vitest';
import { getPresignPut, setPorts } from '../src/container';

afterEach(() => { vi.unstubAllEnvs(); setPorts({ storage: null }); });
it('does not offer unprocessed direct uploads when synchronous ingestion is selected', () => {
  vi.stubEnv('STORAGE_DRIVER', 's3');
  vi.stubEnv('DOCUMENT_INGESTION_MODE', 'sync');
  setPorts({ storage: null });
  expect(getPresignPut()).toBeNull();
});
