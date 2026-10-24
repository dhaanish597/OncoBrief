import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOcr, setPorts } from '../src/container';

afterEach(() => {
  vi.unstubAllEnvs();
  setPorts({ ocr: null });
});
describe('web OCR configuration', () => {
  it('keeps offline auto OCR local when only object storage credentials exist', () => {
    vi.stubEnv('OCR_DRIVER', 'auto');
    vi.stubEnv('SARVAM_API_KEY', '');
    vi.stubEnv('AWS_ACCESS_KEY_ID', '');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', '');
    vi.stubEnv('STORAGE_DRIVER', 'fs');
    vi.stubEnv('STORAGE_S3_ACCESS_KEY_ID', 'minio-local');
    vi.stubEnv('STORAGE_S3_SECRET_ACCESS_KEY', 'minio-local-secret');
    setPorts({ ocr: null });
    expect(getOcr().name).toBe('local-multimodal');
  });
});
