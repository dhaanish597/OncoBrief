import React, { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Picker from 'expo-document-picker';
import * as Camera from 'expo-image-picker';
import * as FS from 'expo-file-system/legacy';
import { useStore } from '../src/store';
import { validateFile, type Category } from '../src/domain';
import { matchesSignature, validateImportCandidate } from '../src/file-validation';
import { retainSample } from '../src/storage';
import { categories } from '../src/i18n';
import { bytesToBase64 } from '../src/crypto-envelope';
import { Screen, Copy, Button, Panel, Toggle, Row, Chip, Badge } from '../src/ui';
import { NotebookArt } from '../src/art';

interface Sample {
  name: string;
  uri: string;
  mimeType: string;
  size: number;
}

export default function Import() {
  const { state, t, dispatch, notify, mode, client, refresh } = useStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ fulfillTaskId?: string }>();
  const [consent, setConsent] = useState(false);
  const [sample, setSample] = useState<Sample | null>(null);
  const [category, setCategory] = useState<Category>('other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const fulfillingTask = params.fulfillTaskId
    ? state.tasks?.find((t) => t.id === params.fulfillTaskId)
    : null;

  async function choose(camera = false) {
    if (!consent) return;
    setError('');
    try {
      if (camera) {
        if (Platform.OS === 'web') {
          setError(t('permissionDenied'));
          return;
        }
        const permission = await Camera.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(t('permissionDenied'));
          return;
        }
        const result = await Camera.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (result.canceled) return;
        const image = result.assets[0];
        if (!image) return;
        const info = await FS.getInfoAsync(image.uri);
        setSample({
          uri: image.uri,
          name: image.fileName || 'report-photo.jpg',
          mimeType: image.mimeType || 'image/jpeg',
          size: image.fileSize || (info.exists ? info.size : 0),
        });
      } else {
        const result = await Picker.getDocumentAsync({
          type: ['application/pdf', 'image/jpeg', 'image/png'],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled) return;
        const file = result.assets[0];
        if (!file) return;
        const candidate = {
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || '',
          size: file.size || 0,
        };
        if (validateFile(candidate)) {
          setError(t('invalidFile'));
          setSample(null);
          return;
        }
        setSample(candidate);
      }
    } catch {
      setError(t('error'));
    }
  }

  async function save() {
    if (!sample || !consent) {
      setError(t('invalidFile'));
      return;
    }
    const validation = validateImportCandidate(sample, state.documents);
    if (!validation.valid) {
      setError(t('invalidFile'));
      return;
    }
    setBusy(true);
    setError('');
    setProgress(0.15);

    let retainedUri: string | null = null;
    try {
      let bytes: Uint8Array;
      let base64 = '';
      if (Platform.OS === 'web') {
        const buf = await (await fetch(sample.uri)).arrayBuffer();
        const uint = new Uint8Array(buf);
        bytes = uint.slice(0, 8);
        base64 = bytesToBase64(uint);
      } else {
        base64 = await FS.readAsStringAsync(sample.uri, { encoding: FS.EncodingType.Base64 });
        bytes = Uint8Array.from(atob(base64.slice(0, 16)), (c) => c.charCodeAt(0));
      }

      if (!matchesSignature(bytes, sample.mimeType)) throw new Error('invalid_file');
      setProgress(0.5);

      const docDate = validation.date || new Date().toISOString().slice(0, 10);

      if (mode === 'connected' && client) {
        // Connected mode: Upload directly to backend patient portal
        await client.uploadDocument({
          filename: sample.name,
          contentBase64: base64,
          documentDate: docDate,
          issuingFacility: 'Patient Mobile Upload',
          fulfillsTaskId: params.fulfillTaskId,
        });
        setProgress(1);
        await refresh();
        notify('Uploaded — Pending Coordinator Verification');
        router.replace('/(tabs)/records');
      } else {
        // Demo mode: Retain in sandbox storage
        const id = `sample-${Date.now()}`;
        const ext = sample.mimeType === 'application/pdf' ? 'pdf' : sample.mimeType === 'image/png' ? 'png' : 'jpg';
        retainedUri = await retainSample(sample.uri, id, ext);
        setProgress(1);
        if (
          dispatch({
            type: 'import',
            document: {
              id,
              name: sample.name,
              category,
              date: docDate,
              facility: t('demoShort'),
              mimeType: sample.mimeType,
              size: sample.size,
              uri: retainedUri,
              version: 'local-original-v1',
              extraction: 'unavailable',
              patientReviewed: false,
              clinicianVerified: false,
              addedAt: new Date().toISOString(),
            },
          })
        ) {
          notify(t('localCopy'));
          router.replace({ pathname: '/record/[id]', params: { id } });
        }
      }
    } catch {
      if (retainedUri && Platform.OS !== 'web') {
        try {
          await FS.deleteAsync(retainedUri, { idempotent: true });
        } catch {}
      }
      setError(t('invalidFile'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back title={t('importTitle')} intro={t('importInfo')}>
      <NotebookArt />

      {fulfillingTask && (
        <Panel tone="amber">
          <Row>
            <Badge text="Fulfilling Request" tone="amber" />
            <Copy kind="label">{fulfillingTask.title}</Copy>
          </Row>
          {fulfillingTask.description && <Copy kind="body">{fulfillingTask.description}</Copy>}
        </Panel>
      )}

      <Panel tone="blue">
        <Copy kind="label">
          {mode === 'connected' ? 'Upload to Oncology Care Team' : t('demoInfo')}
        </Copy>
        <Copy kind="meta">
          {mode === 'connected'
            ? 'Uploaded reports will be marked "Pending Clinician Review" until verified by your oncology care team.'
            : t('demoInfo')}
        </Copy>
        <Toggle
          title={mode === 'connected' ? 'I confirm this is an authentic medical report' : t('fileConsent')}
          checked={consent}
          onPress={() => setConsent(!consent)}
        />
      </Panel>

      <Button title={t('chooseFile')} disabled={!consent || busy} onPress={() => void choose()} />
      {Platform.OS !== 'web' && (
        <Button
          secondary
          title={t('camera')}
          disabled={!consent || busy}
          onPress={() => void choose(true)}
        />
      )}

      {sample && (
        <Panel>
          <Copy kind="label">{sample.name}</Copy>
          <Copy kind="meta">
            {sample.mimeType} · {(sample.size / 1024).toFixed(1)} KB
          </Copy>
          {sample.mimeType.startsWith('image/') && (
            <Image
              source={{ uri: sample.uri }}
              accessibilityLabel={sample.name}
              resizeMode="contain"
              style={{ width: '100%', height: 240 }}
            />
          )}
          <Copy>{t('selectCategory')}</Copy>
          <Row>
            {categories.map((cat) => (
              <Chip
                key={cat}
                title={t(cat)}
                active={cat === category}
                onPress={() => setCategory(cat)}
              />
            ))}
          </Row>
          <Button
            title={busy ? t('loading') : mode === 'connected' ? 'Upload to Care Team' : t('import')}
            disabled={!consent || busy}
            onPress={() => void save()}
          />
        </Panel>
      )}

      {busy && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: progress * 100 }}
          style={{ height: 6, backgroundColor: '#D7CBB3' }}
        >
          <View style={{ width: `${progress * 100}%`, height: 6, backgroundColor: '#315A91' }} />
        </View>
      )}

      {!!error && (
        <Panel tone="amber">
          <Copy>{error}</Copy>
        </Panel>
      )}
    </Screen>
  );
}
