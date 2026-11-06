import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceTtsService } from '../src/voice-tts';
import type { PatientPortalApiClient } from '../src/api-client';

describe('MOB-016: Multilingual Voice Reminders & Scoped Voice TTS (REQ-MOB-030)', () => {
  it('invokes backend voice-tts API with messageId and target language', async () => {
    let ttsParams: { messageId?: string; language?: string } | null = null;
    const mockClient = {
      async synthesizeVoiceTts(params: { messageId?: string; language?: string; text?: string }) {
        ttsParams = params;
        return {
          audioBase64: 'UklGRi4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
          mimeType: 'audio/wav',
          language: params.language || 'en',
          durationEstimateMs: 2500,
          transcript: 'Please bring your outside histopathology slide blocks.',
        };
      },
    } as unknown as PatientPortalApiClient;

    const service = new VoiceTtsService({ client: mockClient, mode: 'connected' });
    const res = await service.synthesize({
      messageId: 'msg-approved-01',
      language: 'en',
    });

    assert.equal(res.language, 'en');
    assert.equal(res.mimeType, 'audio/wav');
    assert.ok(res.audioBase64.length > 0);
    assert.equal(res.transcript, 'Please bring your outside histopathology slide blocks.');
    assert.deepEqual(ttsParams, {
      messageId: 'msg-approved-01',
      language: 'en',
    });
  });

  it('supports Tamil language synthesis (ta-IN)', async () => {
    let ttsParams: { language?: string } | null = null;
    const mockClient = {
      async synthesizeVoiceTts(params: { messageId?: string; language?: string }) {
        ttsParams = params;
        return {
          audioBase64: 'UklGRi4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
          mimeType: 'audio/wav',
          language: 'ta',
          durationEstimateMs: 3200,
          transcript: 'தயவுசெய்து உங்கள் பயாப்ஸி அறிக்கையை எடுத்து வாருங்கள்.',
        };
      },
    } as unknown as PatientPortalApiClient;

    const service = new VoiceTtsService({ client: mockClient, mode: 'connected' });
    const res = await service.synthesize({
      messageId: 'msg-approved-02',
      language: 'ta',
    });

    assert.equal(res.language, 'ta');
    assert.ok(res.transcript.includes('பயாப்ஸி'));
    assert.ok(ttsParams);
    assert.equal((ttsParams as { language?: string }).language, 'ta');
  });

  it('provides offline fallback in demo mode without network requests', async () => {
    const service = new VoiceTtsService({ mode: 'demo' });
    const res = await service.synthesize({
      text: 'Please remember to bring your referral letter.',
      language: 'en',
    });

    assert.equal(res.language, 'en');
    assert.equal(res.mimeType, 'audio/wav');
    assert.ok(res.audioBase64.length > 0);
    assert.equal(res.transcript, 'Please remember to bring your referral letter.');
  });
});
