import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { Button, Copy, Screen } from '../src/ui';
import { CareIllustration } from '../src/art';
import { theme as c } from '../src/theme';
export default function Landing() {
  const { t,state,ready,motionReduced,dispatch } = useStore(); const router = useRouter(); const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (motionReduced) opacity.setValue(1); else Animated.timing(opacity,{ toValue:1,duration:650,useNativeDriver:true }).start(); },[motionReduced,opacity]);
  if (ready && state.onboarded) return <Redirect href="/(tabs)"/>;
  return <Screen><Copy kind="display" style={{ fontSize:36,lineHeight:44 }}>{t('headline')}</Copy><Animated.View style={{ opacity }}><CareIllustration/></Animated.View><Copy style={{ color:c.muted }}>{t('intro')}</Copy><Copy kind="meta">{t('demoInfo')}</Copy><View style={{ gap:12 }}><Button title={t('explore')} onPress={() => { if (dispatch({ type:'onboard' })) router.replace('/(tabs)'); }}/><Button title={t('signin')} secondary onPress={() => router.push('/signin')}/></View></Screen>;
}
