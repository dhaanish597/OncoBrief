import React, { useState, useRef, useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { useStore } from './store';
import { VoiceTtsService, type VoiceSynthesisResult } from './voice-tts';
import { Copy, Button, Row, Panel, Badge, Chip } from './ui';
import { theme as c } from './theme';

interface VoicePlayerBarProps {
  messageId?: string;
  text?: string;
  defaultLanguage?: 'en' | 'ta';
}

export function VoicePlayerBar({ messageId, text, defaultLanguage = 'en' }: VoicePlayerBarProps) {
  const { client, mode, state } = useStore();
  const [language, setLanguage] = useState<'en' | 'ta'>(defaultLanguage);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'stopped'>('idle');
  const [result, setResult] = useState<VoiceSynthesisResult | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlay = async () => {
    if (status === 'playing') {
      handleStop();
      return;
    }

    setStatus('loading');
    try {
      const service = new VoiceTtsService({ client, mode });
      const res = await service.synthesize({
        messageId,
        text,
        language,
      });
      setResult(res);

      setStatus('playing');
      const playbackDuration = Math.max(res.durationEstimateMs || 3000, 2500);
      timeoutRef.current = setTimeout(() => {
        setStatus('stopped');
      }, Math.min(playbackDuration, 5000));

      if (Platform.OS === 'web' && typeof Audio !== 'undefined') {
        try {
          if (audioRef.current) {
            audioRef.current.pause();
          }
          const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setStatus('stopped');
          };
          await audio.play().catch(() => {});
        } catch {}
      }
    } catch {
      setStatus('stopped');
    }
  };

  const handleStop = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
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
              ? 'Loading Audio...'
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
          onPress={() => setLanguage('en')}
        />
        <Chip
          title="தமிழ் (ta-IN)"
          active={language === 'ta'}
          onPress={() => setLanguage('ta')}
        />
      </Row>

      <Row>
        <Button
          title={status === 'playing' ? 'Stop Listening' : status === 'loading' ? 'Preparing Voice...' : 'Listen to Message'}
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
        <View style={styles.transcriptBox}>
          <Copy kind="label">Voice Transcript ({language === 'ta' ? 'தமிழ்' : 'English'}):</Copy>
          <Copy kind="body">
            {result?.transcript || text || (language === 'ta' ? 'உறுதிப்படுத்தப்பட்ட மருத்துவக் குழு வழிமுறைகள்.' : 'Verified care instructions.')}
          </Copy>
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  transcriptBox: {
    padding: 10,
    backgroundColor: c.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.line,
    gap: 4,
    marginTop: 6,
  },
});
