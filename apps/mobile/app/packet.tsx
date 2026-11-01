import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { buildPacket } from '../src/domain';
import { exportPacket, buildExportHtml } from '../src/export';
import { useStore } from '../src/store';
import { Screen, Copy, Button, Toggle, Panel } from '../src/ui';

export default function Packet() {
  const { t, state, dispatch, notify } = useStore();
  const [approvalFor, setApprovalFor] = useState('');
  const [busy, setBusy] = useState(false);

  const text = useMemo(
    () => (state.packSelected.length ? buildPacket(state, state.packSelected, true) : ''),
    [state],
  );
  const approved = !!text && approvalFor === text;

  async function send() {
    if (!approved || !state.packSelected.length) return;
    setBusy(true);
    try {
      await exportPacket(text);
      dispatch({ type: 'export', ids: state.packSelected, approved });
      notify(t('exportSuccess'));
    } catch {
      notify(t('exportError'));
    } finally {
      setBusy(false);
    }
  }

  async function sendHtml() {
    if (!approved || !state.packSelected.length) return;
    setBusy(true);
    try {
      const html = buildExportHtml(state);
      await exportPacket(html);
      notify('Consultation HTML packet exported safely.');
    } catch {
      notify(t('exportError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back title={t('packet')} intro={t('packetInfo')}>
      <Panel>
        <Copy selectable>{text || t('chooseFirst')}</Copy>
      </Panel>

      <Toggle
        title={t('approveExport')}
        checked={approved}
        onPress={() => setApprovalFor(approved ? '' : text)}
      />

      <View style={{ gap: 10 }}>
        <Button
          disabled={!approved || busy || !text}
          title={busy ? t('loading') : t('export')}
          onPress={() => void send()}
        />
        <Button
          secondary
          disabled={!approved || busy || !text}
          title="Export Sanitized Printable HTML"
          onPress={() => void sendHtml()}
        />
      </View>
    </Screen>
  );
}
