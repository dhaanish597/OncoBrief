import React, { useMemo, useState } from 'react';
import { buildPacket } from '../src/domain';
import { exportPacket } from '../src/export';
import { useStore } from '../src/store';
import { Screen, Copy, Button, Toggle, Panel } from '../src/ui';
export default function Packet() {
  const { t,state,dispatch,notify }=useStore();const [approvalFor,setApprovalFor]=useState('');const [busy,setBusy]=useState(false);
  const text=useMemo(() => state.packSelected.length ? buildPacket(state,state.packSelected,true) : '',[state]);
  const approved=!!text && approvalFor===text;
  async function send() { if (!approved || !state.packSelected.length) return; setBusy(true);try { await exportPacket(text);dispatch({ type:'export',ids:state.packSelected,approved });notify(t('exportSuccess')); } catch { notify(t('exportError')); } finally { setBusy(false); } }
  return <Screen back title={t('packet')} intro={t('packetInfo')}><Panel><Copy selectable>{text || t('chooseFirst')}</Copy></Panel><Toggle title={t('approveExport')} checked={approved} onPress={() => setApprovalFor(approved ? '' : text)}/><Button disabled={!approved || busy || !text} title={busy ? t('loading') : t('export')} onPress={() => void send()}/></Screen>;
}
