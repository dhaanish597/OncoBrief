import React from 'react';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { Screen, Empty, Button } from '../src/ui';
export default function MissingRoute() { const { t }=useStore();const router=useRouter();return <Screen back><Empty title={t('originalUnavailable')}/><Button title={t('home')} onPress={() => router.replace('/(tabs)')}/></Screen>; }
