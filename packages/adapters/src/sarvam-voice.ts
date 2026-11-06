export interface SarvamSttOptions {
  audioData: Buffer;
  languageCode?: string;
  model?: string;
  mimeType?: string;
  filename?: string;
}

export interface SarvamSttResult {
  transcript: string;
  languageCode: string;
}

export interface SarvamTtsOptions {
  text: string;
  languageCode: string;
  speaker?: string;
  model?: string;
}

export interface SarvamTtsResult {
  audioBase64: string;
  sampleRate: number;
}

export class SarvamError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'SarvamError';
  }
}

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
// Model ids verified against the live Sarvam API: saarika:v2 and bulbul:v2 are
// retired; these are the current defaults.
const DEFAULT_STT_MODEL = 'saaras:v3';
const DEFAULT_TTS_MODEL = 'bulbul:v3';
const DEFAULT_SPEAKER = 'shubh';

const SUPPORTED_LANGUAGES = [
  'en-IN', // English (India)
  'hi-IN', // Hindi
  'ta-IN', // Tamil
  'te-IN', // Telugu
  'kn-IN', // Kannada
  'ml-IN', // Malayalam
  'bn-IN', // Bengali
  'mr-IN', // Marathi
  'gu-IN', // Gujarati
  'pa-IN', // Punjabi
  'or-IN', // Odia
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(code as SupportedLanguage);
}

const SHORT_TO_BCP47: Record<string, SupportedLanguage> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  od: 'or-IN',
};

