import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('TASK-03.03: Truthful AI Provider Status and Transparency Endpoint', () => {
  it('reports truthful non-live verification tiers when running in offline fallback / simulated mode', async () => {
    const originalSarvamKey = process.env.SARVAM_API_KEY;
    const originalAwsKey = process.env.AWS_ACCESS_KEY_ID;
    const originalBedrock = process.env.BEDROCK_MODEL_ID;
    const originalNvidia = process.env.NVIDIA_API_KEY;

    try {
      delete process.env.SARVAM_API_KEY;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.BEDROCK_MODEL_ID;
      delete process.env.NVIDIA_API_KEY;
      process.env.OCR_DRIVER = 'local-pdf';
      process.env.EXTRACTION_DRIVER = 'rule';
      process.env.ABDM_DRIVER = 'simulated';
      process.env.DELIVERY_DRIVER = 'simulated';

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.summary.liveConfiguredCount).toBe(0);

      // Verify that no provider in fallback/simulation falsely claims "Live Verified" or "Contract/Sandbox Verified"
      for (const p of data.providers) {
        expect(p.credentialsPresent).toBe(false);
        expect(p.verificationTier).not.toBe('Live Verified');
        expect(p.verificationTier).not.toBe('Contract/Sandbox Verified');
        expect(p.verificationTier).toMatch(/Not Live/i);
      }

      // Check specific ports
      const ocr = data.providers.find((p: { port: string }) => p.port === 'ocr');
      expect(ocr.activeMode).toBe('fallback');
      expect(ocr.activeProviderName).toContain('LocalMultimodalOcrAdapter');

      const extractor = data.providers.find((p: { port: string }) => p.port === 'extractor');
      expect(extractor.configuredDriver).toBe('rule');
      expect(extractor.activeMode).toBe('fallback');
      expect(extractor.activeProviderName).toContain('RuleBasedExtractor');

      const delivery = data.providers.find((p: { port: string }) => p.port === 'outbound_delivery');
      expect(delivery.activeMode).toBe('simulated_loopback');
      expect(delivery.disclosureNote).toContain('Simulated delivery');
    } finally {
      if (originalSarvamKey !== undefined) process.env.SARVAM_API_KEY = originalSarvamKey;
      if (originalAwsKey !== undefined) process.env.AWS_ACCESS_KEY_ID = originalAwsKey;
      if (originalBedrock !== undefined) process.env.BEDROCK_MODEL_ID = originalBedrock;
      if (originalNvidia !== undefined) process.env.NVIDIA_API_KEY = originalNvidia;
    }
  });

  it('distinguishes configured credentials from live verification', async () => {
    const originalSarvamKey = process.env.SARVAM_API_KEY;

    try {
      process.env.SARVAM_API_KEY = 'sk-mock-credential-for-test';
      process.env.OCR_DRIVER = 'sarvam';

      const res = await GET();
      const data = await res.json();

      const ocr = data.providers.find((p: { port: string }) => p.port === 'ocr');
      expect(ocr.credentialsPresent).toBe(true);
      expect(ocr.activeMode).toBe('live');
      expect(ocr.activeProviderName).toContain('Sarvam Vision');

      // The key was provided, but NO live external call has been verified!
      // Must NOT overclaim "Live Verified"!
      expect(ocr.verificationTier).not.toBe('Live Verified');
      expect(ocr.verificationTier).toContain('Not Live Verified');

      // Security check: must NEVER leak the secret key value
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain('sk-mock-credential-for-test');
    } finally {
      if (originalSarvamKey !== undefined) {
        process.env.SARVAM_API_KEY = originalSarvamKey;
      } else {
        delete process.env.SARVAM_API_KEY;
      }
    }
  });

  it('honors EXTRACTION_DRIVER in configuredDriver reporting', async () => {
    const originalExtraction = process.env.EXTRACTION_DRIVER;
    const originalExtractor = process.env.EXTRACTOR_DRIVER;

    try {
      delete process.env.EXTRACTOR_DRIVER;
      process.env.EXTRACTION_DRIVER = 'rule';

      const res = await GET();
      const data = await res.json();

      const extractor = data.providers.find((p: { port: string }) => p.port === 'extractor');
      expect(extractor.configuredDriver).toBe('rule');
    } finally {
      if (originalExtraction !== undefined) {
        process.env.EXTRACTION_DRIVER = originalExtraction;
      } else {
        delete process.env.EXTRACTION_DRIVER;
      }
      if (originalExtractor !== undefined) {
        process.env.EXTRACTOR_DRIVER = originalExtractor;
      } else {
        delete process.env.EXTRACTOR_DRIVER;
      }
    }
  });
});
