import { createDemo, hydrate, type State } from './domain';
import {
  encryptEnvelope,
  decryptEnvelope,
  generateEncryptionKey,
  bytesToBase64,
  base64ToBytes,
  type EncryptedEnvelopeV2,
} from './crypto-envelope';

const SECURE_STORE_KEY = 'oncobrief_state_encryption_key_v2';
const WEB_LOCAL_STORAGE_STATE_KEY = 'oncobrief_demo_state_v2';
const WEB_LOCAL_STORAGE_KEY_ALIAS = 'oncobrief_demo_key_v2';

export interface StorageBackendTestOverrides {
  isWeb?: boolean;
  read?: (path: string) => Promise<string | null>;
  write?: (path: string, content: string) => Promise<void>;
  delete?: (path: string) => Promise<void>;
  secureGet?: (key: string) => Promise<string | null>;
  secureSet?: (key: string, val: string) => Promise<void>;
  secureDelete?: (key: string) => Promise<void>;
  webGetItem?: (key: string) => string | null;
  webSetItem?: (key: string, val: string) => void;
  webRemoveItem?: (key: string) => void;
}

let testBackend: StorageBackendTestOverrides | null = null;

export function setStorageBackendForTesting(overrides: StorageBackendTestOverrides | null) {
  testBackend = overrides;
}

function isWebEnvironment(): boolean {
  if (testBackend?.isWeb !== undefined) return testBackend.isWeb;
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') return true;
  return false;
}

async function getNativeFS() {
  return await import('expo-file-system/legacy');
}

async function getNativeSecureStore() {
  return await import('expo-secure-store');
}

async function getStoragePaths() {
  const fs = await getNativeFS();
  const root = `${fs.documentDirectory ?? ''}oncobrief-demo/`;
  return {
    root,
    v2Path: `${root}state-v2.enc.json`,
    v1Path: `${root}state-v1.json`,
  };
}

async function getOrCreateKey(): Promise<Uint8Array> {
  if (testBackend?.secureGet) {
    const existing = await testBackend.secureGet(SECURE_STORE_KEY);
    if (existing) {
      return base64ToBytes(existing);
    }
    const fresh = generateEncryptionKey();
    if (testBackend.secureSet) {
      await testBackend.secureSet(SECURE_STORE_KEY, bytesToBase64(fresh));
    }
    return fresh;
  }

  if (isWebEnvironment()) {
    const getItem =
      testBackend?.webGetItem ??
      ((k: string) =>
        typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(k) : null);
    const setItem =
      testBackend?.webSetItem ??
      ((k: string, v: string) => {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(k, v);
      });
    const existing = getItem(WEB_LOCAL_STORAGE_KEY_ALIAS);
    if (existing) {
      return base64ToBytes(existing);
    }
    const fresh = generateEncryptionKey();
    setItem(WEB_LOCAL_STORAGE_KEY_ALIAS, bytesToBase64(fresh));
    return fresh;
  }

  try {
    const secureStore = await getNativeSecureStore();
    const existing = await secureStore.getItemAsync(SECURE_STORE_KEY);
    if (existing) {
      return base64ToBytes(existing);
    }
    const fresh = generateEncryptionKey();
    await secureStore.setItemAsync(SECURE_STORE_KEY, bytesToBase64(fresh));
    return fresh;
  } catch {
    return generateEncryptionKey();
  }
}

async function shredKey(): Promise<void> {
  if (testBackend?.secureDelete) {
    await testBackend.secureDelete(SECURE_STORE_KEY);
  }
  if (isWebEnvironment()) {
    const removeItem =
      testBackend?.webRemoveItem ??
      ((k: string) => {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(k);
      });
    removeItem(WEB_LOCAL_STORAGE_KEY_ALIAS);
    return;
  }
  try {
    const secureStore = await getNativeSecureStore();
    await secureStore.deleteItemAsync(SECURE_STORE_KEY);
  } catch {
    // idempotent
  }
}

