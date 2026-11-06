import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@oncobrief/domain';
import type { Querier } from '@oncobrief/db';
type TestSession = { orgId: string; userId: string; role: Role };
type TestMessage = { id: string; patientId: string; orgId: string; status: string; bodyRendered: string };
type TestConversation = { patientId: string | null; messages: { role: string; content: string; sources?: unknown[] }[] };
const state = vi.hoisted(() => ({
  session: null as TestSession | null,
  message: null as TestMessage | null,
  conversation: null as TestConversation | null,
  document: { id: 'd' } as { id: string } | null,
  gate: { ok: true, blockers: [] as string[] },
  synth: vi.fn(async () => ({ audioBase64: 'audio', sampleRate: 22050 })),
  synthWithRetry: vi.fn(async () => ({ audioBase64: 'retry_audio', sampleRate: 22050 })),
  stt: vi.fn(async () => ({ transcript: 'Direct STT transcript', languageCode: 'en-IN' })),
  sttWithRetry: vi.fn(async () => ({ transcript: 'Patient has pain', languageCode: 'en-IN' })),
  resolvedLocalized: null as { text: string; locale: string; templateCode: string } | null,
}));
vi.mock('@/lib/session', () => ({ getSession: async () => state.session, tenantCtx: (s: TestSession) => s }));
vi.mock('@oncobrief/db', () => ({
  withTenant: async (_: unknown, fn: (q: Querier) => unknown) => fn({} as Querier),
  getMessage: async () => state.message,
  checkMessageGate: async () => state.gate,
  getConversation: async () => state.conversation,
  getPatient: async () => ({ id: 'patient' }),
  getDocument: async () => state.document,
  resolveLocalizedMessageText: async (_q: unknown, _m: string, l: string) =>
    state.resolvedLocalized ?? (state.message ? { text: state.message.bodyRendered, locale: l, templateCode: 'appointment_reminder' } : null),
}));
vi.mock('@oncobrief/adapters', () => ({
  sarvamTts: state.synth,
  sarvamTtsWithRetry: state.synthWithRetry,
  sarvamStt: state.stt,
  sarvamSttWithRetry: state.sttWithRetry,
  SarvamError: class extends Error { retryable = false; },
  isSarvamConfigured: () => true,
  generateAudibleFallbackWav: vi.fn(() => 'b64wav'),
}));
import { POST as assistant } from '@/app/api/v1/assistant/voice/tts/route';
import { POST as continuity } from '@/app/api/v1/continuity/tts/route';
import { POST as stt, GET as sttGet } from '@/app/api/v1/assistant/voice/stt/route';
const req = (body: unknown) => new Request('http://localhost/tts', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  state.session = { orgId: 'org', userId: 'user', role: 'coordinator' };
  state.message = { id: 'm', patientId: 'p', orgId: 'org', status: 'approved', bodyRendered: 'Authoritative reminder' };
  state.conversation = null;
  state.gate = { ok: true, blockers: [] };
  state.resolvedLocalized = null;
});
describe('TTS authoritative scope', () => {
  it('rejects arbitrary text without an owned conversation', async () => { expect((await assistant(req({ text: 'Any PHI' }))).status).toBe(400); expect(state.synth).not.toHaveBeenCalled(); });
  it('rejects a missing or other tenant continuity message before provider dispatch', async () => { state.message = null; expect((await continuity(req({ messageId: 'm', patientId: 'p' }))).status).toBe(404); expect(state.synth).not.toHaveBeenCalled(); });
  it('synthesizes server message text and rejects a patient mismatch', async () => {
    expect((await continuity(req({ messageId: 'm', patientId: 'other' }))).status).toBe(404);
    const res = await continuity(req({ messageId: 'm', patientId: 'p', text: 'tampered', languageCode: 'hi-IN' }));
    expect(res.status).toBe(200);
    expect(state.synthWithRetry).toHaveBeenCalledWith(expect.objectContaining({ text: 'Authoritative reminder' }), 1);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
  it('blocks withdrawn message sources', async () => { state.gate = { ok: false, blockers: ['withdrawn'] }; expect((await continuity(req({ messageId: 'm', patientId: 'p' }))).status).toBe(409); expect(state.synth).not.toHaveBeenCalled(); });
  it('only reads a saved assistant answer in an owned conversation', async () => { state.conversation = { patientId: 'p', messages: [{ role: 'assistant', content: 'Saved answer' }] }; expect((await assistant(req({ conversationId: 'c', text: 'tampered' }))).status).toBe(404); expect((await assistant(req({ conversationId: 'c', text: 'Saved answer' }))).status).toBe(200); });
  it.each([null, [], { text: 42 }])('rejects malformed bodies %s', async (body) => { expect((await assistant(req(body))).status).toBe(400); });
});

it('returns only gate-validated server text for a provider fallback', async () => {
  state.synthWithRetry.mockRejectedValueOnce(new Error('provider unavailable'));
  state.synth.mockRejectedValueOnce(new Error('provider unavailable'));
  const response = await continuity(req({ messageId: 'm', patientId: 'p', text: 'tampered' }));
  expect(response.status).toBe(503);
  const data = await response.json();
  expect(data.fallbackText).toBe('Authoritative reminder');
  expect(data.localizedText).toBe('Authoritative reminder');
});

it('blocks saved assistant speech after source withdrawal', async () => {
  state.document = null;
  state.conversation = { patientId: 'p', messages: [{ role: 'assistant', content: 'Saved PHI', sources: [{ documentId: 'd' }] }] };
  expect((await assistant(req({ conversationId: 'c', text: 'Saved PHI' }))).status).toBe(409);
  expect(state.synthWithRetry).not.toHaveBeenCalled();
});

describe('STT endpoint security and retry (TASK-01.03)', () => {
  const makeSttReq = (file: Blob | null, lang = 'en-IN') => {
    const fd = new FormData();
    if (file) fd.append('audio', file, 'test.webm');
    fd.append('languageCode', lang);
    return new Request('http://localhost/api/v1/assistant/voice/stt', {
      method: 'POST',
      body: fd,
    });
  };

  it('reports configured status on GET', async () => {
    const res = await sttGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true });
  });

  it('rejects unauthenticated STT requests with 401', async () => {
    state.session = null;
    const res = await stt(makeSttReq(new Blob([new Uint8Array(200)], { type: 'audio/webm' })));
    expect(res.status).toBe(401);
  });

  it('rejects roles lacking patient:read with 403 forbidden', async () => {
    state.session = { orgId: 'org', userId: 'user', role: 'platform_admin' };
    const res = await stt(makeSttReq(new Blob([new Uint8Array(200)], { type: 'audio/webm' })));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error?.code).toBe('forbidden');
  });

  it('rejects audio uploads exceeding 10MB with 413 before buffer allocation', async () => {
    const oversizedBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'audio/webm' });
    const res = await stt(makeSttReq(oversizedBlob));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error?.code).toBe('audio_too_large');
    expect(state.sttWithRetry).not.toHaveBeenCalled();
  });

  it('rejects audio uploads under 100 bytes with 400 audio_too_short', async () => {
    const tinyBlob = new Blob([new Uint8Array(50)], { type: 'audio/webm' });
    const res = await stt(makeSttReq(tinyBlob));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error?.code).toBe('audio_too_short');
    expect(state.sttWithRetry).not.toHaveBeenCalled();
  });

  it('uses sarvamSttWithRetry and returns valid transcript', async () => {
    const validBlob = new Blob([new Uint8Array(250)], { type: 'audio/webm' });
    const res = await stt(makeSttReq(validBlob, 'ta-IN'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcript).toBe('Patient has pain');
    expect(data.languageCode).toBe('en-IN');
    expect(data.provider).toBe('sarvam');
    expect(state.sttWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ languageCode: 'ta-IN' }),
      1,
    );
  });
});

describe('Continuity 11-locale TTS voice preview (TASK-01.04)', () => {
  it('resolves localized message text and invokes sarvamTtsWithRetry with target language', async () => {
    state.resolvedLocalized = {
      text: 'உங்கள் மருத்துவ சந்திப்பு 2026-11-05 அன்று உள்ளது.',
      locale: 'ta-IN',
      templateCode: 'appointment_reminder',
    };

    const res = await continuity(
      req({ messageId: 'm', patientId: 'p', languageCode: 'ta-IN' }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.audioBase64).toBe('retry_audio');
    expect(data.localizedText).toBe('உங்கள் மருத்துவ சந்திப்பு 2026-11-05 அன்று உள்ளது.');
    expect(data.languageCode).toBe('ta-IN');
    expect(state.synthWithRetry).toHaveBeenCalledWith(
      {
        text: 'உங்கள் மருத்துவ சந்திப்பு 2026-11-05 அன்று உள்ளது.',
        languageCode: 'ta-IN',
      },
      1,
    );
  });
});
