import React, { useState } from 'react';
import { View } from 'react-native';
import { useStore,useDraft } from '../src/store';
import { Screen, Copy, Field, Button, Row, Chip, Panel, LinkRow } from '../src/ui';
export default function Checklist() {
  const { t,state,dispatch }=useStore();const [text,setText]=useDraft('missingText');const [note,setNote]=useDraft('missingNote');const [attach,setAttach]=useState<string | null>(null);
  return <Screen back title={t('checklist')} intro={t('missingInfo')}><Field label={t('itemPlaceholder')} value={text} onChange={setText} maxLength={200}/><Field label={t('notePlaceholder')} value={note} onChange={setNote}/><Button disabled={!text.trim()} title={t('addItem')} onPress={() => { if (dispatch({ type:'missing',text,note })) { setText('');setNote(''); } }}/>
    {state.missing.map(m => <Panel key={m.id}><Copy kind="title">{m.text}</Copy><Copy>{m.note}</Copy><Copy kind="meta">{t('missingInfo')}</Copy><Row>{(['missing','requested','available','unavailable'] as const).map(k => <Chip key={k} title={t(k)} active={m.status===k} onPress={() => dispatch({ type:'missingStatus',id:m.id,status:k,documentId:m.documentId })}/>)}</Row>
      {m.documentId && <LinkRow title={t('attached')} href={{ pathname:'/record/[id]',params:{ id:m.documentId } }}/>}<Button secondary title={t('attach')} onPress={() => setAttach(attach===m.id ? null : m.id)}/>{attach===m.id && <View>{state.documents.map(d => <LinkRow key={d.id} title={d.name} onPress={() => { dispatch({ type:'missingStatus',id:m.id,status:'available',documentId:d.id });setAttach(null); }}/>)}</View>}
    </Panel>)}
  </Screen>;
}
