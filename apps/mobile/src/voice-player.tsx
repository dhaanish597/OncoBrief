import React, { useState, useRef, useEffect } from 'react';
import { View, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { useStore } from './store';
import { Copy, Button, Row, Panel, Badge, Chip } from './ui';

interface VoicePlayerBarProps {
  messageId?: string;
  text?: string;
  defaultLanguage?: 'en' | 'ta';
}

export function VoicePlayerBar({ messageId, text, defaultLanguage = 'en' }: VoicePlayerBarProps) {
  const { state } = useStore();
  const [language, setLanguage] = useState<'en' | 'ta'>(defaultLanguage);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'stopped'>('idle');
  const [showTranscript, setShowTranscript] = useState(false);
  const [supportedVoices, setSupportedVoices] = useState<string[]>(['en-IN', 'ta-IN']);

  useEffect(() => {
    // Detect available Indic speech voices on native Android
    if (Platform.OS !== 'web') {
      Speech.getAvailableVoicesAsync()
        .then((voices) => {
          if (voices && voices.length > 0) {
            const langs = Array.from(new Set(voices.map((v) => v.language)));
            setSupportedVoices(langs);
          }
        })
        .catch(() => {});
    }

    return () => {
      if (Platform.OS !== 'web') {
        void Speech.stop().catch(() => {});
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const spokenText =
    text ||
    (language === 'ta'
      ? state.locale === 'ta' && state.diagnosisTa
        ? `மருத்துவக் குழுவின் ஆலோசனை: ${state.diagnosisTa} சிகிச்சை திட்டத்திற்கு தேவையான ஆவணங்களை கொண்டு வாருங்கள்.`
        : 'மருத்துவக் குழுவின் ஆலோசனை: உங்கள் அடுத்த சந்திப்புக்கு முன் தேவையான அனைத்து முந்தைய அறிக்கைகளையும் கொண்டு வாருங்கள்.'
      : 'Care team instruction: Please bring all previous imaging films, biopsy slides, and pathology reports to your oncology consultation.');

  const handlePlay = async () => {
    if (status === 'playing') {
      handleStop();
      return;
    }

    setStatus('loading');
    const speechLang = language === 'ta' ? 'ta-IN' : 'en-IN';

    if (Platform.OS !== 'web') {
      try {
        await Speech.stop();
        Speech.speak(spokenText, {
          language: speechLang,
          rate: 0.85,
          pitch: 1.0,
          onStart: () => {
            setStatus('playing');
          },
          onDone: () => {
            setStatus('stopped');
          },
          onStopped: () => {
            setStatus('stopped');
          },
          onError: () => {
            setStatus('stopped');
          },
        });
      } catch {
        setStatus('stopped');
      }
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.lang = speechLang;
          utterance.rate = 0.9;
          utterance.onstart = () => setStatus('playing');
          utterance.onend = () => setStatus('stopped');
          utterance.onerror = () => setStatus('stopped');
          window.speechSynthesis.speak(utterance);
        } catch {
          setStatus('stopped');
        }
      } else {
        setStatus('stopped');
      }
    }
  };

  const handleStop = () => {
    if (Platform.OS !== 'web') {
      void Speech.stop().catch(() => {});
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setStatus('stopped');
  };

  return (
    <Panel tone="paper">
      <Row>
        <Badge
          text={
            status === 'playing'
              ? 'Speaking (Audio Active)'
              : status === 'loading'
              ? 'Preparing Audio...'
              : 'Voice Reminder'
          }
          tone={status === 'playing' ? 'sage' : 'blue'}
        />
        <Copy kind="meta">Accessible speech for low-literacy or visual fatigue</Copy>
      </Row>

      <Row>
        <Chip
          title="English (en-IN)"
          active={language === 'en'}
          onPress={() => {
            if (status === 'playing') handleStop();
            setLanguage('en');
          }}
        />
        <Chip
          title="தமிழ் (ta-IN)"
          active={language === 'ta'}
          onPress={() => {
            if (status === 'playing') handleStop();
            setLanguage('ta');
          }}
        />
      </Row>

      <Row>
        <Button
          title={
            status === 'playing'
              ? 'Stop Listening'
              : status === 'loading'
              ? 'Preparing Voice...'
              : `Listen to Message (${language === 'ta' ? 'தமிழ்' : 'English'})`
          }
          disabled={status === 'loading'}
          onPress={handlePlay}
        />
        <Button
          secondary
          title={showTranscript ? 'Hide Transcript' : 'View Transcript'}
          onPress={() => setShowTranscript(!showTranscript)}
        />
      </Row>

      {showTranscript && (
        <View style={{ gap: 6, padding: 12, backgroundColor: '#F3F4F6', borderRadius: 8 }}>
          <Copy kind="label">Approved Instruction Transcript ({language === 'ta' ? 'தமிழ்' : 'English'}):</Copy>
          <Copy kind="body">{spokenText}</Copy>
          <Copy kind="meta">Source: Authorized oncology clinical instruction · Non-diagnostic</Copy>
        </View>
      )}
    </Panel>
  );
}
