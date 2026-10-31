import React from 'react';
import Svg,{ Path,Circle,Rect,Line } from 'react-native-svg';
import { theme as c } from './theme';
export type IconName='home'|'records'|'journey'|'insights'|'profile'|'lab'|'calendar'|'check'|'heart'|'arrow'|'edit'|'plus'|'shield';
export function Icon({ name,color=c.cobalt,size=24 }:{ name:IconName;color?:string;size?:number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    {name==='home' && <><Path d="M3 10 12 3 21 10V21H15V14H9V21H3Z"/></>}
    {name==='records' && <><Path d="M5 3H14L19 8V21H5Z M14 3V8H19"/><Path d="M8 12H16 M8 16H14"/></>}
    {name==='journey' && <><Circle cx={5} cy={18} r={2.5}/><Circle cx={19} cy={5} r={2.5}/><Path d="M5 15V8Q5 5 9 5H13 M19 8V16Q19 19 15 19H11"/></>}
    {name==='insights' && <><Path d="M4 20V12 M10 20V5 M16 20V9 M22 20V2"/></>}
    {name==='profile' && <><Circle cx={12} cy={7} r={4}/><Path d="M4 21V18Q4 12 12 12Q20 12 20 18V21Z"/></>}
    {name==='lab' && <><Path d="M9 3H15 M10 3V10L4 19Q3 21 6 21H18Q21 21 20 19L14 10V3 M7 15H17"/></>}
    {name==='calendar' && <><Rect x={3} y={5} width={18} height={16} rx={3}/><Path d="M7 3V8 M17 3V8 M3 11H21 M7 15H10"/></>}
    {name==='check' && <><Circle cx={12} cy={12} r={9}/><Path d="M7 12 10 15 17 8"/></>}
    {name==='heart' && <Path d="M12 21 3 12C-2 5 6-1 12 6C18-1 26 5 21 12Z"/>}
    {name==='arrow' && <Path d="M9 5 16 12 9 19"/>}
    {name==='edit' && <><Path d="M4 16 16 4 20 8 8 20 3 21Z M14 6 18 10"/></>}
    {name==='plus' && <><Circle cx={12} cy={12} r={9}/><Path d="M12 7V17 M7 12H17"/></>}
    {name==='shield' && <><Path d="M12 2 21 6V12Q20 19 12 22Q4 19 3 12V6Z"/><Path d="M8 12 11 15 16 9"/></>}
    <Line x1={0} y1={0} x2={0} y2={0}/>
  </Svg>;
}
