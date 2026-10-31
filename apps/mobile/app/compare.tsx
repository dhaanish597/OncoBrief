import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useStore } from '../src/store';
import { Screen, Copy, Row, Chip, Panel, LinkRow } from '../src/ui';
export default function Compare() {
  const { state,t }=useStore(); const params=useLocalSearchParams<{ left?:string;right?:string }>();const [left,setLeft]=useState(params.left || state.documents[0]?.id);const [right,setRight]=useState(params.right || state.documents[1]?.id);
  return <Screen back title={t('compareTitle')} intro={t('compareInfo')}><Copy kind="meta">{t('retainSources')}</Copy>{(['A','B'] as const).map((side,i) => { const id=i===0 ? left : right;const doc=state.documents.find(d => d.id===id);return <View key={side} style={{ gap:15 }}><Copy kind="label">{side} · {t('selectReport')}</Copy><Row>{state.documents.map(d => <Chip key={d.id} title={d.name} active={id===d.id} onPress={() => i===0 ? setLeft(d.id) : setRight(d.id)}/>)}</Row>{doc && <Panel tone={i===0 ? 'blue' : 'sage'}><Copy kind="title">{doc.name}</Copy><Copy>{doc.date} · {doc.facility}</Copy><Copy kind="meta">{t('version')} {doc.version} · {doc.patientReviewed ? t('patientReviewed') : t('notReviewed')}</Copy><Copy selectable>{doc.originalText || t('extractionUnavailable')}</Copy>{state.ledger.filter(e => e.source.documentId===doc.id && e.status==='conflicting').map(e => <Copy key={e.id}>{t('conflicting')}: “{e.source.quote}”</Copy>)}<LinkRow title={t('original')} href={{ pathname:'/record/[id]',params:{ id:doc.id } }}/></Panel>}</View>; })}</Screen>;
}
