import React from 'react';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { Screen, Copy, Button, Panel } from '../src/ui';
import { NotebookArt } from '../src/art';
export default function Onboarding() { const { t,dispatch } = useStore(); const router = useRouter(); return <Screen back title={t('welcome')}><NotebookArt/><Copy>{t('onboarding')}</Copy><Panel tone="blue"><Copy>{t('demoInfo')}</Copy></Panel><Button title={t('start')} onPress={() => { dispatch({ type:'onboard' }); router.replace('/(tabs)'); }}/></Screen>; }
