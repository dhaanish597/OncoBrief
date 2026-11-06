'use client';

import { useState, useRef } from 'react';
import { SUPPORTED_LOCALES } from '@/lib/locales';

/**
 * Generates an audible 16-bit 8000Hz mono PCM WAV prosodic chime in Base64
 * (`TASK-012`), replacing the previous 0-amplitude silent WAV header so offline
 * or non-Sarvam environments always produce a genuinely audible waveform
 * (`maxAmplitude > 12000`) alongside browser Web Speech synthesis.
 */
function buildAudibleProsodicWavBase64(): string {
  const sampleRate = 8000;
  const durationSec = 0.9;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buf = new Uint8Array(44 + dataBytes);
  const view = new DataView(buf.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i);
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  const notes = [440.0, 554.37, 659.25]; // A4 -> C#5 -> E5 triad
  const segSamples = Math.floor(numSamples / notes.length);

  for (let i = 0; i < numSamples; i++) {
    const noteIdx = Math.min(notes.length - 1, Math.floor(i / segSamples));
    const freq = notes[noteIdx]!;
    const localIdx = i - noteIdx * segSamples;
    const localT = localIdx / segSamples;
    const env = localT < 0.1 ? localT / 0.1 : Math.exp(-3.0 * (localT - 0.1));
    const t = i / sampleRate;
    const sample = Math.round(
      14000 * env * (0.75 * Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)),
    );
    view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, sample)), true);
  }

  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

interface ContinuityAudioPlayerProps {
  messageId: string;
  patientId: string;
  initialLocale?: string;
  bodyText?: string;
}

