import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useStore } from './store';
import { timeline } from './domain';
import { Button, Copy, Row } from './ui';
import { EvidenceDetail } from './journey';
import { theme as c } from './theme';
export function AppointmentCalendar() {
  const { state,t }=useStore();const [month,setMonth]=useState(new Date('2026-10-01T00:00:00Z'));const [selected,setSelected]=useState('');
  const locale=state.locale==='ta' ? 'ta-IN' : 'en-IN';const first=month.getUTCDay();const count=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();const prefix=month.toISOString().slice(0,7);const events=timeline(state,'appointment');
  const move=(delta:number) => { setMonth(new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+delta,1)));setSelected(''); };
  return <View style={{ gap:16 }}><Row><View style={{ flex:1 }}><Button title="←" secondary onPress={() => move(-1)}/></View><View style={{ flex:3 }}><Copy kind="label" style={{ textAlign:'center' }}>{month.toLocaleDateString(locale,{ month:'long',year:'numeric',timeZone:'UTC' })}</Copy></View><View style={{ flex:1 }}><Button title="→" secondary onPress={() => move(1)}/></View></Row>
    <View style={{ flexDirection:'row',flexWrap:'wrap' }}>{Array.from({ length:7 },(_,i) => <View key={`week${i}`} style={{ width:'14.2857%',minHeight:36,alignItems:'center' }}><Copy kind="meta">{new Date(Date.UTC(2026,9,25+i)).toLocaleDateString(locale,{ weekday:'narrow',timeZone:'UTC' })}</Copy></View>)}
      {Array.from({ length:first+count },(_,i) => { const day=i-first+1;const date=`${prefix}-${String(day).padStart(2,'0')}`;const sourced=events.some(e => e.date===date);return day<1 ? <View key={`blank${i}`} style={{ width:'14.2857%' }}/> : sourced ? <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${date} · ${t('conflicting')}`} onPress={() => setSelected(date)} style={{ width:'14.2857%',minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:selected===date ? c.cobalt : c.amber,borderRadius:4 }}><Copy style={{ color:selected===date ? c.paper : c.ink }}>{day}•</Copy></Pressable> : <View key={date} style={{ width:'14.2857%',minHeight:48,alignItems:'center',justifyContent:'center' }}><Copy kind="meta">{day}</Copy></View>; })}
    </View><Copy kind="meta">{t('appointmentInfo')}</Copy>{selected && events.filter(e => e.date===selected).map(e => <EvidenceDetail key={e.id} event={e}/>)}{!events.some(e => e.date.startsWith(prefix)) && <Copy>{t('noEvents')}</Copy>}
  </View>;
}
