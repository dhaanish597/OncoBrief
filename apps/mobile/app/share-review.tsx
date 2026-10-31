import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStore } from '../src/store';
import { Screen, Copy, Panel, Button, Toggle } from '../src/ui';
export default function ReviewShare() {
  const { recipient='',purpose='',days='1',ids='[]' }=useLocalSearchParams<{ recipient:string;purpose:string;days:string;ids:string }>();const { state,t,dispatch }=useStore(); const router=useRouter();const [approved,setApproved]=useState(false);
  const scope=useMemo<string[]>(() => { try { const value:unknown=JSON.parse(ids);return Array.isArray(value) && value.every(id => typeof id==='string') ? value : []; } catch { return []; } },[ids]);
  const expiresAt=useMemo(() => new Date(Date.now()+([1,7].includes(Number(days)) ? Number(days) : 1)*86400000).toISOString(),[days]);
  return <Screen back title={t('reviewScope')} intro={t('sharingInfo')}><Panel tone="blue"><Copy kind="label">{t('recipient')}</Copy><Copy>{recipient}</Copy><Copy kind="label">{t('purpose')}</Copy><Copy>{purpose}</Copy><Copy kind="label">{t('selectedReports')}</Copy>{scope.map(id => <Copy key={id}>{state.documents.find(d => d.id===id)?.name || t('originalUnavailable')}</Copy>)}<Copy>{t('permission')}</Copy><Copy>{t('expiry')}: {expiresAt}</Copy><Copy>{t('revoke')}: {t('grants')}</Copy></Panel><Toggle title={t('shareApprove')} checked={approved} onPress={() => setApproved(!approved)}/><Button disabled={!approved || !scope.length} title={t('simulateShare')} onPress={() => { if (dispatch({ type:'share',recipient,purpose,ids:scope,expiresAt,approved })) router.replace('/sharing'); }}/></Screen>;
}
