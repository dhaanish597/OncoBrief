'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'processing'
  | 'speaking'
  | 'error';

export interface VoiceLanguage {
  code: string;
  label: string;
}

export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml-IN', label: 'മലയാളം (Malayalam)' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)' },
  { code: 'mr-IN', label: 'मराठी (Marathi)' },
  { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'or-IN', label: 'ଓଡ଼ିଆ (Odia)' },
];

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

function getBrowserRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceOptions {
  languageCode: string;
  onTranscript: (text: string) => void;
}

export interface UseVoiceResult {
  state: VoiceState;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string, conversationId?: string) => Promise<void>;
  stopSpeaking: () => void;
  isSpeaking: boolean;
}

/**
 * Voice I/O. Sarvam is the primary path; the browser Web Speech API is the
 * fallback. Voice never bypasses the chat pipeline — it only fills the input
 * or reads the answer.
 */
export function useVoice({ languageCode, onTranscript }: UseVoiceOptions): UseVoiceResult {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sarvamAvailable, setSarvamAvailable] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptHandler = useRef(onTranscript);
  transcriptHandler.current = onTranscript;

  useEffect(() => {
    let active = true;
    fetch('/api/v1/assistant/voice/stt')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.configured === 'boolean') {
          setSarvamAvailable(data.configured);
        }
      })
      .catch(() => {
        if (active) setSarvamAvailable(false);
      });

    return () => {
      active = false;
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.abort();
      audioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const startBrowserRecognition = useCallback(() => {
    const Ctor = getBrowserRecognition();
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.');
      setState('error');
      return false;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore abort error
        }
        recognitionRef.current = null;
      }

      const recognition = new Ctor();
      recognition.lang = languageCode;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item && item[0]) {
            text += item[0].transcript;
          }
        }
        const trimmed = text.trim();
        if (trimmed) {
          transcriptHandler.current(trimmed);
        }
        setState('idle');
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          setState('idle');
          return;
        }
        if (event.error === 'not-allowed') {
          setError('Microphone permission was denied. Please allow microphone access in your browser settings.');
        } else {
          setError(`Speech error: ${event.error}`);
        }
        setState('error');
      };

      recognition.onend = () => {
        setState((s) => (s === 'listening' ? 'idle' : s));
      };

      recognitionRef.current = recognition;
      recognition.start();
      setState('listening');
      return true;
    } catch (err) {
      setError(`Failed to start speech recognition: ${err instanceof Error ? err.message : 'unknown'}`);
      setState('error');
      return false;
    }
  }, [languageCode]);

  const transcribeWithSarvam = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      const form = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('wav') ? 'wav' : 'webm';
      form.append('audio', blob, `audio.${ext}`);
      form.append('languageCode', languageCode);
      const response = await fetch('/api/v1/assistant/voice/stt', { method: 'POST', body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || 'sarvam_stt_failed');
      }
      const data = await response.json();
      if (typeof data.transcript === 'string' && data.transcript.trim()) {
        transcriptHandler.current(data.transcript.trim());
        setError(null);
        setState('idle');
        return true;
      }
      setError('No speech was detected. Please try speaking again.');
      setState('idle');
      return false;
    },
    [languageCode],
  );

  const startListening = useCallback(async () => {
    setError(null);
    if (state === 'listening') return;

    // Resolve Sarvam configuration if not loaded yet
    let isSarvam = sarvamAvailable;
    if (isSarvam === null) {
      try {
        const res = await fetch('/api/v1/assistant/voice/stt');
        if (res.ok) {
          const d = await res.json();
          isSarvam = Boolean(d.configured);
          setSarvamAvailable(isSarvam);
        }
      } catch {
        isSarvam = false;
      }
    }

    // Primary path: Sarvam STT via MediaRecorder (accurate Indic & Indian English STT)
    if (isSarvam === true && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg',
        ].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current = null;
          if (chunksRef.current.length === 0) {
            setState('idle');
            return;
          }
          const rawMime = recorder.mimeType || 'audio/webm';
          const cleanMime = rawMime.split(';')[0]?.trim() || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: cleanMime });
          if (blob.size < 100) {
            setState('idle');
            return;
          }
          try {
            await transcribeWithSarvam(blob);
          } catch (err) {
            console.error('[Voice] Sarvam transcription failed:', err);
            const msg = err instanceof Error ? err.message : 'Transcription failed';
            setError(`Voice transcription failed: ${msg}`);
            setState('error');
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start(250);
        setState('listening');
        return;
      } catch (err) {
        console.error('[Voice] MediaRecorder init error:', err);
        setError('Microphone permission was denied or microphone is unavailable.');
        setState('error');
        return;
      }
    }

    // Fallback path: Browser Web Speech API (real-time, zero-credential)
    const browserStarted = startBrowserRecognition();
    if (!browserStarted && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      // If Web Speech API is not supported (e.g. Firefox), attempt Sarvam recording as a last resort
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current = null;
          if (chunksRef.current.length === 0) {
            setState('idle');
            return;
          }
          const rawMime = recorder.mimeType || 'audio/webm';
          const cleanMime = rawMime.split(';')[0]?.trim() || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: cleanMime });
          try {
            await transcribeWithSarvam(blob);
          } catch (err) {
            console.error('[Voice] Sarvam transcription failed:', err);
            const msg = err instanceof Error ? err.message : 'Transcription failed';
            setError(`Voice transcription failed: ${msg}`);
            setState('error');
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start(250);
        setState('listening');
      } catch {
        setError('Speech recognition is not supported in this browser.');
        setState('error');
      }
    }
  }, [sarvamAvailable, startBrowserRecognition, state, transcribeWithSarvam]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop error
      }
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setState('idle');
  }, []);

  const speakWithBrowser = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Read-aloud is not supported in this browser.');
      setState('error');
      return;
    }
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.localService && candidate.lang.toLowerCase().split('-')[0] === languageCode.toLowerCase().split('-')[0]);
    if (!voice) {
      setError('No installed local browser voice matches this locale.');
      setState('error');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = languageCode;
    utterance.onend = () => {
      setIsSpeaking(false);
      setState('idle');
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setState('idle');
    };
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    setState('speaking');
  }, [languageCode]);

  const speak = useCallback(async (text: string, conversationId?: string) => {
    if (!text.trim()) return;
    setError(null);
    try {
      const response = await fetch('/api/v1/assistant/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, languageCode, conversationId }),
      });
      const data = await response.json();
      if (response.status === 503 && typeof data.fallbackText === 'string') {
        speakWithBrowser(data.fallbackText);
        return;
      }
      if (!response.ok) throw new Error('speech_access_or_source_unavailable');
      if (typeof data.audioBase64 === 'string' && data.audioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          setState('idle');
        };
        setIsSpeaking(true);
        setState('speaking');
        await audio.play();
        return;
      }
      throw new Error('empty_audio');
    } catch {
      setError('Cannot validate access to this saved answer. Reconnect or reload the conversation.');
      setState('error');
    }
  }, [languageCode, speakWithBrowser]);

  return {
    state,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    isSpeaking,
  };
}
