import React from 'react';
import { useRouter } from 'expo-router';
import { useStore } from '../../src/store';
import { Screen, Button } from '../../src/ui';
import { JourneyContent } from '../../src/journey';
export default function Journey() { const { t }=useStore(); const router=useRouter(); return <Screen title={t('journeyTitle')} intro={t('journeyIntro')}><JourneyContent/><Button title={t('notes')} secondary onPress={() => router.push('/prepare')}/></Screen>; }
