import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useStore } from '../../src/store';
import { Screen } from '../../src/ui';
import { LabDetail } from '../../src/laboratory';
export default function TestDetail() { const { test,observation }=useLocalSearchParams<{ test:string;observation?:string }>();const { t }=useStore();return <Screen back title={test==='haemoglobin' ? t('haemoglobin') : t('resultDetails')}><LabDetail test={test} initialId={observation}/></Screen>; }
