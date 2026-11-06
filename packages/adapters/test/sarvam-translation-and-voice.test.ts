import { describe, expect, it, vi } from 'vitest';
import {
  ELEVEN_LOCALE_TEMPLATES,
  SHORT_ELEVEN_LOCALES,
  SarvamTranslationAdapter,
  generateAudibleFallbackWav,
  toBcp47IndicCode,
} from '../src/index';

describe('Eleven-Language Continuity Templates, Sarvam Translation & Audible WAV Fallback (TASK-012)', () => {
  it('provides native-script appointment_reminder and opd_slot_offer_v1 templates for all 11 supported languages', () => {
    expect(SHORT_ELEVEN_LOCALES).toHaveLength(11);
    for (const shortCode of SHORT_ELEVEN_LOCALES) {
      const bcp47 = toBcp47IndicCode(shortCode);
      const reminderShort = ELEVEN_LOCALE_TEMPLATES.appointment_reminder[shortCode];
      const reminderBcp47 = ELEVEN_LOCALE_TEMPLATES.appointment_reminder[bcp47];
      expect(reminderShort, `appointment_reminder missing for ${shortCode}`).toBeDefined();
      expect(reminderBcp47, `appointment_reminder missing for ${bcp47}`).toBeDefined();
      expect(reminderShort).toContain('{{appointment_date}}');
      expect(reminderShort).toContain('{{appointment_location}}');
      expect(reminderShort).toContain('{{records_office_phone}}');

      const offerShort = ELEVEN_LOCALE_TEMPLATES.opd_slot_offer_v1[shortCode];
      expect(offerShort, `opd_slot_offer_v1 missing for ${shortCode}`).toBeDefined();
      expect(offerShort).toContain('{{appointment_date}}');
    }
  });

  it('calls Sarvam /translate API with mayura:v1 when apiKey is configured', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ translated_text: 'உங்கள் சந்திப்பு உறுதி செய்யப்பட்டது' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const adapter = new SarvamTranslationAdapter({
      apiKey: 'test-sarvam-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await adapter.translate({
      text: 'Your appointment is confirmed',
      sourceLanguageCode: 'en-IN',
      targetLanguageCode: 'ta',
    });

    expect(result.provider).toBe('sarvam-mayura');
    expect(result.targetLanguageCode).toBe('ta-IN');
    expect(result.translatedText).toBe('உங்கள் சந்திப்பு உறுதி செய்யப்பட்டது');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('generates an audible 16-bit PCM WAV buffer with non-zero amplitude (> 10000)', () => {
    const b64 = generateAudibleFallbackWav('Test reminder', 'hi-IN');
    const buf = Buffer.from(b64, 'base64');

    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(buf.byteLength).toBeGreaterThan(1000);

    let maxAmplitude = 0;
    for (let offset = 44; offset + 1 < buf.byteLength; offset += 2) {
      const sample = Math.abs(buf.readInt16LE(offset));
      if (sample > maxAmplitude) maxAmplitude = sample;
    }

    expect(maxAmplitude).toBeGreaterThan(10000);
  });
});
