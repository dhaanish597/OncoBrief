import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore, useDraft } from '../src/store';
import { Screen, Copy, Field, Button, Chip, Row, DocumentRow, Panel, Empty, Badge } from '../src/ui';

export default function Sharing() {
  const { state, t, dispatch, mode, client, refresh, notify } = useStore();
  const router = useRouter();

  // Sharing state
  const [recipient, setRecipient] = useDraft('recipient');
  const [purpose, setPurpose] = useDraft('purpose');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);

  // Caregiver form state
  const [cgName, setCgName] = useState('');
  const [cgRelation, setCgRelation] = useState('');
  const [cgPhone, setCgPhone] = useState('');
  const [scopes, setScopes] = useState<string[]>(['appointments', 'reminders']);
  const [addingCg, setAddingCg] = useState(false);

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter((s) => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const handleAddCaregiver = async () => {
    if (!cgName.trim() || !cgRelation.trim() || !cgPhone.trim()) {
      notify('Please fill caregiver name, relationship, and phone.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'connected' && client) {
        await client.addCaregiver({
          fullName: cgName.trim(),
          relationship: cgRelation.trim(),
          phoneNumber: cgPhone.trim(),
          scopes,
        });
        await refresh();
        notify('Caregiver added with consented scopes.');
        setCgName('');
        setCgRelation('');
        setCgPhone('');
        setAddingCg(false);
      } else {
        notify('Caregivers are simulated in demo mode.');
        setAddingCg(false);
      }
    } catch {
      notify('Could not add caregiver.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeCaregiver = async (caregiverId: string) => {
    setBusy(true);
    try {
      if (mode === 'connected' && client) {
        await client.revokeCaregiver(caregiverId);
        await refresh();
        notify('Caregiver access revoked immediately.');
      }
    } catch {
      notify('Could not revoke caregiver access.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateShareGrant = async () => {
    if (!recipient.trim() || !state.shareSelected.length) {
      notify('Please enter recipient and select at least one record.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'connected' && client) {
        await client.createShareGrant({
          recipientLabel: recipient.trim(),
          sharedDocumentIds: state.shareSelected,
          durationHours: days * 24,
        });
        await refresh();
        notify('Time-bounded share grant created.');
        setRecipient('');
        setPurpose('');
      } else {
        router.push({
          pathname: '/share-review',
          params: { recipient, purpose, days: String(days), ids: JSON.stringify(state.shareSelected) },
        });
      }
    } catch {
      notify('Could not create share grant.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeShareGrant = async (grantId: string) => {
    setBusy(true);
    try {
      if (mode === 'connected' && client) {
        await client.revokeShareGrant(grantId);
        await refresh();
        notify('Share grant revoked.');
      }
    } catch {
      notify('Could not revoke share grant.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('sharingTitle')} intro={t('sharingInfo')}>
      {/* Caregiver Section */}
      <Panel tone="blue">
        <Row>
          <Badge text="Caregiver Participation" tone="blue" />
          <Copy kind="meta">Consent & Family Permissions</Copy>
        </Row>
        <Copy kind="meta">
          Designate family caregivers to assist with appointment attendance and consultation preparation. You can revoke access at any time.
        </Copy>

        {state.caregivers && state.caregivers.length > 0 && (
          <View style={{ gap: 8, marginTop: 4 }}>
            {state.caregivers.map((cg) => (
              <Panel key={cg.id} tone="paper">
                <Row>
                  <Copy kind="label">{cg.fullName}</Copy>
                  <Badge text={cg.relationship} tone="blue" />
                  <Badge text={cg.isActive ? 'Active' : 'Revoked'} tone={cg.isActive ? 'sage' : 'amber'} />
                </Row>
                <Copy kind="meta">Phone: {cg.phoneNumber}</Copy>
                <Copy kind="meta">Scopes: {cg.scopes.join(', ')}</Copy>
                {cg.isActive && (
                  <Button
                    secondary
                    title="Revoke Caregiver Access"
                    disabled={busy}
                    onPress={() => void handleRevokeCaregiver(cg.id)}
                  />
                )}
              </Panel>
            ))}
          </View>
        )}

        <Button
          secondary
          title={addingCg ? 'Cancel Adding Caregiver' : 'Add New Caregiver'}
          onPress={() => setAddingCg(!addingCg)}
        />

        {addingCg && (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Field label="Full Name" value={cgName} onChange={setCgName} placeholder="e.g. Anand Sundaram" />
            <Field label="Relationship" value={cgRelation} onChange={setCgRelation} placeholder="e.g. Spouse / Adult Child" />
            <Field label="Phone Number" value={cgPhone} onChange={setCgPhone} placeholder="e.g. +91 98765 43210" />

            <Copy kind="label">Consented Permissions:</Copy>
            <Row>
              {(['appointments', 'reminders', 'documents', 'preparation'] as const).map((sc) => (
                <Chip
                  key={sc}
                  title={sc}
                  active={scopes.includes(sc)}
                  onPress={() => toggleScope(sc)}
                />
              ))}
            </Row>

            <Button
              title="Save Consented Caregiver"
              disabled={busy || !cgName.trim() || !cgRelation.trim() || !cgPhone.trim()}
              onPress={handleAddCaregiver}
            />
          </View>
        )}
      </Panel>

      {/* Time-Bounded Share Grant Section */}
      <Copy kind="title">Time-Bounded Consultation Share</Copy>
      <Field label={t('recipient')} value={recipient} onChange={setRecipient} maxLength={200} placeholder="e.g. Dr. Arumugam Second Opinion" />
      <Field label={t('purpose')} value={purpose} onChange={setPurpose} maxLength={500} placeholder="e.g. Second opinion consultation" />

      <Copy kind="label">{t('expiry')}</Copy>
      <Row>
        <Chip title="24 Hours" active={days === 1} onPress={() => setDays(1)} />
        <Chip title="72 Hours (Recommended)" active={days === 3} onPress={() => setDays(3)} />
        <Chip title="7 Days" active={days === 7} onPress={() => setDays(7)} />
      </Row>

      <Copy>{t('selectedReports')}</Copy>
      {state.documents.map((d) => (
        <DocumentRow
          key={d.id}
          doc={d}
          selected={state.shareSelected.includes(d.id)}
          onSelect={() => dispatch({ type: 'selectShare', id: d.id })}
        />
      ))}

      <Button
        disabled={!recipient.trim() || !state.shareSelected.length || busy}
        title={mode === 'connected' ? 'Create Revocable Share Grant' : t('shareReview')}
        onPress={handleCreateShareGrant}
      />

      {/* Share Grants History */}
      <Copy kind="title">{t('grants')}</Copy>
      {mode === 'connected' && state.shareGrants ? (
        state.shareGrants.length === 0 ? (
          <Empty title={t('noGrants')} />
        ) : (
          state.shareGrants.map((g) => (
            <Panel key={g.id}>
              <Row>
                <Copy kind="label">{g.recipientLabel || (g as any).granteeLabel || 'Recipient'}</Copy>
                <Badge text={g.isRevoked ? 'Revoked' : 'Active'} tone={g.isRevoked ? 'amber' : 'sage'} />
              </Row>
              <Copy kind="meta">Expires: {new Date(g.expiresAt).toLocaleDateString()}</Copy>
              <Copy kind="meta">Documents included: {(g.sharedDocumentIds ?? (g as any).documentIds ?? []).length} report(s)</Copy>
              {!g.isRevoked && (
                <Button
                  secondary
                  title="Revoke Share Grant"
                  disabled={busy}
                  onPress={() => void handleRevokeShareGrant(g.id)}
                />
              )}
            </Panel>
          ))
        )
      ) : (
        <>
          {!state.grants.length && <Empty title={t('noGrants')} />}
          {state.grants.map((g) => {
            const active = !g.revokedAt && Date.parse(g.expiresAt) > Date.now();
            return (
              <Panel key={g.id}>
                <Copy kind="label">{g.recipient}</Copy>
                <Copy>{g.purpose}</Copy>
                <Copy kind="meta">
                  {g.expiresAt} · {t(g.revokedAt ? 'revoked' : active ? 'active' : 'expired')}
                </Copy>
                {g.ids.map((id) => (
                  <Copy key={id} kind="meta">
                    {state.documents.find((d) => d.id === id)?.name}
                  </Copy>
                ))}
                {active && (
                  <Button
                    secondary
                    title={t('revoke')}
                    onPress={() => dispatch({ type: 'revoke', id: g.id })}
                  />
                )}
              </Panel>
            );
          })}
        </>
      )}
    </Screen>
  );
}
