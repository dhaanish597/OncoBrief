import React, { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Intent from 'expo-intent-launcher';
import * as FS from 'expo-file-system/legacy';
import { useStore,useDraft } from '../../src/store';
import { Screen, Copy, Button, Panel, Field, Rule, Empty } from '../../src/ui';
import { EvidenceDetail } from '../../src/journey';
export default function RecordDetail() {
  const { id }=useLocalSearchParams<{ id:string }>(); const { state,t,dispatch,notify }=useStore(); const router=useRouter(); const [reason,setReason]=useDraft('flag'); const [showOriginal,setShowOriginal]=useState(false);
  const doc=state.documents.find(d => d.id===id); if (!doc) return <Screen back><Empty title={t('originalUnavailable')}/></Screen>;
  const facts=state.ledger.filter(e => e.source.documentId===id);
  async function openPdf() { try { if (doc?.uri && Platform.OS==='android') { const uri=await FS.getContentUriAsync(doc.uri);await Intent.startActivityAsync('android.intent.action.VIEW',{ data:uri,type:'application/pdf',flags:1 }); } else notify(t('originalUnavailable')); } catch { notify(t('error')); } }
  return <Screen back title={doc.name} intro={`${doc.date} · ${doc.facility}`}>
    <Panel tone="blue"><Copy kind="label">{t('sourceStatus')}</Copy><Copy>{doc.clinicianVerified ? t('confirmed') : doc.extraction==='unavailable' ? t('extractionUnavailable') : t('extracted')}</Copy><Copy>{doc.patientReviewed ? t('patientReviewed') : t('notReviewed')}</Copy><Copy kind="meta">{t('version')}: {doc.version} · {doc.addedAt}</Copy></Panel>
    <Button title={t('original')} onPress={() => setShowOriginal(!showOriginal)}/>
    {showOriginal && <Panel><Copy kind="label">{t('originals')}</Copy>{doc.originalText ? <Copy selectable>{doc.originalText}</Copy> : doc.uri && doc.mimeType.startsWith('image/') ? <Image source={{ uri:doc.uri }} accessibilityLabel={doc.name} resizeMode="contain" style={{ width:'100%',height:360 }}/> : doc.uri && Platform.OS==='web' ? <View style={{ height:440 }}>{React.createElement('iframe',{ src:doc.uri,title:doc.name,style:{ width:'100%',height:'100%',border:0 } })}</View> : doc.uri ? <Button title={t('nativePdf')} onPress={() => void openPdf()}/> : <Copy>{t('originalUnavailable')}</Copy>}</Panel>}
    <Copy kind="title">{t('source')}</Copy>{facts.length ? facts.map(e => <EvidenceDetail key={e.id} event={e}/>) : <Copy>{t('extractionUnavailable')}</Copy>}
    <Copy>{t('reviewInfo')}</Copy><Button secondary disabled={doc.patientReviewed} title={doc.patientReviewed ? t('patientReviewed') : t('markReviewed')} onPress={() => { if (dispatch({ type:'review',id:doc.id })) notify(t('saved')); }}/>
    <Rule/><Copy kind="title">{t('flag')}</Copy><Field label={t('flagReason')} value={reason} onChange={setReason} multiline/><Button disabled={!reason.trim()} title={t('saveFlag')} onPress={() => { if (dispatch({ type:'flag',id:doc.id,reason })) { setReason(''); notify(t('flagSaved')); } }}/>
    <Panel tone="sage"><Copy kind="title">{t('glossary')}</Copy><Copy kind="meta">{t('glossaryInfo')}</Copy><Copy kind="label">{t('term')}</Copy><Copy>{t('termMeaning')}</Copy><Copy kind="meta">{t('termSource')}</Copy><Button title={t('glossaryToQuestion')} secondary onPress={() => { dispatch({ type:'question',text:`${t('glossaryToQuestion')} — ${doc.name}` }); router.push({ pathname:'/prepare',params:{ stage:'questions' } }); }}/></Panel>
  </Screen>;
}
