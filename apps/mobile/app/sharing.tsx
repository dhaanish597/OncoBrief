import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useStore,useDraft } from '../src/store';
import { Screen, Copy, Field, Button, Chip, Row, DocumentRow, Panel, Empty } from '../src/ui';
export default function Sharing() {
  const { state,t,dispatch }=useStore(); const router=useRouter();const [recipient,setRecipient]=useDraft('recipient');const [purpose,setPurpose]=useDraft('purpose');const [days,setDays]=useState(1);
  return <Screen back title={t('sharingTitle')} intro={t('sharingInfo')}><Field label={t('recipient')} value={recipient} onChange={setRecipient} maxLength={200}/><Field label={t('purpose')} value={purpose} onChange={setPurpose} maxLength={500}/><Copy kind="label">{t('expiry')}</Copy><Row><Chip title={t('oneDay')} active={days===1} onPress={() => setDays(1)}/><Chip title={t('sevenDays')} active={days===7} onPress={() => setDays(7)}/></Row><Copy>{t('selectedReports')}</Copy>{state.documents.map(d => <DocumentRow key={d.id} doc={d} selected={state.selected.includes(d.id)} onSelect={() => dispatch({ type:'select',id:d.id })}/>)}<Button disabled={!recipient.trim() || !purpose.trim() || !state.selected.length} title={t('shareReview')} onPress={() => router.push({ pathname:'/share-review',params:{ recipient,purpose,days:String(days),ids:JSON.stringify(state.selected) } })}/>
    <Copy kind="title">{t('grants')}</Copy>{!state.grants.length && <Empty title={t('noGrants')}/>} {state.grants.map(g => { const active=!g.revokedAt && Date.parse(g.expiresAt)>Date.now();return <Panel key={g.id}><Copy kind="label">{g.recipient}</Copy><Copy>{g.purpose}</Copy><Copy kind="meta">{g.expiresAt} · {t(g.revokedAt ? 'revoked' : active ? 'active' : 'expired')}</Copy>{g.ids.map(id => <Copy key={id} kind="meta">{state.documents.find(d => d.id===id)?.name}</Copy>)}{active && <Button secondary title={t('revoke')} onPress={() => dispatch({ type:'revoke',id:g.id })}/>}</Panel>; })}
  </Screen>;
}
