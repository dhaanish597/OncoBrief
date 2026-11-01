import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { Button, Copy, Screen } from '../src/ui';
import { CareIllustration } from '../src/art';
import { theme as c } from '../src/theme';

export default function Landing() {
  const { t, state, ready, motionReduced } = useStore();
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (motionReduced) opacity.setValue(1);
    else Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [motionReduced, opacity]);

  if (ready && state.onboarded) return <Redirect href="/(tabs)" />;

  return (
    <Screen>
      <Copy kind="display" style={{ fontSize: 32, lineHeight: 40, fontWeight: '800' }}>
        {t('headline')}
      </Copy>
      <Animated.View style={{ opacity }}>
        <CareIllustration />
      </Animated.View>
      <Copy style={{ color: c.muted, fontSize: 15, lineHeight: 23 }}>
        {t('intro')}
      </Copy>

      <View style={{ gap: 14, width: '100%', marginTop: 8 }}>
        <View style={{ gap: 6 }}>
          <Button
            title="Sign in to my hospital"
            onPress={() => router.push('/signin')}
            testID="landing-signin-btn"
          />
          <Copy kind="meta" style={{ textAlign: 'center' }}>
            Connect securely with your hospital MRN to view verified clinical records.
          </Copy>
        </View>

        <View style={{ gap: 6 }}>
          <Button
            title="Explore a sample patient"
            secondary
            onPress={() => router.push('/onboarding')}
            testID="landing-demo-btn"
          />
          <Copy kind="meta" style={{ textAlign: 'center' }}>
            Try the app with realistic, non-diagnostic oncology demonstration data.
          </Copy>
        </View>
      </View>
    </Screen>
  );
}
