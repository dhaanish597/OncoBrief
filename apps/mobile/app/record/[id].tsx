import React, { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Intent from 'expo-intent-launcher';
import * as FS from 'expo-file-system/legacy';
import { useStore, useDraft } from '../../src/store';
import { Screen, Copy, Button, Panel, Field, Rule, Empty, Row, Badge } from '../../src/ui';
import { EvidenceDetail } from '../../src/journey';

export default function RecordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, t, dispatch, notify, mode, client } = useStore();
  const router = useRouter();
  const [reason, setReason] = useDraft('flag');
  const [showOriginal, setShowOriginal] = useState(false);
  const [inspectedPage, setInspectedPage] = useState<{ text: string; pageNumber: number } | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  const doc = state.documents.find((d) => d.id === id);
  if (!doc) return <Screen back><Empty title={t('originalUnavailable')} /></Screen>;

  const facts = state.ledger.filter((e) => e.source.documentId === id);
  const existingFlags = state.flags.filter((f) => f.documentId === id);

  async function openPdf() {
    try {
      if (doc?.uri && Platform.OS === 'android') {
        const uri = await FS.getContentUriAsync(doc.uri);
        await Intent.startActivityAsync('android.intent.action.VIEW', {
          data: uri,
          type: 'application/pdf',
          flags: 1,
        });
      } else {
        notify(t('originalUnavailable'));
      }
    } catch {
      notify(t('error'));
    }
  }

  async function handleInspectPage() {
    if (inspectedPage) {
      setInspectedPage(null);
      return;
    }
    if (mode === 'connected' && client) {
      setLoadingPage(true);
      try {
        const page = await client.getDocumentPage(doc!.id, 1);
        setInspectedPage({ text: page.text, pageNumber: page.pageNumber });
      } catch {
        notify('Could not load authorized source page.');
      } finally {
        setLoadingPage(false);
      }
    } else {
      setInspectedPage({ text: doc!.originalText || 'Demo source text available in fixture.', pageNumber: 1 });
    }
  }

  return (
    <Screen back title={doc.name} intro={`${doc.date} · ${doc.facility}`}>
      {/* Dual Badges: Clinician Verification vs Patient Confirmation */}
      <Panel tone="blue">
        <Copy kind="label">{t('sourceStatus')}</Copy>
        <Row>
          <Badge
            text={doc.clinicianVerified ? 'Clinician Verified' : 'Pending Clinician Review'}
            tone={doc.clinicianVerified ? 'blue' : 'amber'}
          />
          <Badge
            text={doc.patientReviewed ? 'Confirmed by You' : 'Unreviewed by You'}
            tone={doc.patientReviewed ? 'sage' : 'blue'}
          />
        </Row>
        <Copy kind="meta">
          {t('version')}: {doc.version} · Added: {doc.addedAt}
        </Copy>
      </Panel>

      {/* Authorized Source Page Inspector */}
      <Button
        title={inspectedPage ? 'Hide Authorized Source Page' : loadingPage ? 'Loading Source Page...' : 'Inspect Source Page (Page 1)'}
        secondary
        disabled={loadingPage}
        onPress={() => void handleInspectPage()}
      />
      {inspectedPage && (
        <Panel tone="paper">
          <Copy kind="label">Source Page {inspectedPage.pageNumber} (Normalized Text)</Copy>
          <Copy selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13 }}>
            {inspectedPage.text || 'No normalized text on this page.'}
          </Copy>
        </Panel>
      )}

      {/* Original Attachment Toggle */}
      <Button title={t('original')} onPress={() => setShowOriginal(!showOriginal)} />
      {showOriginal && (
        <Panel>
          <Copy kind="label">{t('originals')}</Copy>
          {doc.originalText ? (
            <Copy selectable>{doc.originalText}</Copy>
          ) : doc.uri && doc.mimeType.startsWith('image/') ? (
            <Image
              source={{ uri: doc.uri }}
              accessibilityLabel={doc.name}
              resizeMode="contain"
              style={{ width: '100%', height: 360 }}
            />
          ) : doc.uri && Platform.OS === 'web' ? (
            <View style={{ height: 440 }}>
              {React.createElement('iframe', {
                src: doc.uri,
                title: doc.name,
                style: { width: '100%', height: '100%', border: 0 },
              })}
            </View>
          ) : doc.uri ? (
            <Button title={t('nativePdf')} onPress={() => void openPdf()} />
          ) : (
            <Copy>{t('originalUnavailable')}</Copy>
          )}
        </Panel>
      )}

      {/* Evidence Ledger Facts */}
      <Copy kind="title">{t('source')}</Copy>
      {facts.length ? (
        facts.map((e) => <EvidenceDetail key={e.id} event={e} />)
      ) : (
        <Copy>{t('extractionUnavailable')}</Copy>
      )}

      {/* Patient Review Confirmation */}
      <Panel tone={doc.patientReviewed ? 'sage' : 'paper'}>
        <Copy kind="label">Patient Review Confirmation</Copy>
        <Copy kind="meta">
          Confirming records your personal verification of this report. It does NOT alter clinician verification status.
        </Copy>
        <Button
          secondary
          disabled={doc.patientReviewed}
          title={doc.patientReviewed ? 'Confirmed by You' : 'Confirm details match my report'}
          onPress={() => {
            if (dispatch({ type: 'review', id: doc.id })) notify(t('saved'));
          }}
        />
      </Panel>

      <Rule />

      {/* Discrepancy Flagging Workflow */}
      <Copy kind="title">Discrepancy Reporting</Copy>
      {existingFlags.length > 0 && (
        <View style={{ gap: 8, marginVertical: 6 }}>
          <Copy kind="label">Previously Flagged Concerns:</Copy>
          {existingFlags.map((flag) => (
            <Panel key={flag.id} tone="amber">
              <Row>
                <Badge text="Flagged for Reconciliation" tone="amber" />
                <Copy kind="meta">{flag.at.slice(0, 10)}</Copy>
              </Row>
              <Copy>{flag.reason}</Copy>
            </Panel>
          ))}
        </View>
      )}

      <Field
        label="Flag a detail (typo, wrong date, or missing page)"
        value={reason}
        onChange={setReason}
        multiline
      />
      <Button
        disabled={!reason.trim()}
        title="Send Discrepancy to Care Team"
        onPress={() => {
          if (dispatch({ type: 'flag', id: doc.id, reason })) {
            setReason('');
            notify(t('flagSaved'));
          }
        }}
      />

      {/* Glossary Context */}
      <Panel tone="sage">
        <Copy kind="title">{t('glossary')}</Copy>
        <Copy kind="meta">{t('glossaryInfo')}</Copy>
        <Copy kind="label">{t('term')}</Copy>
        <Copy>{t('termMeaning')}</Copy>
        <Copy kind="meta">{t('termSource')}</Copy>
        <Button
          title={t('glossaryToQuestion')}
          secondary
          onPress={() => {
            dispatch({
              type: 'question',
              text: `${t('glossaryToQuestion')} — ${doc.name}`,
            });
            router.push({ pathname: '/prepare', params: { stage: 'questions' } });
          }}
        />
      </Panel>
    </Screen>
  );
}
