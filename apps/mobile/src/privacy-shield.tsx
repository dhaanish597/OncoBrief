import React, { useEffect, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus, StyleSheet, View, Text, Platform } from 'react-native';
import { evaluatePrivacyShieldState, type PrivacyShieldState } from './privacy-core';

export * from './privacy-core';

export function PrivacyShieldBoundary({ children }: { children: ReactNode }) {
  const [shieldState, setShieldState] = useState<PrivacyShieldState>(() =>
    evaluatePrivacyShieldState((AppState.currentState as AppStateStatus) ?? 'active')
  );

  useEffect(() => {
    // Hardware screen-capture protection on native (FLAG_SECURE on Android)
    if (Platform.OS !== 'web') {
      import('expo-screen-capture')
        .then((sc) => sc.preventScreenCaptureAsync())
        .catch(() => {});
    }

    const subscription = AppState.addEventListener('change', (nextStatus: AppStateStatus) => {
      setShieldState(evaluatePrivacyShieldState(nextStatus));
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      {children}
      {shieldState.isVeiled && (
        <View style={[StyleSheet.absoluteFill, styles.veil]} testID="privacy-veil">
          <View style={styles.content}>
            <Text style={styles.title}>OncoBrief</Text>
            <Text style={styles.subtitle}>
              Patient privacy protection active. Returning to your records...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  veil: {
    backgroundColor: '#0D2137',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
  },
  content: {
    alignItems: 'center',
    padding: 32,
    maxWidth: 400,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#A0B2C6',
    textAlign: 'center',
    lineHeight: 20,
  },
});