export async function loadState(): Promise<State> {
  if (isWebEnvironment()) {
    const getItem =
      testBackend?.webGetItem ??
      ((k: string) =>
        typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(k) : null);
    const rawEnvelope = getItem(WEB_LOCAL_STORAGE_STATE_KEY);
    if (!rawEnvelope) return createDemo();
    try {
      const envelope = JSON.parse(rawEnvelope) as EncryptedEnvelopeV2;
      const key = await getOrCreateKey();
      const decrypted = await decryptEnvelope(envelope, key);
      return hydrate(decrypted);
    } catch {
      return createDemo();
    }
  }

  if (testBackend?.read) {
    const encData =
      (await testBackend.read('state-v2.enc.json')) ??
      (await testBackend.read('oncobrief-demo/state-v2.enc.json'));
    if (encData) {
      const envelope = JSON.parse(encData) as EncryptedEnvelopeV2;
      const key = await getOrCreateKey();
      const decrypted = await decryptEnvelope(envelope, key);
      return hydrate(decrypted);
    }

    const legacy =
      (await testBackend.read('legacy-state-v1.json')) ??
      (await testBackend.read('state-v1.json')) ??
      (await testBackend.read('oncobrief-demo/state-v1.json'));
    if (legacy) {
      const state = hydrate(legacy);
      await saveState(state);
      if (testBackend.delete) {
        await testBackend.delete('legacy-state-v1.json');
        await testBackend.delete('state-v1.json');
        await testBackend.delete('oncobrief-demo/state-v1.json');
      }
      return state;
    }

    return createDemo();
  }

  try {
    const fs = await getNativeFS();
    const { v2Path, v1Path } = await getStoragePaths();
    const v2Info = await fs.getInfoAsync(v2Path);
    if (v2Info.exists) {
      const raw = await fs.readAsStringAsync(v2Path);
      const envelope = JSON.parse(raw) as EncryptedEnvelopeV2;
      const key = await getOrCreateKey();
      const decrypted = await decryptEnvelope(envelope, key);
      return hydrate(decrypted);
    }

    const v1Info = await fs.getInfoAsync(v1Path);
    if (v1Info.exists) {
      const rawV1 = await fs.readAsStringAsync(v1Path);
      const state = hydrate(rawV1);
      await saveState(state);
      await fs.deleteAsync(v1Path, { idempotent: true });
      return state;
    }
  } catch {
    // corrupted or unreadable
  }
  return createDemo();
}

export async function saveState(state: State): Promise<void> {
  const serialized = JSON.stringify(state);
  const key = await getOrCreateKey();
  const envelope = await encryptEnvelope(serialized, key);
  const envelopeJson = JSON.stringify(envelope);

  if (isWebEnvironment()) {
    const setItem =
      testBackend?.webSetItem ??
      ((k: string, v: string) => {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(k, v);
      });
    setItem(WEB_LOCAL_STORAGE_STATE_KEY, envelopeJson);
    return;
  }

  if (testBackend?.write) {
    await testBackend.write('state-v2.enc.json', envelopeJson);
    return;
  }

  const fs = await getNativeFS();
  const { root, v2Path } = await getStoragePaths();
  await fs.makeDirectoryAsync(root, { intermediates: true });
  await fs.writeAsStringAsync(`${v2Path}.tmp`, envelopeJson);
  await fs.moveAsync({ from: `${v2Path}.tmp`, to: v2Path });
}

export async function eraseState(): Promise<void> {
  if (isWebEnvironment()) {
    const removeItem =
      testBackend?.webRemoveItem ??
      ((k: string) => {
        if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(k);
      });
    removeItem(WEB_LOCAL_STORAGE_STATE_KEY);
    await shredKey();
    return;
  }

  if (testBackend?.delete) {
    await testBackend.delete('state-v2.enc.json');
    await testBackend.delete('state-v1.json');
    await testBackend.delete('legacy-state-v1.json');
    await testBackend.delete('oncobrief-demo/state-v2.enc.json');
    await testBackend.delete('oncobrief-demo/state-v1.json');
    await shredKey();
    return;
  }

  const fs = await getNativeFS();
  const { root } = await getStoragePaths();
  await fs.deleteAsync(root, { idempotent: true });
  await shredKey();
}

export async function retainSample(uri: string, id: string, ext: string): Promise<string> {
  if (isWebEnvironment()) return uri;
  if (testBackend?.write) return uri;
  const fs = await getNativeFS();
  const { root } = await getStoragePaths();
  await fs.makeDirectoryAsync(root, { intermediates: true });
  const target = `${root}${id}.${ext}`;
  await fs.copyAsync({ from: uri, to: target });
  return target;
}
