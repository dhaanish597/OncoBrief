import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { type Evidence } from './domain';
import { filterJourney } from './patient-selectors';
import { useStore } from './store';
import { Badge,Button,Chip,Copy,DocumentRow,Empty,Field,Panel,Row } from './ui';
import { theme as c } from './theme';
export function EvidenceDetail({ event }: { event: Evidence }) {
  const { t,state,mode } = useStore(); const router=useRouter(); const doc=state.documents.find(d => d.id===event.source.documentId);
  return <Panel tone={event.status==='conflicting' ? 'amber' : 'paper'}><Copy kind="meta">{t('evidence')}</Copy><Copy kind="label">{t('quote')}</Copy><Copy selectable>{event.source.quote ? `“${event.source.quote}”` : 'Source text unavailable'}</Copy><Copy kind="meta">{doc?.name || event.source.documentName || 'Source document unavailable'} · {t('page')} {event.source.page ?? 'Unavailable'} · {t('version')} {event.source.version ?? 'Unavailable'}</Copy><Copy kind="meta">{mode === 'connected' ? 'Extraction method' : t('method')}: {event.source.method ?? 'Unavailable'}</Copy><Copy kind="meta">{event.source.reviewer ? `${t('reviewer')}: ${event.source.reviewer} · ${event.source.reviewedAt ?? 'Review time unavailable'}` : t('noReviewer')}</Copy><Button secondary title={t('openReport')} onPress={() => router.push({ pathname:'/record/[id]',params:{ id:event.source.documentId } })}/></Panel>;
}
export function JourneyContent({ appointmentsOnly = false }: { appointmentsOnly?: boolean }) {
  const { state,t } = useStore(); const [kind,setKind]=useState(appointmentsOnly ? 'appointment' : 'all'); const [from,setFrom]=useState(''); const [to,setTo]=useState(''); const [expanded,setExpanded]=useState<string | null>(null);const [query,setQuery]=useState('');const [sort,setSort]=useState<'newest'|'oldest'>('newest');const [dates,setDates]=useState(false);
  const invalid = [from,to].some(v => v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v)) || !!(from && to && from>to);
  const events=invalid ? [] : filterJourney(state,{ category:kind,query,from,to,sort });
  return <View style={{ gap:20 }}>
    <Field label={t('searchJourney')} value={query} onChange={setQuery}/>
    {!appointmentsOnly && <Row>{(['all','document','appointment','laboratory','imaging','pathology','referral','note'] as const).map(k => <Chip key={k} title={t(k)} active={kind===k} onPress={() => setKind(k)}/>)}</Row>}
    <Row><Chip title={t('filters')} active={dates} onPress={() => setDates(!dates)}/><Chip title={t('newest')} active={sort==='newest'} onPress={() => setSort('newest')}/><Chip title={t('oldest')} active={sort==='oldest'} onPress={() => setSort('oldest')}/></Row>
    {dates && <><Field label={t('from')} value={from} onChange={setFrom} maxLength={10}/><Field label={t('to')} value={to} onChange={setTo} maxLength={10}/></>}
    {invalid && <Copy style={{ color:c.red }}>{t('dateError')}</Copy>}
    {events.length===0 && <Empty title={t('noEvents')}/>}
    {events.map(e => <View key={e.id} style={{ flexDirection:'row',gap:16 }}>
      <View style={{ width:18,alignItems:'center' }}><View style={{ width:13,height:13,borderRadius:8,borderWidth:2,borderColor:c.cobalt,backgroundColor:e.status==='conflicting' ? c.amber : c.blue,marginTop:7 }}/><View style={{ flex:1,width:1,backgroundColor:c.line,marginTop:6 }}/></View>
      <View style={{ flex:1,gap:10,padding:14,marginBottom:10,backgroundColor:c.paper,borderRadius:14,borderWidth:1,borderColor:c.line }}><Copy kind="meta" style={{ color:c.cobalt }}>{e.date || 'Date unavailable'}</Copy><Copy kind="label" style={{ fontSize:16 }}>{state.locale==='ta' ? e.titleTa : e.title}</Copy><Badge text={t(e.status==='conflicting' ? 'conflicting' : e.status==='clinician-confirmed' ? 'confirmedShort' : 'extractedShort')} tone={e.status==='conflicting' ? 'amber' : 'blue'}/><Copy kind="meta">{state.documents.find(d => d.id===e.source.documentId)?.facility} · {t('page')} {e.source.page ?? 'Unavailable'}</Copy><Button secondary title={expanded===e.id ? t('close') : t('source')} onPress={() => setExpanded(expanded===e.id ? null : e.id)}/>{expanded===e.id && <EvidenceDetail event={e}/>}</View>
    </View>)}
    {!appointmentsOnly && !!state.notes && <Panel tone="sage"><Copy kind="label">{t('localNote')}</Copy><Copy>{state.notes}</Copy></Panel>}
    {!appointmentsOnly && state.documents.filter(d => d.extraction==='unavailable').map(d => <DocumentRow key={d.id} doc={d}/>)}
  </View>;
}
