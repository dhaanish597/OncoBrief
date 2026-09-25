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
  speak: (text: string) => Promise<void>;
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptHandler = useRef(onTranscript);
  transcriptHandler.current = onTranscript;

  useEffect(() => {
    return () => {
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
      setError('Speech recognition is not supported in this browser.');
      setState('error');
      return false;
    }
    const recognition = new Ctor();
    recognition.lang = languageCode;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]![0]!.transcript;
      }
      transcriptHandler.current(text);
      setState('idle');
    };
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Speech error: ${event.error}`);
      setState('error');
    };
    recognition.onend = () => {
      setState((s) => (s === 'listening' ? 'idle' : s));
    };
    recognitionRef.current = recognition;
    recognition.start();
    setState('listening');
    return true;
  }, [languageCode]);

  const transcribeWithSarvam = useCallback(async (blob: Blob) => {
    setState('transcribing');
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    form.append('languageCode', languageCode);
    const response = await fetch('/api/v1/assistant/voice/stt', { method: 'POST', body: form });
    if (!response.ok) throw new Error('sarvam_stt_failed');
    const data = await response.json();
    if (typeof data.transcript === 'string' && data.transcript.trim()) {
      transcriptHandler.current(data.transcript);
      setState('idle');
      return true;
    }
    throw new Error('empty_transcript');
  }, [languageCode]);

  const startListening = useCallback(async () => {
    setError(null);
    if (mediaRecorderRef.current) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      startBrowserRecognition();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          await transcribeWithSarvam(blob);
        } catch {
          // Sarvam failed or returned nothing — fall back to the browser.
          setState('idle');
          startBrowserRecognition();
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState('listening');
    } catch {
      // getUserMedia denied or unavailable — try the browser recognizer.
      startBrowserRecognition();
    }
  }, [startBrowserRecognition, transcribeWithSarvam]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    recognitionRef.current?.stop();
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
    const utterance = new SpeechSynthesisUtterance(text);
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

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setError(null);
    try {
      const response = await fetch('/api/v1/assistant/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, languageCode }),
      });
      if (!response.ok) throw new Error('sarvam_tts_failed');
      const data = await response.json();
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
      // Fall back to the browser voice.
      speakWithBrowser(text);
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
