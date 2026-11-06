import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useStore } from './store';
import { categories } from './i18n';
import { readiness } from './domain';
import { formatChecklistProgress } from './patient-selectors';
import { Copy, Button, LinkRow, Panel } from './ui';
import { theme as c } from './theme';
import { buildRecordsChartAccessibilityLabel, buildReadinessChartAccessibilityLabel, buildHistoryChartAccessibilityLabel } from './accessibility';
export function RecordsChart() {
  const { t,state }=useStore(); const router=useRouter();
  const groups=categories.filter(cat => state.documents.some(d => d.category===cat));
  const categoryCounts = groups.map(cat => ({ category: cat, count: state.documents.filter(d => d.category === cat).length }));
  return <View style={{ gap:18 }}><Copy kind="title">{t('recordsGraph')}</Copy><View style={{ alignItems:'center' }}><Svg width={260} height={190} viewBox="0 0 260 190" accessible={true} accessibilityRole="summary" accessibilityLabel={buildRecordsChartAccessibilityLabel(categoryCounts, state.locale)}>
    {groups.map((cat,i) => { const angle=2*Math.PI*i/groups.length-Math.PI/2;const x=130+88*Math.cos(angle);const y=95+65*Math.sin(angle);const open=() => router.push({ pathname:'/(tabs)/records',params:{ category:cat } });return <React.Fragment key={cat}><Line x1={130} y1={95} x2={x} y2={y} stroke={c.line} strokeWidth={1.5}/><Circle cx={x} cy={y} r={22} fill={i%2 ? c.sage : c.blue} stroke={c.cobalt} onPress={open}/><SvgText x={x} y={y+6} fontSize={18} textAnchor="middle" fill={c.ink} onPress={open}>{state.documents.filter(d => d.category===cat).length}</SvgText></React.Fragment>; })}
    <Circle cx={130} cy={95} r={30} fill={c.cobalt}/><SvgText x={130} y={102} fontSize={24} textAnchor="middle" fill={c.paper}>{state.documents.length}</SvgText>
  </Svg></View><Copy kind="meta">{t('recordsGraphInfo')}</Copy>{categories.map(cat => <LinkRow key={cat} title={`${t(cat)} · ${state.documents.filter(d => d.category===cat).length}`} onPress={() => router.push({ pathname:'/(tabs)/records',params:{ category:cat } })}/>)}</View>;
}
export function ReadinessChart() {
  const { t, state } = useStore();
  const router = useRouter();
  const progress = formatChecklistProgress(state);
  const length = 2 * Math.PI * 54;

  if (!progress.hasItems) {
    return (
      <Panel tone="blue">
        <Copy kind="title">{t('readinessTitle')}</Copy>
        <Copy kind="body">No checklist items yet</Copy>
        <Copy kind="meta">Create a personal visit preparation checklist to track your records, tasks, and questions.</Copy>
        <Button title="Create my checklist" onPress={() => router.push('/prepare')} />
      </Panel>
    );
  }

  return (
    <Panel tone="blue">
      <Copy kind="title">{t('readinessTitle')}</Copy>
      <View style={{ alignItems: 'center' }}>
        <Svg
          width={150}
          height={150}
          viewBox="0 0 150 150"
          accessible={true}
          accessibilityRole="summary"
          accessibilityLabel={buildReadinessChartAccessibilityLabel(progress.done, progress.total, state.locale)}
        >
          <Circle cx={75} cy={75} r={54} fill="none" stroke={c.paper} strokeWidth={7} />
          <Circle
            cx={75}
            cy={75}
            r={54}
            fill="none"
            stroke={c.cobalt}
            strokeWidth={7}
            strokeDasharray={`${(progress.done / progress.total) * length} ${length}`}
            rotation={-90}
            origin="75,75"
          />
          <SvgText x={75} y={84} fontSize={28} fill={c.cobalt} textAnchor="middle">
            {progress.done}/{progress.total}
          </SvgText>
        </Svg>
      </View>
      <Copy>
        {progress.done} {t('of')} {progress.total} {t('complete')} ({progress.percent}%)
      </Copy>
      <Copy kind="meta">{t('readinessDetail')}</Copy>
      <Button title={t('prepare')} onPress={() => router.push('/prepare')} />
    </Panel>
  );
}
export function LabChart() {
  const { t,state }=useStore();const router=useRouter();
  const values=state.ledger.flatMap(e => { const doc=state.documents.find(d => d.id===e.source.documentId);return doc && e.observation?.test==='haemoglobin' ? [{ doc,value:e.observation.value,status:e.status }] : []; }).sort((a,b) => a.doc.date.localeCompare(b.doc.date));
  const points=values.map((v,i) => ({ ...v,x:55+i*190,y:150-(v.value-10)*22 }));
  return <View style={{ gap:18 }}><Copy kind="title">{t('labTitle')}</Copy><Copy>{t('labIntro')}</Copy><Svg width="100%" height={210} viewBox="0 0 320 210" accessible={true} accessibilityRole="summary" accessibilityLabel={buildHistoryChartAccessibilityLabel(values.map(v => ({ id: v.doc.id, date: v.doc.date, value: v.value })), 'g/dL', state.locale)}>
    {[10,12,14,16].map(v => <React.Fragment key={v}><Line x1={40} x2={290} y1={150-(v-10)*22} y2={150-(v-10)*22} stroke={c.line}/><SvgText x={14} y={155-(v-10)*22} fontSize={12} fill={c.muted}>{v}</SvgText></React.Fragment>)}
    <Path d={points.map((p,i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} stroke={c.cobalt} strokeWidth={2.5} fill="none"/>
    {points.map(p => <React.Fragment key={p.doc.id}><Circle cx={p.x} cy={p.y} r={22} fill="transparent" onPress={() => router.push({ pathname:'/record/[id]',params:{ id:p.doc.id } })}/><Circle cx={p.x} cy={p.y} r={6} fill={c.cobalt}/><SvgText x={p.x} y={p.y-15} fill={c.cobalt} fontSize={14} textAnchor="middle">{p.value}</SvgText><SvgText x={p.x} y={183} fill={c.muted} fontSize={12} textAnchor="middle">{p.doc.date.slice(5)}</SvgText></React.Fragment>)}
  </Svg><Copy kind="label">{t('showData')}</Copy>{values.map(v => <LinkRow key={v.doc.id} title={`${v.doc.date} · ${v.value} g/dL`} subtitle={`${v.doc.facility} · ${v.doc.name} · ${t('page')} 1 · ${v.doc.version} · ${t(v.status==='clinician-confirmed' ? 'confirmed' : 'extracted')}`} onPress={() => router.push({ pathname:'/record/[id]',params:{ id:v.doc.id } })}/>)}<Copy kind="meta">{t('labMissing')}</Copy></View>;
}
