import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chatCompletion,
  chatCompletionWithRetry,
  NvidiaLlmError,
  sarvamStt,
  sarvamTts,
  SarvamError,
} from '@oncobrief/adapters';

/**
 * Provider boundary tests. The evidence pipeline must degrade gracefully when
 * NVIDIA or Sarvam fail — never crash the chat.
 */

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NVIDIA_API_KEY = 'test-key';
  process.env.NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
  process.env.NVIDIA_MODEL = 'test-model';
  process.env.SARVAM_API_KEY = 'test-sarvam-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe('NVIDIA LLM provider', () => {
  it('returns the completion content on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'grounded answer' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await chatCompletion({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.content).toBe('grounded answer');
  });

  it('retries a transient 503 and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'recovered' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await chatCompletionWithRetry({ messages: [{ role: 'user', content: 'hi' }] }, 1);
    expect(result.content).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable 401 and throws NvidiaLlmError', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatCompletionWithRetry({ messages: [] }, 1)).rejects.toBeInstanceOf(NvidiaLlmError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a configuration error when the key is missing', async () => {
    delete process.env.NVIDIA_API_KEY;
    await expect(chatCompletion({ messages: [] })).rejects.toBeInstanceOf(NvidiaLlmError);
  });
});

describe('Sarvam voice provider', () => {
  it('transcribes audio on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ transcript: 'namaste doctor', language_code: 'hi-IN' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await sarvamStt({ audioData: Buffer.from('audio'), languageCode: 'hi-IN' });
    expect(result.transcript).toBe('namaste doctor');
    expect(result.languageCode).toBe('hi-IN');
  });

  it('raises SarvamError when the service fails (so the browser can take over)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await expect(sarvamStt({ audioData: Buffer.from('audio') })).rejects.toBeInstanceOf(SarvamError);
  });

  it('synthesises speech on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ audio_base64: 'AAAA', sample_rate: 24000 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await sarvamTts({ text: 'hello', languageCode: 'ta-IN' });
    expect(result.audioBase64).toBe('AAAA');
  });

  it('raises when the key is missing', async () => {
    delete process.env.SARVAM_API_KEY;
    await expect(sarvamTts({ text: 'hello', languageCode: 'en-IN' })).rejects.toBeInstanceOf(SarvamError);
  });
});
