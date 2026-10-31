import React from 'react';
import { useRouter } from 'expo-router';
import { Screen, Copy, Button, Panel } from '../src/ui';
import { useStore } from '../src/store';
export default function Signin() { const { t } = useStore(); const router=useRouter(); return <Screen back title={t('signin')}><Panel tone="blue"><Copy>{t('disabledSignin')}</Copy></Panel><Button title={t('explore')} onPress={() => router.push('/onboarding')}/></Screen>; }
