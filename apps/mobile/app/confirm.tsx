import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { Screen, Copy, Panel, Button, Toggle } from '../src/ui';
export default function Confirm() {
  const { action }=useLocalSearchParams<{ action:string }>();const resetAction=action==='reset';const { t,reset,dispatch }=useStore();const router=useRouter();const [approved,setApproved]=useState(false);const [busy,setBusy]=useState(false);
  async function confirm() { if (!approved) return;setBusy(true);if (resetAction ? await reset() : dispatch({ type:'leave' })) router.replace('/');setBusy(false); }
  return <Screen back title={t(resetAction ? 'reset' : 'logout')}><Panel tone="amber"><Copy>{t(resetAction ? 'resetInfo' : 'logoutInfo')}</Copy></Panel><Toggle title={t(resetAction ? 'confirmReset' : 'confirmLogout')} checked={approved} onPress={() => setApproved(!approved)}/><Button disabled={!approved || busy} title={t(resetAction ? 'confirmReset' : 'confirmLogout')} onPress={() => void confirm()}/><Button secondary title={t('cancel')} onPress={() => router.back()}/></Screen>;
}