export function normalizeLanguageCode(code: string): SupportedLanguage {
  if (!code || typeof code !== 'string') return 'en-IN';
  const cleaned = code.trim().replace(/_/g, '-');
  if (!cleaned) return 'en-IN';
  if (isSupportedLanguage(cleaned)) return cleaned;
  const lower = cleaned.toLowerCase();
  if (SHORT_TO_BCP47[lower]) return SHORT_TO_BCP47[lower]!;
  if (lower === 'od-in') return 'or-IN';
  const parts = lower.split('-');
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const candidate = `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
    if (candidate === 'od-IN') return 'or-IN';
    if (isSupportedLanguage(candidate)) return candidate;
    if (SHORT_TO_BCP47[parts[0]]) return SHORT_TO_BCP47[parts[0]]!;
  }
  return 'en-IN';
}

export function toSarvamApiLanguageCode(code: string): string {
  const normalized = normalizeLanguageCode(code);
  return normalized === 'or-IN' ? 'od-IN' : normalized;
}

interface ParsedWav {
  format: {
    audioFormat: number;
    numChannels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
  };
  pcmData: Buffer;
}

function parseWavBuffer(buf: Buffer): ParsedWav | null {
  if (buf.byteLength < 44) return null;
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buf.subarray(8, 12).toString('ascii') !== 'WAVE') return null;

  let offset = 12;
  let format: ParsedWav['format'] | null = null;
  let pcmData: Buffer | null = null;

  while (offset + 8 <= buf.byteLength) {
    const chunkId = buf.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(buf.byteLength, chunkStart + chunkSize);

    if (chunkId === 'fmt ') {
      if (chunkSize >= 16 && chunkStart + 16 <= buf.byteLength) {
        format = {
          audioFormat: buf.readUInt16LE(chunkStart),
          numChannels: buf.readUInt16LE(chunkStart + 2),
          sampleRate: buf.readUInt32LE(chunkStart + 4),
          byteRate: buf.readUInt32LE(chunkStart + 8),
          blockAlign: buf.readUInt16LE(chunkStart + 12),
          bitsPerSample: buf.readUInt16LE(chunkStart + 14),
        };
      }
    } else if (chunkId === 'data') {
      pcmData = buf.subarray(chunkStart, chunkEnd);
    }

    const paddedSize = chunkSize + (chunkSize % 2);
    offset = chunkStart + paddedSize;
  }

  if (!format || !pcmData) return null;
  return { format, pcmData };
}

export function mergeWavBase64Chunks(chunks: string[]): string {
  if (!chunks || !Array.isArray(chunks)) return '';
  const filtered = chunks.map((c) => (c ? c.trim() : '')).filter(Boolean);
  if (filtered.length === 0) return '';
  if (filtered.length === 1) return filtered[0]!;

  const parsedChunks: ParsedWav[] = [];
  for (const b64 of filtered) {
    const buf = Buffer.from(b64, 'base64');
    const parsed = parseWavBuffer(buf);
    if (parsed) {
      parsedChunks.push(parsed);
    } else if (parsedChunks.length > 0 && buf.byteLength > 0) {
      parsedChunks.push({
        format: parsedChunks[0]!.format,
        pcmData: buf,
      });
    }
  }

  if (parsedChunks.length === 0) {
    return filtered[0] ?? '';
  }

  if (parsedChunks.length === 1) {
    return filtered[0]!;
  }

  const baseFormat = parsedChunks[0]!.format;
  const pcmBuffers: Buffer[] = [];
  let totalPcmBytes = 0;

  for (const item of parsedChunks) {
    pcmBuffers.push(item.pcmData);
    totalPcmBytes += item.pcmData.byteLength;
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + totalPcmBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(baseFormat.audioFormat, 20);
  header.writeUInt16LE(baseFormat.numChannels, 22);
  header.writeUInt32LE(baseFormat.sampleRate, 24);
  header.writeUInt32LE(baseFormat.byteRate, 28);
  header.writeUInt16LE(baseFormat.blockAlign, 32);
  header.writeUInt16LE(baseFormat.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(totalPcmBytes, 40);

  const mergedBuffer = Buffer.concat([header, ...pcmBuffers]);
  return mergedBuffer.toString('base64');
}

export function isSarvamConfigured(): boolean {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'your_key_here' && !apiKey.startsWith('your_'));
}

function getApiKey(): string {
  // Read lazily at request time; the key never leaves the server.
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_key_here' || apiKey.startsWith('your_')) {
    throw new SarvamError('SARVAM_API_KEY not configured', 500, false);
  }
  return apiKey;
}

export async function sarvamStt(options: SarvamSttOptions): Promise<SarvamSttResult> {
  const apiKey = getApiKey();
  const model = options.model ?? DEFAULT_STT_MODEL;
  const languageCode = normalizeLanguageCode(options.languageCode ?? 'en-IN');

  // Normalize MIME type to Sarvam API whitelist (strip codecs parameters like ;codecs=opus)
  const rawMime = (options.mimeType ?? 'audio/wav').split(';')[0]?.trim().toLowerCase() ?? 'audio/wav';
  const mimeType = rawMime.includes('webm')
    ? 'audio/webm'
    : rawMime.includes('mp4') || rawMime.includes('m4a')
      ? 'audio/mp4'
      : rawMime.includes('ogg') || rawMime.includes('opus')
        ? 'audio/ogg'
        : rawMime.includes('aac')
          ? 'audio/aac'
          : rawMime.includes('mp3') || rawMime.includes('mpeg')
            ? 'audio/mpeg'
            : 'audio/wav';

  const defaultFilename =
    mimeType === 'audio/webm'
      ? 'audio.webm'
      : mimeType === 'audio/mp4'
        ? 'audio.mp4'
        : mimeType === 'audio/ogg'
          ? 'audio.ogg'
          : mimeType === 'audio/aac'
            ? 'audio.aac'
            : mimeType === 'audio/mpeg'
              ? 'audio.mp3'
              : 'audio.wav';
  const filename = options.filename ?? defaultFilename;

  const formData = new FormData();
  const bytes = new Uint8Array(options.audioData);
  const blob = new Blob([bytes], { type: mimeType });
  formData.append('file', blob, filename);
  formData.append('model', model);
  formData.append('language_code', toSarvamApiLanguageCode(languageCode));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `Sarvam STT error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          (typeof errorJson.error?.message === 'string' && errorJson.error.message) ||
          (typeof errorJson.message === 'string' && errorJson.message) ||
          (typeof errorJson.detail === 'string' && errorJson.detail) ||
          (Array.isArray(errorJson.detail) && JSON.stringify(errorJson.detail)) ||
          errorText ||
          errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      const retryable = response.status >= 500 || response.status === 429;
      throw new SarvamError(errorMessage, response.status, retryable);
    }

    const data = (await response.json()) as { transcript?: string; language_code?: string };
    return {
      transcript: data.transcript ?? '',
      languageCode: data.language_code ?? languageCode,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof SarvamError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new SarvamError('STT request timeout', 504, true);
    }
    throw new SarvamError(`STT network error: ${error instanceof Error ? error.message : 'unknown'}`, 500, true);
  }
}

