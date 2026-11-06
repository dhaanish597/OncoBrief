import React from 'react';
import { useRouter } from 'expo-router';
import { useStore } from '../../src/store';
import { Screen, Copy, Panel, Row, Chip, Toggle, LinkRow, Button } from '../../src/ui';
import { NotebookArt } from '../../src/art';
export default function Profile() {
  const { state,t,dispatch }=useStore();const router=useRouter();
  return <Screen title={t('profileTitle')}><NotebookArt/><Copy kind="label">{t('language')}</Copy><Row><Chip title="English" active={state.locale==='en'} onPress={() => dispatch({ type:'locale',locale:'en' })}/><Chip title="தமிழ்" active={state.locale==='ta'} onPress={() => dispatch({ type:'locale',locale:'ta' })}/></Row><Toggle title={t('motion')} checked={state.reducedMotion} onPress={() => dispatch({ type:'motion' })}/><Copy kind="meta">{t('motionInfo')}</Copy><Panel tone="blue"><Copy kind="title">{t('storage')}</Copy><Copy>{t('storageInfo')}</Copy></Panel><LinkRow title={t('sharing')} href="/sharing"/><LinkRow title={t('audit')} href="/audit"/><LinkRow title={t('medication')} subtitle={t('noMedication')} href={{ pathname:'/(tabs)/records',params:{ category:'prescription' } }}/><Button secondary title={t('logout')} onPress={() => router.push({ pathname:'/confirm',params:{ action:'leave' } })}/><Button secondary title={t('reset')} onPress={() => router.push({ pathname:'/confirm',params:{ action:'reset' } })}/></Screen>;
}
