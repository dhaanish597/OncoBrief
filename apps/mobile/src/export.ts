import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
export { escapeHtml, buildExportHtml } from './packet-export';

export async function exportPacket(text: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'oncobrief-consultation-packet.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
  const path = `${FS.cacheDirectory}oncobrief-consultation-packet.txt`;
  await FS.writeAsStringAsync(path, text);
  try {
    await Sharing.shareAsync(path, {
      mimeType: 'text/plain',
      dialogTitle: 'OncoBrief · Consultation Preparation Packet',
    });
  } finally {
    await FS.deleteAsync(path, { idempotent: true });
  }
}
