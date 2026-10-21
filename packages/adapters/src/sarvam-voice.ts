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

export function normalizeLanguageCode(code: string): SupportedLanguage {
  const normalized = code.toLowerCase().replace(/_/g, '-');
  if (isSupportedLanguage(normalized)) return normalized;
  // Default to English India
  return 'en-IN';
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
  formData.append('language_code', languageCode);

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
    target_language_code: languageCode,
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

    // Current Sarvam TTS returns `audios`, an array of base64 chunks.
    const data = (await response.json()) as { audios?: string[]; audio_base64?: string };
    const audioBase64 = data.audios?.join('') ?? data.audio_base64 ?? '';
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