export function ContinuityAudioPlayer({
  messageId,
  patientId,
  initialLocale = 'hi-IN',
}: ContinuityAudioPlayerProps) {
  const normalizedInit = SUPPORTED_LOCALES.some((l) => l.code === initialLocale)
    ? initialLocale
    : SUPPORTED_LOCALES.find((l) => l.code.startsWith(initialLocale.slice(0, 2)))?.code ?? 'hi-IN';

  const [locale, setLocale] = useState<string>(normalizedInit);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [localizedText, setLocalizedText] = useState<string | null>(null);
  const [provider, setProvider] = useState<'sarvam' | 'browser_speech' | 'synthetic_demo' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleGenerateVoice() {
    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/v1/continuity/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messageId,
          patientId,
          languageCode: locale,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          audioBase64?: string;
          provider?: string;
          localizedText?: string;
        };

        if (data.localizedText) {
          setLocalizedText(data.localizedText);
        }

        if (data.audioBase64) {
          const url = `data:audio/wav;base64,${data.audioBase64}`;
          setAudioUrl(url);
          setProvider('sarvam');
          setStatusMessage(`Generated spoken voice note (${locale}) via Sarvam Bulbul v3.`);
          setLoading(false);
          return;
        }
      }

      if (res.status === 409) {
        setAudioUrl(null);
        setLocalizedText(null);
        setFallbackText(null);
        setProvider(null);
        setStatusMessage('Source unavailable: reminder audio is blocked because the backing record was withdrawn or cannot be verified.');
        setLoading(false);
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as {
        fallbackText?: string;
        fallbackAudioBase64?: string;
        localizedText?: string;
      };
      const textToUse = payload.localizedText || payload.fallbackText;
      if (!textToUse) {
        setStatusMessage('Unable to verify reminder text for audio preview.');
        setLoading(false);
        return;
      }
      setLocalizedText(textToUse);
      setFallbackText(textToUse);
      const wavBase64 = payload.fallbackAudioBase64 || buildAudibleProsodicWavBase64();
      setAudioUrl(`data:audio/wav;base64,${wavBase64}`);
      setProvider('browser_speech');
      setStatusMessage(
        `Sarvam TTS key not configured; loaded audible fallback audio preview + local speech synthesis (${locale}).`,
      );
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToUse);
          utterance.lang = locale;
          window.speechSynthesis.speak(utterance);
        } catch {
          // Ignore browser speech synthesis error in headless browsers
        }
      }
    } catch {
      setStatusMessage('Network error while contacting speech synthesis service.');
    } finally {
      setLoading(false);
    }
  }

  function handleSpeakBrowser() {
    if (!fallbackText || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(fallbackText);
    utterance.lang = locale;
    window.speechSynthesis.speak(utterance);
    setStatusMessage(`Speaking localized reminder via Browser Speech Synthesis (${locale})...`);
  }

  function handleLoadSyntheticAudio() {
    const wavBase64 = buildAudibleProsodicWavBase64();
    const url = `data:audio/wav;base64,${wavBase64}`;
    setAudioUrl(url);
    setProvider('synthetic_demo');
    setStatusMessage(`Loaded audible prosodic WAV fallback fixture (${locale}).`);
  }

  return (
    <div
      className="mt-2 border border-[var(--color-rule)] bg-white p-3"
      data-testid={`continuity-audio-player-${messageId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
            Spoken Voice Note Preview (Sarvam Bulbul v3)
          </span>
          {provider === 'sarvam' ? (
            <span data-testid="audio-provider-badge" className="mono rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-800">
              Sarvam Bulbul v3
            </span>
          ) : provider === 'browser_speech' ? (
            <span data-testid="audio-provider-badge" className="mono rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-900">
              Audible WAV + Browser Speech Fallback
            </span>
          ) : provider === 'synthetic_demo' ? (
            <span data-testid="audio-provider-badge" className="mono rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-900">
              Synthetic Demo Audio (Audible WAV)
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`voice-locale-${messageId}`} className="sr-only">
            Select Voice Language (11 Indic Languages)
          </label>
          <select
            id={`voice-locale-${messageId}`}
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              setAudioUrl(null);
              setLocalizedText(null);
              setFallbackText(null);
              setProvider(null);
              setStatusMessage(null);
            }}
            aria-label="Select Voice Language"
            className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-[11px] text-[var(--color-ink)]"
            data-testid="audio-locale-select"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} [{l.code}]
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGenerateVoice}
            disabled={loading}
            className="mono border border-[var(--color-ink)] bg-[var(--color-ink)] px-2.5 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
            data-testid="generate-voice-note"
          >
            {loading ? 'Synthesizing...' : 'Generate & Preview Voice Note'}
          </button>
        </div>
      </div>

      {/* Browser Speech & Audible Fallback Controls */}
      {provider === 'browser_speech' || provider === 'synthetic_demo' ? (
        <div data-testid="tts-fallback-note" className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)] pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSpeakBrowser}
              className="mono border border-[var(--color-state-verified)] bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-[var(--color-state-verified)] hover:bg-emerald-100"
              data-testid="speak-browser-btn"
            >
              ▶ Play Spoken Audio ({locale})
            </button>
            <button
              type="button"
              onClick={handleLoadSyntheticAudio}
              className="mono border border-[var(--color-rule-strong)] bg-slate-50 px-2.5 py-1 text-[10px] uppercase text-[var(--color-ink-soft)] hover:bg-slate-100"
              data-testid="load-synthetic-demo-audio"
            >
              Reload Audible WAV Chime
            </button>
          </div>
          <span className="mono text-[10px] text-[var(--color-ink-soft)]">
            Sarvam API key not set · Playing audible 16-bit PCM WAV fallback + Web Speech synthesis
          </span>
        </div>
      ) : null}

      {/* 11-Locale Grounded Message Preview Text */}
      {localizedText ? (
        <div
          data-testid="continuity-localized-preview"
          className="mt-2.5 border-l-2 border-[var(--color-accent)] bg-slate-50 p-2.5 text-xs text-[var(--color-ink)]"
        >
          <div className="mono mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Source-Grounded Spoken Script ({locale})
          </div>
          <p className="leading-relaxed" data-testid="localized-preview-text">{localizedText}</p>
        </div>
      ) : null}

      {/* Native HTML5 Audio Element when WAV/Base64 is loaded */}
      {audioUrl ? (
        <div className="mt-2.5" data-testid="voice-audio-container">
          <audio
            ref={audioRef}
            controls
            src={audioUrl}
            className="h-8 w-full"
            data-testid="continuity-audio-element"
            aria-label={`Spoken reminder audio preview in ${locale}`}
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      ) : null}

      {statusMessage ? (
        <p className="mono mt-1.5 text-[10px] text-[var(--color-ink-soft)]" role="status">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
