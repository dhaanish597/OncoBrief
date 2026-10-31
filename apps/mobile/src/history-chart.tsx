import React from 'react';
import { View } from 'react-native';
import Svg,{ Circle,Line,Path,Rect,Text as SvgText } from 'react-native-svg';
import { Copy } from './ui';
import { theme as c } from './theme';
export interface PlotPoint { id:string;date:string;value:number;displayDate?:string }
export function HistoryChart({ points,unit,selected,onSelect,reference,variant='line',fixedScale }:{ points:PlotPoint[];unit:string;selected?:string;onSelect(id:string):void;reference?:{ low:number;high:number };variant?:'line'|'columns';fixedScale?:[number,number] }) {
  const chronological=[...points].sort((a,b) => a.date.localeCompare(b.date));
  if (!chronological.length) return null;
  const numbers=chronological.map(p => p.value);if (reference) numbers.push(reference.low,reference.high);
  const min=fixedScale?.[0] ?? (variant==='columns' ? 0 : Math.floor(Math.min(...numbers)/2)*2-2);
  const max=fixedScale?.[1] ?? Math.max(min+4,Math.ceil(Math.max(...numbers)/2)*2);
  const first=Date.parse(chronological[0]!.date);const last=Date.parse(chronological.at(-1)!.date);const y=(n:number) => 190-(n-min)/(max-min)*145;
  const coords=chronological.map(p => ({ ...p,x:chronological.length===1 ? 180 : 50+(Date.parse(p.date)-first)/(last-first || 1)*265,y:y(p.value) }));
  const chosen=coords.find(p => p.id===selected);const ticks=Array.from({ length:5 },(_,i) => min+(max-min)*i/4);
  return <View style={{ gap:6 }}><Svg width="100%" height={245} viewBox="0 0 350 245" accessible={false}>
    {reference && <><Rect x={44} y={y(reference.high)} width={279} height={y(reference.low)-y(reference.high)} fill={c.blue}/><Line x1={44} x2={323} y1={y(reference.high)} y2={y(reference.high)} stroke="#88AAFF" strokeDasharray="4 4"/><Line x1={44} x2={323} y1={y(reference.low)} y2={y(reference.low)} stroke="#88AAFF" strokeDasharray="4 4"/></>}
    <SvgText x={10} y={22} fontSize={12} fill={c.muted}>{unit}</SvgText>
    {ticks.map(tick => <React.Fragment key={tick}><Line x1={44} x2={323} y1={y(tick)} y2={y(tick)} stroke={c.line} strokeDasharray="2 3"/><SvgText x={35} y={y(tick)+4} textAnchor="end" fontSize={11} fill={c.muted}>{Number(tick.toFixed(2))}</SvgText></React.Fragment>)}
    <Line x1={44} x2={44} y1={38} y2={190} stroke="#9BAFCB"/><Line x1={44} x2={323} y1={190} y2={190} stroke="#9BAFCB"/>
    {variant==='line' && coords.length>1 && <Path d={coords.map((p,i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} stroke={c.cobalt} strokeWidth={2} fill="none"/>}
    {coords.map((p,i) => <React.Fragment key={p.id}>
      {variant==='columns' && <Rect x={p.x-8} y={p.y} width={16} height={190-p.y} fill={p.id===selected ? c.cobalt : '#B7C9FF'} rx={5} onPress={() => onSelect(p.id)}/>}
      <Circle cx={p.x} cy={p.y} r={p.id===selected ? 8 : 5} fill={c.cobalt} stroke={c.paper} strokeWidth={2} onPress={() => onSelect(p.id)}/>
      <Circle cx={p.x} cy={p.y} r={22} fill="transparent" onPress={() => onSelect(p.id)}/>
      {(!chosen || p.id!==selected) && <SvgText x={p.x} y={p.y-14} textAnchor="middle" fontSize={12} fill={c.ink}>{p.value}</SvgText>}
      {(coords.length<5 || i===0 || i===coords.length-1) && <SvgText x={p.x} y={211} textAnchor="middle" fontSize={11} fill={c.muted}>{(p.displayDate || p.date).slice(5,10)}</SvgText>}
    </React.Fragment>)}
    {chosen && <><Rect x={Math.min(245,Math.max(45,chosen.x-41))} y={Math.max(1,chosen.y-47)} width={85} height={33} rx={6} fill={c.ink}/><SvgText x={Math.min(287,Math.max(87,chosen.x))} y={Math.max(22,chosen.y-25)} textAnchor="middle" fontSize={12} fill={c.paper}>{chosen.value} {unit}</SvgText></>}
  </Svg><Copy kind="meta" style={{ textAlign:'center' }}>{(chronological[0]!.displayDate || chronological[0]!.date).slice(0,10)} — {(chronological.at(-1)!.displayDate || chronological.at(-1)!.date).slice(0,10)}</Copy></View>;
}
