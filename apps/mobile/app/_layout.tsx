import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useStore } from '../src/store';
import { theme } from '../src/theme';
function Navigation() {
  const { motionReduced } = useStore();
  return <><StatusBar style="dark"/><Stack screenOptions={{ headerShown:false,contentStyle:{ backgroundColor:theme.bg },animation:motionReduced ? 'none' : 'fade' }}/></>;
}
export default function Layout() { return <SafeAreaProvider><Provider><Navigation/></Provider></SafeAreaProvider>; }
