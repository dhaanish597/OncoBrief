import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useStore } from '../src/store';
import { PrivacyShieldBoundary } from '../src/privacy-shield';
import { theme } from '../src/theme';

function Navigation() {
  const { motionReduced } = useStore();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          animation: motionReduced ? 'none' : 'fade',
        }}
      />
    </>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <Provider>
        <PrivacyShieldBoundary>
          <Navigation />
        </PrivacyShieldBoundary>
      </Provider>
    </SafeAreaProvider>
  );
}
