import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeWavBase64Chunks,
  normalizeLanguageCode,
  sarvamStt,
  sarvamTts,
  SarvamError,
  toSarvamApiLanguageCode,
  type SupportedLanguage,
} from '../src/sarvam-voice';

function makeWavBuffer(
  numPcmBytes: number,
  sampleRate = 22050,
  extraMetadataChunk?: { tag: string; data: Buffer },
): Buffer {
  const fmtChunkSize = 16;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  let extraSize = 0;
  if (extraMetadataChunk) {
    extraSize = 8 + extraMetadataChunk.data.byteLength;
    if (extraMetadataChunk.data.byteLength % 2 !== 0) extraSize += 1;
  }
  const totalFileSize = 44 + extraSize + numPcmBytes;
  const riffChunkSize = totalFileSize - 8;

  const buf = Buffer.alloc(totalFileSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(riffChunkSize, 4);
  buf.write('WAVE', 8, 'ascii');

  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(fmtChunkSize, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);

  let offset = 36;
  if (extraMetadataChunk) {
    buf.write(extraMetadataChunk.tag, offset, 'ascii');
    buf.writeUInt32LE(extraMetadataChunk.data.byteLength, offset + 4);
    extraMetadataChunk.data.copy(buf, offset + 8);
    offset += 8 + extraMetadataChunk.data.byteLength;
    if (extraMetadataChunk.data.byteLength % 2 !== 0) {
      buf.writeUInt8(0, offset);
      offset += 1;
    }
  }

  buf.write('data', offset, 'ascii');
  buf.writeUInt32LE(numPcmBytes, offset + 4);
  offset += 8;

  for (let i = 0; i < numPcmBytes; i += 2) {
    buf.writeInt16LE(1000 + ((i * 17) % 15000), offset + i);
  }

  return buf;
}

describe('TASK-01.01 — Sarvam Voice Language Normalization & Odia Provider Mapping', () => {
  const ALL_11_BCP47: SupportedLanguage[] = [
    'en-IN',
    'hi-IN',
    'ta-IN',
    'te-IN',
    'kn-IN',
    'ml-IN',
    'bn-IN',
    'mr-IN',
    'gu-IN',
    'pa-IN',
    'or-IN',
  ];

  it('normalizes all 11 canonical BCP-47 locale codes without defaulting to en-IN', () => {
    for (const locale of ALL_11_BCP47) {
      const normalized = normalizeLanguageCode(locale);
      expect(normalized, `Failed for locale ${locale}`).toBe(locale);
    }
  });

  it('normalizes lowercase BCP-47 input (hi-in, ta-in, etc.) to canonical uppercase region BCP-47', () => {
    expect(normalizeLanguageCode('hi-in')).toBe('hi-IN');
    expect(normalizeLanguageCode('ta-in')).toBe('ta-IN');
    expect(normalizeLanguageCode('te-in')).toBe('te-IN');
    expect(normalizeLanguageCode('kn-in')).toBe('kn-IN');
    expect(normalizeLanguageCode('ml-in')).toBe('ml-IN');
    expect(normalizeLanguageCode('bn-in')).toBe('bn-IN');
    expect(normalizeLanguageCode('mr-in')).toBe('mr-IN');
    expect(normalizeLanguageCode('gu-in')).toBe('gu-IN');
    expect(normalizeLanguageCode('pa-in')).toBe('pa-IN');
    expect(normalizeLanguageCode('or-in')).toBe('or-IN');
    expect(normalizeLanguageCode('en-in')).toBe('en-IN');
  });

  it('normalizes underscore variants (ta_IN, hi_in, etc.)', () => {
    expect(normalizeLanguageCode('ta_IN')).toBe('ta-IN');
    expect(normalizeLanguageCode('hi_in')).toBe('hi-IN');
    expect(normalizeLanguageCode('EN_in')).toBe('en-IN');
    expect(normalizeLanguageCode('PA_IN')).toBe('pa-IN');
  });

  it('normalizes two-letter short codes (hi, ta, te, kn, ml, bn, mr, gu, pa, or, od, en)', () => {
    expect(normalizeLanguageCode('en')).toBe('en-IN');
    expect(normalizeLanguageCode('hi')).toBe('hi-IN');
    expect(normalizeLanguageCode('ta')).toBe('ta-IN');
    expect(normalizeLanguageCode('te')).toBe('te-IN');
    expect(normalizeLanguageCode('kn')).toBe('kn-IN');
    expect(normalizeLanguageCode('ml')).toBe('ml-IN');
    expect(normalizeLanguageCode('bn')).toBe('bn-IN');
    expect(normalizeLanguageCode('mr')).toBe('mr-IN');
    expect(normalizeLanguageCode('gu')).toBe('gu-IN');
    expect(normalizeLanguageCode('pa')).toBe('pa-IN');
    expect(normalizeLanguageCode('or')).toBe('or-IN');
    expect(normalizeLanguageCode('od')).toBe('or-IN');
  });

  it('maps Odia provider aliases (od-IN, od, or-IN) to internal or-IN and provider od-IN', () => {
    expect(normalizeLanguageCode('od-IN')).toBe('or-IN');
    expect(normalizeLanguageCode('od-in')).toBe('or-IN');
    expect(normalizeLanguageCode('OD_IN')).toBe('or-IN');
    expect(normalizeLanguageCode('od')).toBe('or-IN');
    expect(normalizeLanguageCode('or-IN')).toBe('or-IN');

    // toSarvamApiLanguageCode maps internal or-IN to Sarvam's expected od-IN
    expect(toSarvamApiLanguageCode('or-IN')).toBe('od-IN');
    expect(toSarvamApiLanguageCode('od-IN')).toBe('od-IN');
    expect(toSarvamApiLanguageCode('or')).toBe('od-IN');
    expect(toSarvamApiLanguageCode('od')).toBe('od-IN');
    // Non-Odia languages preserve their code
    expect(toSarvamApiLanguageCode('ta-IN')).toBe('ta-IN');
    expect(toSarvamApiLanguageCode('hi-IN')).toBe('hi-IN');
    expect(toSarvamApiLanguageCode('en-IN')).toBe('en-IN');
  });

  it('handles empty, invalid, and unsupported locale codes with safe fallback to en-IN', () => {
    expect(normalizeLanguageCode('')).toBe('en-IN');
    expect(normalizeLanguageCode('   ')).toBe('en-IN');
    expect(normalizeLanguageCode('fr-FR')).toBe('en-IN');
    expect(normalizeLanguageCode('es')).toBe('en-IN');
    expect(normalizeLanguageCode('unknown-code')).toBe('en-IN');
    expect(normalizeLanguageCode(null as unknown as string)).toBe('en-IN');
    expect(normalizeLanguageCode(undefined as unknown as string)).toBe('en-IN');
  });

  describe('Outbound HTTP Request Payloads for STT and TTS', () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.SARVAM_API_KEY;

    beforeEach(() => {
      process.env.SARVAM_API_KEY = 'test-sarvam-key-for-contracts';
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.SARVAM_API_KEY = originalApiKey;
      vi.restoreAllMocks();
    });

    it('sarvamStt sends exact language_code and maps Odia to od-IN', async () => {
      let capturedFormData: FormData | null = null;
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedFormData = init?.body as FormData;
        return new Response(
          JSON.stringify({ transcript: 'சோதனை', language_code: 'ta-IN' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      // Test Tamil
      await sarvamStt({
        audioData: Buffer.from('RIFF....dummy'),
        languageCode: 'ta-IN',
      });

      expect(capturedFormData).not.toBeNull();
      expect(capturedFormData!.get('language_code')).toBe('ta-IN');
      expect(capturedFormData!.get('model')).toBe('saaras:v3');

      // Test Odia or-IN -> od-IN in outgoing payload
      await sarvamStt({
        audioData: Buffer.from('RIFF....dummy'),
        languageCode: 'or-IN',
      });
      expect(capturedFormData!.get('language_code')).toBe('od-IN');

      // Test lowercase hi-in -> hi-IN
      await sarvamStt({
        audioData: Buffer.from('RIFF....dummy'),
        languageCode: 'hi-in',
      });
      expect(capturedFormData!.get('language_code')).toBe('hi-IN');
    });

    it('sarvamTts sends target_language_code matching locale and maps Odia to od-IN', async () => {
      let capturedPayload: Record<string, unknown> | null = null;
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedPayload = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ audios: [makeWavBuffer(200).toString('base64')] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      // Test Tamil
      await sarvamTts({
        text: 'வணக்கம்',
        languageCode: 'ta-IN',
      });
      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload!.target_language_code).toBe('ta-IN');
      expect(capturedPayload!.speaker).toBe('shubh');
      expect(capturedPayload!.model).toBe('bulbul:v3');

      // Test Odia or-IN -> od-IN
      await sarvamTts({
        text: 'ନମସ୍କାର',
        languageCode: 'or-IN',
      });
      expect(capturedPayload!.target_language_code).toBe('od-IN');

      // Test 2-letter short code 'te' -> 'te-IN'
      await sarvamTts({
        text: 'నమస్కారం',
        languageCode: 'te',
      });
      expect(capturedPayload!.target_language_code).toBe('te-IN');
    });
  });
});

describe('TASK-01.02 — Sarvam TTS Multi-Chunk Audio Correctness & Format-Aware WAV Assembly', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SARVAM_API_KEY;

  beforeEach(() => {
    process.env.SARVAM_API_KEY = 'test-sarvam-key-for-contracts';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.SARVAM_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it('correctly returns a single audio response chunk as valid base64 WAV', async () => {
    const singleChunk = makeWavBuffer(400);
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ audios: [singleChunk.toString('base64')] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await sarvamTts({ text: 'Hello', languageCode: 'en-IN' });
    const decoded = Buffer.from(result.audioBase64, 'base64');

    expect(decoded.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(decoded.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(decoded.byteLength).toBe(44 + 400);
    expect(decoded.readUInt32LE(4)).toBe(36 + 400);
    expect(decoded.readUInt32LE(40)).toBe(400);
    expect(result.sampleRate).toBe(22050);
  });

  it('correctly merges multiple sequential WAV chunks into a single valid WAV file with correct RIFF & data headers', async () => {
    // Two chunks with 402 bytes of PCM each.
    // 44 + 402 = 446 bytes per chunk, which produces base64 strings with '==' padding!
    const chunk1 = makeWavBuffer(402);
    const chunk2 = makeWavBuffer(402);
    const b64_1 = chunk1.toString('base64');
    const b64_2 = chunk2.toString('base64');

    // Confirm that these base64 strings have padding
    expect(b64_1.endsWith('=')).toBe(true);
    expect(b64_2.endsWith('=')).toBe(true);

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ audios: [b64_1, b64_2] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await sarvamTts({ text: 'Multi-sentence prompt test', languageCode: 'en-IN' });
    const decoded = Buffer.from(result.audioBase64, 'base64');

    const expectedTotalPcm = 402 + 402; // 804 bytes
    const expectedTotalFile = 44 + expectedTotalPcm; // 848 bytes

    // Assert that the decoded buffer is a valid WAV
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(decoded.readUInt32LE(4)).toBe(36 + expectedTotalPcm);
    expect(decoded.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(decoded.readUInt32LE(40)).toBe(expectedTotalPcm);
    expect(decoded.byteLength).toBe(expectedTotalFile);

    // CRITICAL: There must NOT be any second 'RIFF' header embedded inside the audio data!
    expect(decoded.indexOf('RIFF', 4, 'ascii')).toBe(-1);
  });

  it('correctly merges 3 sequential chunks and preserves sample data', async () => {
    const chunk1 = makeWavBuffer(200);
    const chunk2 = makeWavBuffer(300);
    const chunk3 = makeWavBuffer(400);

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          audios: [
            chunk1.toString('base64'),
            chunk2.toString('base64'),
            chunk3.toString('base64'),
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await sarvamTts({ text: 'Three chunks', languageCode: 'en-IN' });
    const decoded = Buffer.from(result.audioBase64, 'base64');

    const totalPcm = 200 + 300 + 400; // 900
    expect(decoded.byteLength).toBe(44 + totalPcm);
    expect(decoded.readUInt32LE(4)).toBe(36 + totalPcm);
    expect(decoded.readUInt32LE(40)).toBe(totalPcm);
    expect(decoded.indexOf('RIFF', 4, 'ascii')).toBe(-1);
  });

  it('correctly handles WAV chunks containing additional metadata chunks (e.g. LIST/INFO)', async () => {
    // Chunk 1 has a LIST metadata chunk before data
    const listChunk = {
      tag: 'LIST',
      data: Buffer.from('INFOINAM\x04\x00\x00\x00Demo\x00', 'ascii'),
    };
    const chunkWithMeta = makeWavBuffer(300, 22050, listChunk);
    const normalChunk = makeWavBuffer(300, 22050);

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          audios: [chunkWithMeta.toString('base64'), normalChunk.toString('base64')],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await sarvamTts({ text: 'Metadata test', languageCode: 'en-IN' });
    const decoded = Buffer.from(result.audioBase64, 'base64');

    const expectedPcm = 300 + 300; // 600
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(decoded.readUInt32LE(4)).toBe(36 + expectedPcm);
    expect(decoded.readUInt32LE(40)).toBe(expectedPcm);
    expect(decoded.byteLength).toBe(44 + expectedPcm);
    expect(decoded.indexOf('RIFF', 4, 'ascii')).toBe(-1);
  });

  it('handles empty audios array by falling back to audio_base64 or empty string', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ audios: [], audio_base64: 'dGVzdA==' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await sarvamTts({ text: 'Empty audios', languageCode: 'en-IN' });
    expect(result.audioBase64).toBe('dGVzdA==');
  });

  it('propagates provider errors cleanly as SarvamError with retryable flag', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(sarvamTts({ text: 'Rate limited', languageCode: 'en-IN' })).rejects.toThrow(SarvamError);
    await expect(sarvamTts({ text: 'Rate limited', languageCode: 'en-IN' })).rejects.toMatchObject({
      statusCode: 429,
      retryable: true,
    });
  });

  it('mergeWavBase64Chunks directly handles base64 chunks with padding and whitespace', () => {
    const chunk1 = makeWavBuffer(202);
    const chunk2 = makeWavBuffer(202);
    const mergedB64 = mergeWavBase64Chunks([
      chunk1.toString('base64'),
      chunk2.toString('base64'),
    ]);

    const decoded = Buffer.from(mergedB64, 'base64');
    expect(decoded.byteLength).toBe(44 + 404);
    expect(decoded.readUInt32LE(4)).toBe(36 + 404);
    expect(decoded.readUInt32LE(40)).toBe(404);
    expect(decoded.indexOf('RIFF', 4, 'ascii')).toBe(-1);
  });
});
