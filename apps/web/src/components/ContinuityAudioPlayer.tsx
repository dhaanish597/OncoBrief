'use client';

import { useState, useRef, useEffect } from 'react';
import { SUPPORTED_LOCALES, type SupportedLocaleCode } from '@/lib/locales';

export { SUPPORTED_LOCALES, type SupportedLocaleCode };

// Standard silent 44-byte WAV header for clean synthetic preview demo fallback
const SYNTHETIC_DEMO_WAV_BASE64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

interface ContinuityAudioPlayerProps {
  messageId: string;
  patientId: string;
  bodyText: string;
  initialLocale?: string;
}

export function ContinuityAudioPlayer({
  messageId,
  patientId,
  initialLocale = 'hi-IN',
}: ContinuityAudioPlayerProps) {
  const [locale, setLocale] = useState<string>(initialLocale);
  const [status, setStatus] = useState<
    'idle' | 'generating' | 'ready' | 'fallback_available' | 'error'
  >('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function handleGenerateVoiceNote() {
    setStatus('generating');
    setAudioUrl(null);
    setProvider(null);
    setFallbackText(null);
    setAnnouncement('Requesting voice preview from Sarvam Bulbul TTS service...');

    try {
      const res = await fetch('/api/v1/continuity/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          patientId,
          languageCode: locale,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const url = `data:audio/wav;base64,${data.audioBase64}`;
          setAudioUrl(url);
          setProvider(data.provider ?? 'sarvam');
          setStatus('ready');
          setAnnouncement('Voice note generated via Sarvam Bulbul v3. Audio player ready.');
          return;
        }
      }

      if (res.status === 503) {
        const data = await res.json();
        if (typeof data.fallbackText === 'string') {
          setFallbackText(data.fallbackText);
          setStatus('fallback_available');
          setAnnouncement('Provider unavailable. A local browser voice can read the authorized message if installed.');
          return;
        }
      }
      setStatus('error');
      setAnnouncement('Voice preview blocked: message access or source validation failed. Reload the record.');
    } catch {
      setStatus('error');
      setAnnouncement('Cannot validate message access. Reconnect and retry voice preview.');
    }
  }

  function handlePlayBrowserSpeech() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setAnnouncement('Browser speech synthesis is not supported in this environment.');
      return;
    }

    if (!fallbackText) return;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.localService && candidate.lang.toLowerCase().split('-')[0] === locale.toLowerCase().split('-')[0]);
    if (!voice) {
      setAnnouncement('No installed local browser voice matches this locale. Spoken preview unavailable.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(fallbackText);
    utterance.voice = voice;
    utterance.lang = locale;
    utterance.onstart = () => {
      setIsBrowserSpeaking(true);
      setAnnouncement(`Playing spoken preview in ${locale} via browser speech synthesis.`);
    };
    utterance.onend = () => {
      setIsBrowserSpeaking(false);
      setAnnouncement('Spoken preview completed.');
    };
    utterance.onerror = () => {
      setIsBrowserSpeaking(false);
      setAnnouncement('Browser speech synthesis encountered an error.');
    };

    window.speechSynthesis.speak(utterance);
  }

  function handleStopBrowserSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsBrowserSpeaking(false);
      setAnnouncement('Speech synthesis stopped.');
    }
  }

  function handlePlaySyntheticDemo() {
    const url = `data:audio/wav;base64,${SYNTHETIC_DEMO_WAV_BASE64}`;
    setAudioUrl(url);
    setProvider('synthetic_demo');
    setStatus('ready');
    setAnnouncement('Synthetic demo audio loaded: silent control fixture, no speech.');
  }

  return (
    <div
      data-testid={`audio-player-${messageId}`}
      className="mt-3 border border-[var(--color-rule-strong)] bg-[var(--color-paper)] p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-rule)] pb-2">
        <span className="mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
          Voice Continuity & Regional Spoken Preview
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor={`locale-select-${messageId}`} className="mono text-[10px] text-[var(--color-ink-soft)] uppercase">
            Language:
          </label>
          <select
            id={`locale-select-${messageId}`}
            data-testid="audio-locale-select"
            value={locale}
            onChange={(e) => { setLocale(e.target.value); setStatus('idle'); setAudioUrl(null); setFallbackText(null); }}
            className="mono border border-[var(--color-rule-strong)] bg-white px-2 py-1 text-xs"
          >
            <optgroup label="English">
              <option value="en-IN">English (India) · en-IN</option>
            </optgroup>
            <optgroup label="Indic Languages (10)">
              {SUPPORTED_LOCALES.filter((l) => l.code !== 'en-IN').map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} · {l.code}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <p className="mono mt-2 text-[10px] text-[var(--color-ink-soft)]">Reads existing message text. Locale selects a voice; it does not translate the message.</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {status !== 'generating' ? (
          <button
            type="button"
            data-testid="generate-voice-note"
            onClick={handleGenerateVoiceNote}
            className="mono border border-[var(--color-ink)] bg-white px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-[var(--color-accent-soft)] focus-visible:outline-2"
          >
            Generate & Preview Spoken Voice Note (Sarvam Bulbul v3)
          </button>
        ) : (
          <span className="mono inline-flex items-center gap-2 text-[11px] text-[var(--color-ink-soft)]">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            Synthesizing spoken audio via Sarvam Bulbul v3...
          </span>
        )}

        {status === 'fallback_available' ? (
          <div className="flex flex-wrap items-center gap-2">
            {!isBrowserSpeaking ? (
              <button
                type="button"
                data-testid="play-browser-speech"
                onClick={handlePlayBrowserSpeech}
                className="mono border border-[var(--color-rule-strong)] bg-white px-3 py-1 text-[11px] uppercase hover:bg-[var(--color-accent-soft)]"
              >
                Play via Browser Speech (Local Preview)
              </button>
            ) : (
              <button
                type="button"
                data-testid="stop-browser-speech"
                onClick={handleStopBrowserSpeech}
                className="mono border border-[var(--color-state-conflicting)] bg-[#fbe9e8] px-3 py-1 text-[11px] uppercase text-[var(--color-state-conflicting)]"
              >
                Stop Browser Speech
              </button>
            )}

            <button
              type="button"
              data-testid="load-synthetic-demo-audio"
              onClick={handlePlaySyntheticDemo}
              className="mono border border-dashed border-[var(--color-rule-strong)] bg-white px-2.5 py-1 text-[11px] uppercase text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]"
            >
              Load Labeled Synthetic Demo Audio
            </button>
          </div>
        ) : null}
      </div>

      {status === 'fallback_available' && !audioUrl ? (
        <div
          role="note"
          data-testid="tts-fallback-note"
          className="mono mt-2 border border-dashed border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-2 text-[10px] text-[var(--color-ink-soft)] leading-relaxed"
        >
          <span className="font-semibold uppercase text-[var(--color-state-extracted)]">
            Provider Notice:
          </span>{' '}
          Sarvam TTS is unavailable. Local browser playback requires an installed voice matching the selected locale. The synthetic audio is a silent control fixture with no speech. Browser playback cannot be exported as an audio file.
        </div>
      ) : null}

      {audioUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 bg-[var(--color-paper-raised)] p-2 border border-[var(--color-rule)]">
          <audio
            ref={audioRef}
            data-testid="continuity-audio-element"
            controls
            src={audioUrl}
            className="h-8 max-w-full"
            aria-label={provider === 'synthetic_demo' ? 'Silent control fixture, no spoken reminder' : `Spoken reminder audio preview in ${locale}`}
          />
          <span
            data-testid="audio-provider-badge"
            className="mono border border-[var(--color-rule-strong)] px-2 py-0.5 text-[10px] uppercase text-[var(--color-ink-soft)]"
          >
            {provider === 'sarvam'
              ? 'Generated: Sarvam Bulbul v3'
              : 'Synthetic Demo Audio — silent control fixture, no speech'}
          </span>
        </div>
      ) : null}

      {status === 'error' ? <p role="alert" className="mono mt-2 text-[11px]">{announcement}</p> : null}
      {/* Screen reader live region */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
