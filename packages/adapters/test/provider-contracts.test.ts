import { describe, expect, it } from 'vitest';
import {
  decryptPayload,
  encryptPayload,
  generateEphemeralKeyPair,
  generateAudibleFallbackWav,
  SarvamTranslationAdapter,
  SimulatedAbdmGatewayAdapter,
  WebhookDeliveryAdapter,
} from '../src';

describe('Wave 3 External Provider & Interoperability Contracts (TASK-024, TASK-025, TASK-026)', () => {
  describe('TASK-024: WebhookDeliveryAdapter (Twilio SMS/WhatsApp & Signed HTTP Webhook)', () => {
    it('dispatches HMAC-SHA256 signed JSON payload when webhookUrl is configured', async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody = '';

      const adapter = new WebhookDeliveryAdapter({
        channel: 'sms',
        webhookUrl: 'https://gateway.hospital.example/sms-outbox',
        webhookSecret: 'test-webhook-secret-key',
        fetchImpl: async (_url, init) => {
          capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
          capturedBody = String(init?.body ?? '');
          return new Response(
            JSON.stringify({ externalRef: 'gw-msg-9912' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        },
      });

      expect(adapter.isLiveConfigured).toBe(true);
      const res = await adapter.send({
        patientMessageId: '11111111-2222-3333-4444-555555555555',
        channel: 'sms',
        recipientRef: '+919876543210',
        body: 'Administrative appointment reminder: 2026-05-20 at 10:00 in OPD Room 1.',
      });

      expect(res.simulated).toBe(false);
      expect(res.status).toBe('accepted');
      expect(res.externalRef).toBe('gw-msg-9912');
      expect(capturedHeaders['x-oncobrief-delivery-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(JSON.parse(capturedBody).recipientRef).toBe('+919876543210');
    });

    it('dispatches Basic-Auth form-urlencoded request when Twilio credentials are configured', async () => {
      let capturedUrl = '';
      let capturedAuth = '';
      let capturedForm = '';

      const adapter = new WebhookDeliveryAdapter({
        channel: 'whatsapp',
        twilioAccountSid: 'AC1234567890abcdef',
        twilioAuthToken: 'secret-token-xyz',
        twilioFromNumber: '+14155238886',
        fetchImpl: async (url, init) => {
          capturedUrl = String(url);
          capturedAuth = String((init?.headers as Record<string, string>)?.['authorization'] ?? '');
          capturedForm = String(init?.body ?? '');
          return new Response(
            JSON.stringify({ sid: 'SM9876543210twilio' }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        },
      });

      const res = await adapter.send({
        patientMessageId: '11111111-2222-3333-4444-555555555555',
        channel: 'whatsapp',
        recipientRef: '+919876543210',
        body: 'Confirmed OPD slot on 2026-05-20.',
      });

      expect(res.simulated).toBe(false);
      expect(res.status).toBe('accepted');
      expect(res.externalRef).toBe('SM9876543210twilio');
      expect(capturedUrl).toContain('AC1234567890abcdef/Messages.json');
      expect(capturedAuth).toMatch(/^Basic /);
      expect(capturedForm).toContain('To=whatsapp%3A%2B919876543210');
    });

    it('falls back to simulated: true when no external webhook or Twilio credentials are provided', async () => {
      const adapter = new WebhookDeliveryAdapter({
        channel: 'sms',
        webhookUrl: '',
        twilioAccountSid: '',
      });

      expect(adapter.isLiveConfigured).toBe(false);
      const res = await adapter.send({
        patientMessageId: '11111111-2222-3333-4444-555555555555',
        channel: 'sms',
        recipientRef: 'patient-01',
        body: 'Reminder text',
      });

      expect(res.simulated).toBe(true);
      expect(res.status).toBe('accepted');
      expect(res.externalRef).toContain('sim:sms:');
    });
  });

  describe('TASK-025: ABDM M2/M3 & Fidelius Curve25519 ECDH Cryptographic Round-Trip', () => {
    it('completes a full Curve25519 ECDH + HKDF-SHA256 + AES-256-GCM encryption and decryption round-trip', () => {
      const senderKeys = generateEphemeralKeyPair();
      const receiverKeys = generateEphemeralKeyPair();

      const fhirBundleJson = JSON.stringify({
        resourceType: 'Bundle',
        type: 'document',
        id: 'nrces-abdm-v6.5-bundle-01',
        entry: [
          {
            resource: {
              resourceType: 'Observation',
              code: { text: 'Hemoglobin' },
              valueQuantity: { value: 12.6, unit: 'g/dL' },
            },
          },
        ],
      });

      const encrypted = encryptPayload(
        fhirBundleJson,
        senderKeys.privateKey,
        senderKeys.nonceBase64,
        receiverKeys.publicKeyBase64,
        receiverKeys.nonceBase64,
      );

      expect(encrypted.content).not.toContain('Hemoglobin');

      const decrypted = decryptPayload(
        encrypted.content,
        receiverKeys.privateKey,
        receiverKeys.nonceBase64,
        senderKeys.publicKeyBase64,
        senderKeys.nonceBase64,
        encrypted.checksum,
      );

      expect(decrypted).toBe(fhirBundleJson);
    });

    it('verifies SimulatedAbdmGatewayAdapter driver and M2/M3 interface readiness', () => {
      const gateway = new SimulatedAbdmGatewayAdapter({
        callbackBaseUrl: 'http://localhost:3000',
        hipId: 'HIP-ONCO-01',
        hiuId: 'HIU-ONCO-01',
        dispatchDirectHttp: false,
      });

      expect(gateway.driver).toBe('simulated');
      expect(typeof gateway.initiateConsentRequest).toBe('function');
      expect(typeof gateway.requestHealthInformation).toBe('function');
      expect(typeof gateway.linkCareContext).toBe('function');
    });
  });

  describe('TASK-026: Sarvam Voice & Translation Adapter Contracts & Transparent Fallbacks', () => {
    it('returns non-silent audible PCM WAV fallback when SARVAM_API_KEY is absent', async () => {
      const b64 = generateAudibleFallbackWav(
        'আপনার পরবর্তী অ্যাপয়েন্টমেন্ট আগামীকাল सुबह १० बजे।',
        'bn-IN',
      );
      const audioBuffer = Buffer.from(b64, 'base64');
      expect(audioBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(audioBuffer.subarray(8, 12).toString('ascii')).toBe('WAVE');
      expect(audioBuffer.length).toBeGreaterThan(8000);
    });

    it('translates administrative messages across all 11 supported Indic locales deterministically', async () => {
      const translator = new SarvamTranslationAdapter({ apiKey: '' });
      const locales = [
        'en-IN',
        'hi-IN',
        'bn-IN',
        'ta-IN',
        'te-IN',
        'mr-IN',
        'gu-IN',
        'kn-IN',
        'ml-IN',
        'pa-IN',
        'or-IN',
      ] as const;

      for (const locale of locales) {
        const res = await translator.translate({
          text: 'Your oncology OPD appointment is scheduled on 2026-05-20. Please bring your biopsy report.',
          sourceLanguageCode: 'en-IN',
          targetLanguageCode: locale,
        });
        expect(res.translatedText.trim().length).toBeGreaterThan(10);
      }
    });
  });
});
