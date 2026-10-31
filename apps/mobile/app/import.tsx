import React, { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Picker from 'expo-document-picker';
import * as Camera from 'expo-image-picker';
import * as FS from 'expo-file-system/legacy';
import { useStore } from '../src/store';
import { validateFile, type Category } from '../src/domain';
import { matchesSignature } from '../src/file-validation';
import { retainSample } from '../src/storage';
import { categories } from '../src/i18n';
import { Screen, Copy, Button, Panel, Toggle, Row, Chip } from '../src/ui';
import { NotebookArt } from '../src/art';
interface Sample { name:string;uri:string;mimeType:string;size:number }
export default function Import() {
  const { t,dispatch,notify }=useStore();const router=useRouter();const [consent,setConsent]=useState(false);const [sample,setSample]=useState<Sample | null>(null);const [category,setCategory]=useState<Category>('other');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [progress,setProgress]=useState(0);
  async function choose(camera=false) {
    if (!consent) return;setError('');
    try {
      if (camera) {
        if (Platform.OS==='web') { setError(t('permissionDenied'));return; }
        const permission=await Camera.requestCameraPermissionsAsync();if (!permission.granted) { setError(t('permissionDenied'));return; }
        const result=await Camera.launchCameraAsync({ mediaTypes:['images'],quality:0.85 });if (result.canceled) return;const image=result.assets[0];if (!image) return;
        const info=await FS.getInfoAsync(image.uri);setSample({ uri:image.uri,name:image.fileName || 'sample-capture.jpg',mimeType:image.mimeType || 'image/jpeg',size:image.fileSize || (info.exists ? info.size : 0) });
      } else {
        const result=await Picker.getDocumentAsync({ type:['application/pdf','image/jpeg','image/png'],copyToCacheDirectory:true,multiple:false });if (result.canceled) return;const file=result.assets[0];if (!file) return;
        const candidate={ uri:file.uri,name:file.name,mimeType:file.mimeType || '',size:file.size || 0 };if (validateFile(candidate)) { setError(t('invalidFile'));setSample(null);return; }setSample(candidate);
      }
    } catch { setError(t('error')); }
  }
  async function save() {
    if (!sample || !consent || validateFile(sample)) { setError(t('invalidFile'));return; }setBusy(true);setError('');setProgress(0.15);
    try {
      let bytes:Uint8Array;
      if (Platform.OS==='web') bytes=new Uint8Array(await (await fetch(sample.uri)).arrayBuffer()).slice(0,8);
      else { const base64=await FS.readAsStringAsync(sample.uri,{ encoding:FS.EncodingType.Base64,position:0,length:8 });bytes=Uint8Array.from(atob(base64),c => c.charCodeAt(0)); }
      if (!matchesSignature(bytes,sample.mimeType)) throw new Error('invalid_file');setProgress(0.5);
      const id=`sample-${Date.now()}`;const ext=sample.mimeType==='application/pdf' ? 'pdf' : sample.mimeType==='image/png' ? 'png' : 'jpg';const uri=await retainSample(sample.uri,id,ext);setProgress(1);
      if (dispatch({ type:'import',document:{ id,name:sample.name,category,date:'',facility:t('demoShort'),mimeType:sample.mimeType,size:sample.size,uri,version:'local-original-v1',extraction:'unavailable',patientReviewed:false,clinicianVerified:false,addedAt:new Date().toISOString() } })) { notify(t('localCopy'));router.replace({ pathname:'/record/[id]',params:{ id } }); }
    } catch { setError(t('invalidFile')); } finally { setBusy(false); }
  }
  return <Screen back title={t('importTitle')} intro={t('importInfo')}><NotebookArt/><Panel tone="amber"><Copy>{t('demoInfo')}</Copy><Toggle title={t('fileConsent')} checked={consent} onPress={() => setConsent(!consent)}/></Panel><Button title={t('chooseFile')} disabled={!consent || busy} onPress={() => void choose()}/>{Platform.OS!=='web' && <Button secondary title={t('camera')} disabled={!consent || busy} onPress={() => void choose(true)}/>}
    {sample && <Panel><Copy kind="label">{sample.name}</Copy><Copy kind="meta">{sample.mimeType} · {(sample.size/1024).toFixed(1)} KB</Copy>{sample.mimeType.startsWith('image/') && <Image source={{ uri:sample.uri }} accessibilityLabel={sample.name} resizeMode="contain" style={{ width:'100%',height:240 }}/>}<Copy>{t('selectCategory')}</Copy><Row>{categories.map(cat => <Chip key={cat} title={t(cat)} active={cat===category} onPress={() => setCategory(cat)}/>)}</Row><Button title={busy ? t('loading') : t('import')} disabled={!consent || busy} onPress={() => void save()}/></Panel>}
    {busy && <View accessibilityRole="progressbar" accessibilityValue={{ min:0,max:100,now:progress*100 }} style={{ height:6,backgroundColor:'#D7CBB3' }}><View style={{ width:`${progress*100}%`,height:6,backgroundColor:'#315A91' }}/></View>}{!!error && <Panel tone="amber"><Copy>{error}</Copy></Panel>}
  </Screen>;
}