export async function sarvamTts(options: SarvamTtsOptions): Promise<SarvamTtsResult> {
  const apiKey = getApiKey();
  const model = options.model ?? DEFAULT_TTS_MODEL;
  const speaker = options.speaker ?? DEFAULT_SPEAKER;
  const languageCode = normalizeLanguageCode(options.languageCode);

  const payload = {
    text: options.text,
    target_language_code: toSarvamApiLanguageCode(languageCode),
    speaker,
    model,
    enable_preprocessing: true,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `Sarvam TTS error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message ?? errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      const retryable = response.status >= 500 || response.status === 429;
      throw new SarvamError(errorMessage, response.status, retryable);
    }

    // Current Sarvam TTS returns `audios`, an array of base64 chunks, or `audio_base64`.
    const data = (await response.json()) as { audios?: string[]; audio_base64?: string };
    let audioBase64 = '';
    if (Array.isArray(data.audios) && data.audios.length > 0) {
      audioBase64 = mergeWavBase64Chunks(data.audios);
    } else if (data.audio_base64) {
      audioBase64 = data.audio_base64;
    }
    return {
      audioBase64,
      sampleRate: 22050,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof SarvamError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new SarvamError('TTS request timeout', 504, true);
    }
    throw new SarvamError(`TTS network error: ${error instanceof Error ? error.message : 'unknown'}`, 500, true);
  }
}

export async function sarvamSttWithRetry(
  options: SarvamSttOptions,
  maxRetries = 1,
): Promise<SarvamSttResult> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sarvamStt(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof SarvamError && !error.retryable) {
        throw error;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function sarvamTtsWithRetry(
  options: SarvamTtsOptions,
  maxRetries = 1,
): Promise<SarvamTtsResult> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sarvamTts(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof SarvamError && !error.retryable) {
        throw error;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Synthesizes an audible 16-bit 22050Hz mono PCM WAV containing a warm 3-note
 * prosodic triad (`440Hz -> 554.37Hz -> 659.25Hz` with ADSR envelope,
 * `maxAmplitude > 12000`) when `SARVAM_API_KEY` is not configured (`TASK-012`).
 * Never emits zero-filled silent bytes.
 */
export function generateAudibleFallbackWav(
  text = '',
  languageCode = 'en-IN',
): string {
  void text;
  void languageCode;
  const sampleRate = 22050;
  const durationSec = 0.9;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34); // 16-bit
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  const notes = [440.0, 554.37, 659.25];
  const segSamples = Math.floor(numSamples / notes.length);

  for (let i = 0; i < numSamples; i++) {
    const noteIdx = Math.min(notes.length - 1, Math.floor(i / segSamples));
    const freq = notes[noteIdx]!;
    const localIdx = i - noteIdx * segSamples;
    const localT = localIdx / segSamples;
    const env = localT < 0.08 ? localT / 0.08 : Math.exp(-3.2 * (localT - 0.08));
    const t = i / sampleRate;
    const raw =
      15000 *
      env *
      (0.75 * Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t));
    const clamped = Math.max(-32767, Math.min(32767, Math.round(raw)));
    buf.writeInt16LE(clamped, 44 + i * 2);
  }

  return buf.toString('base64');
}
