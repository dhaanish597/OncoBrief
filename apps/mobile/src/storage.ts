import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { createDemo, hydrate, type State } from './domain';
const root = `${FS.documentDirectory ?? ''}oncobrief-demo/`;
const statePath = `${root}state-v1.json`;
export async function loadState(): Promise<State> {
  if (Platform.OS === 'web') return createDemo();
  const info = await FS.getInfoAsync(statePath);
  return info.exists ? hydrate(await FS.readAsStringAsync(statePath)) : createDemo();
}
export async function saveState(state: State) {
  if (Platform.OS === 'web') return;
  await FS.makeDirectoryAsync(root, { intermediates: true });
  await FS.writeAsStringAsync(`${statePath}.tmp`, JSON.stringify(state));
  await FS.moveAsync({ from: `${statePath}.tmp`, to: statePath });
}
export async function eraseState() {
  if (Platform.OS !== 'web') await FS.deleteAsync(root, { idempotent: true });
}
export async function retainSample(uri: string, id: string, ext: string) {
  if (Platform.OS === 'web') return uri;
  await FS.makeDirectoryAsync(root, { intermediates: true });
  const target = `${root}${id}.${ext}`;
  await FS.copyAsync({ from: uri, to: target });
  return target;
}
