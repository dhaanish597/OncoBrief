import React, { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useRouter,type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from './store';
import { theme as c } from './theme';
import { Icon,type IconName } from './icons';
import { NotebookArt } from './art';
import type { DocumentRecord } from './domain';
export function Copy({ children,kind='body',style,selectable=false }:{ children:ReactNode;kind?:'body'|'title'|'display'|'meta'|'label';style?:TextStyle;selectable?:boolean }) { return <Text selectable={selectable} style={[styles[kind],style]}>{children}</Text>; }
export function Button({ title,onPress,secondary=false,disabled=false,testID }:{ title:string;onPress():void;secondary?:boolean;disabled?:boolean;testID?:string }) { return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button,secondary && styles.secondary,(disabled || pressed) && { opacity:disabled ? 0.45 : 0.75 }]}><Copy kind="label" style={{ color:secondary ? c.cobalt : c.paper,textAlign:'center' }}>{title}</Copy></Pressable>; }
export function Row({ children,wrap=true }:{ children:ReactNode;wrap?:boolean }) { return <View style={{ flexDirection:'row',alignItems:'center',gap:10,flexWrap:wrap ? 'wrap' : 'nowrap' }}>{children}</View>; }
export function Rule() { return <View style={{ height:1,backgroundColor:c.line,marginVertical:8 }}/>; }
export function Panel({ children,tone='paper',compact=false }:{ children:ReactNode;tone?:'paper'|'blue'|'sage'|'amber';compact?:boolean }) { return <View style={{ backgroundColor:c[tone],padding:compact ? 14 : 16,gap:compact ? 8 : 12,borderRadius:16,borderWidth:1,borderColor:tone==='paper' ? c.line : c[tone] }}>{children}</View>; }
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  testID,
  maxLength = 1000,
  onFocus,
}: {
  label: string;
  value: string;
  onChange(s: string): void;
  multiline?: boolean;
  placeholder?: string;
  testID?: string;
  maxLength?: number;
  onFocus?: () => void;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Copy kind="label">{label}</Copy>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        multiline={multiline}
        maxLength={maxLength}
        onFocus={onFocus}
        style={[styles.input, multiline && { minHeight: 100, textAlignVertical: 'top' }]}
      />
    </View>
  );
}
export function Chip({ title,active,onPress,accessibilityLabel }:{ title:string;active?:boolean;onPress():void;accessibilityLabel?:string }) { return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} aria-pressed={!!active} accessibilityState={{ selected:!!active }} onPress={onPress} style={[styles.chip,active && { backgroundColor:c.cobalt,borderColor:c.cobalt }]}><Copy kind="meta" style={{ color:active ? c.paper : c.muted,fontWeight:active ? '600' : '400' }}>{title}</Copy></Pressable>; }
export function Toggle({ title,checked,onPress,testID }:{ title:string;checked:boolean;onPress():void;testID?:string }) { return <Pressable testID={testID} accessibilityRole="checkbox" accessibilityLabel={title} accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection:'row',alignItems:'center',gap:11,minHeight:52,paddingVertical:8 }}><View style={{ width:23,height:23,borderWidth:1.5,borderRadius:5,borderColor:checked ? c.cobalt : c.muted,backgroundColor:checked ? c.cobalt : c.paper,alignItems:'center',justifyContent:'center' }}><Text style={{ color:c.paper,fontSize:16 }}>{checked ? '✓' : ''}</Text></View><View style={{ flex:1 }}><Copy>{title}</Copy></View></Pressable>; }
export function LinkRow({ title,subtitle,href,onPress }:{ title:string;subtitle?:string;href?:Href;onPress?:()=>void }) { const router=useRouter();return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => onPress ? onPress() : href && router.push(href)} style={{ flexDirection:'row',alignItems:'center',gap:12,minHeight:54,paddingVertical:13,borderBottomWidth:1,borderColor:c.line }}><View style={{ flex:1,gap:4 }}><Copy kind="label">{title}</Copy>{subtitle && <Copy kind="meta">{subtitle}</Copy>}</View><Icon name="arrow" size={17}/></Pressable>; }
export function Badge({ text,tone='blue' }:{ text:string;tone?:'blue'|'sage'|'amber' }) { return <View style={{ backgroundColor:c[tone],borderRadius:6,paddingHorizontal:9,paddingVertical:5,alignSelf:'flex-start' }}><Copy kind="meta" style={{ color:tone==='sage' ? c.teal : tone==='amber' ? '#785500' : c.cobalt,fontSize:12 }}>{text}</Copy></View>; }
export function SectionHeading({ title,action,onPress,icon }:{ title:string;action?:string;onPress?:()=>void;icon?:IconName }) { return <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10 }}><View style={{ flexDirection:'row',alignItems:'center',gap:9,flex:1 }}>{icon && <Icon name={icon} size={21}/>}<Copy kind="label" style={{ flex:1,fontSize:16 }}>{title}</Copy></View>{action && onPress && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onPress} style={{ minHeight:48,justifyContent:'center' }}><Copy kind="meta" style={{ color:c.cobalt,fontWeight:'600' }}>{action}</Copy></Pressable>}</View>; }
export function Screen({ children, title, intro, back = false }: { children: ReactNode; title?: string; intro?: string; back?: boolean }) {
  const { t, ready, state, dispatch, storageError, retryStorage, flash } = useStore();
  const router = useRouter();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!ready) return <SafeAreaView style={styles.safe}><ActivityIndicator color={c.cobalt} /><Copy>{t('loading')}</Copy></SafeAreaView>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 9, backgroundColor: c.paper, borderBottomWidth: 1, borderColor: c.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ minHeight: 48, justifyContent: 'center' }}>
              <Copy kind="label" style={{ color: c.cobalt }}>‹ {t('back')}</Copy>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 25, fontWeight: '800', color: '#101F43', letterSpacing: -1 }}>Onco<Text style={{ color: c.cobalt }}>Brief</Text></Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={t('language')} onPress={() => dispatch({ type: 'locale', locale: state.locale === 'en' ? 'ta' : 'en' })} style={{ paddingHorizontal: 12, minHeight: 48, borderRadius: 22, backgroundColor: c.blue, justifyContent: 'center' }}>
            <Copy kind="meta" style={{ color: c.cobalt }}>{state.locale === 'en' ? 'English' : 'தமிழ்'} ⌄</Copy>
          </Pressable>
        </View>
        <Row><Icon name="shield" size={13} /><Copy kind="meta" style={{ fontSize: 11, color: c.muted }}>{t('demo')}</Copy></Row>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          testID="screen-scroll"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 19,
            paddingBottom: Platform.OS === 'android' ? 48 : Math.max(36, keyboardHeight + 48),
            alignItems: 'center',
          }}
        >
          <View style={{ width: '100%', maxWidth: 620, gap: 16 }}>
            {state.mode === 'connected' && (state.pendingSyncCount ?? 0) > 0 && (
              <Panel tone="amber">
                <Copy>{state.pendingSyncCount} hospital change(s) waiting to sync. Keep this session open until saved.</Copy>
                <Button secondary title="Retry sync" onPress={() => void retryStorage().catch(() => { /* Pending changes remain available for another retry. */ })} />
              </Panel>
            )}
            {storageError && (
              <Panel tone="amber">
                <Copy>{t('storageError')}</Copy>
                <Button secondary title={t('retry')} onPress={() => void retryStorage()} />
                <Button secondary title={t('reset')} onPress={() => router.push({ pathname: '/confirm', params: { action: 'reset' } })} />
              </Panel>
            )}
            {title && <View style={{ gap: 7 }}><Copy kind="display">{title}</Copy>{intro && <Copy style={{ color: c.muted }}>{intro}</Copy>}</View>}
            {children}
            <Copy kind="meta" style={{ textAlign: 'center', marginTop: 4, fontSize: 11 }}>{t('offline')}</Copy>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {!!flash && (
        <View accessibilityLiveRegion="polite" style={{ position: 'absolute', bottom: 12, left: 15, right: 15, padding: 15, backgroundColor: c.ink, borderRadius: 12 }}>
          <Copy style={{ color: c.paper }}>{flash}</Copy>
        </View>
      )}
    </SafeAreaView>
  );
}
export function DocumentRow({ doc,selected,onSelect }:{ doc:DocumentRecord;selected?:boolean;onSelect?:()=>void }) {
  const { t }=useStore();const router=useRouter();return <View style={{ gap:7,paddingVertical:12,borderBottomWidth:1,borderColor:c.line }}><Pressable accessibilityRole="button" accessibilityLabel={`${doc.name}, ${t(doc.category)}`} onPress={() => router.push({ pathname:'/record/[id]',params:{ id:doc.id } })} style={{ flexDirection:'row',alignItems:'center',gap:11,minHeight:56 }}><View style={{ backgroundColor:c.blue,padding:10,borderRadius:12 }}><Icon name="records" size={23}/></View><View style={{ flex:1,gap:4 }}><Copy kind="label">{doc.name}</Copy><Copy kind="meta">{doc.facility || 'Facility unavailable'} · {doc.date || t('dateUnknown')}</Copy></View><Icon name="arrow" size={16}/></Pressable><Row><Badge text={t(doc.clinicianVerified ? 'confirmedShort' : doc.extraction==='unavailable' ? 'localShort' : 'extractedShort')} tone={doc.clinicianVerified ? 'blue' : 'amber'}/>{doc.patientReviewed && <Badge text={t('reviewedShort')} tone="sage"/>}</Row>{onSelect && <Toggle title={`${t(selected ? 'selected' : 'unselected')}: ${doc.name}`} checked={!!selected} onPress={onSelect}/>}</View>;
}
export function Empty({ title,detail }:{ title:string;detail?:string }) { return <View style={{ gap:10,paddingVertical:10 }}><NotebookArt/><Copy kind="title">{title}</Copy>{detail && <Copy>{detail}</Copy>}</View>; }
export const styles=StyleSheet.create({
  safe:{ flex:1,backgroundColor:c.bg },display:{ fontSize:28,lineHeight:35,fontWeight:'700',color:c.ink,letterSpacing:-0.6 },title:{ fontSize:21,lineHeight:28,fontWeight:'600',color:c.ink },body:{ fontSize:14,lineHeight:22,color:c.ink },meta:{ fontSize:12,lineHeight:18,color:c.muted },label:{ fontSize:14,lineHeight:21,fontWeight:'600',color:c.ink },button:{ minHeight:49,backgroundColor:c.cobalt,borderRadius:11,paddingHorizontal:16,paddingVertical:13,justifyContent:'center' },secondary:{ backgroundColor:c.blue },input:{ minHeight:49,borderWidth:1,borderColor:c.line,borderRadius:10,padding:13,backgroundColor:c.paper,color:c.ink,fontSize:15,lineHeight:23 },chip:{ minHeight:48,paddingVertical:10,paddingHorizontal:13,borderRadius:10,borderWidth:1,borderColor:c.line,backgroundColor:c.paper,justifyContent:'center' },
});
