import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Copy, Button, Panel, Field, Row, Badge, Chip } from '../src/ui';
import { useStore } from '../src/store';
import { theme as c } from '../src/theme';

export default function Signin() {
  const { mode, isAuthenticated, state, signInConnected, signOutConnected, switchMode, t } = useStore();
  const router = useRouter();

  const [hospitalSlug, setHospitalSlug] = useState('apollo-chennai');
  const [identifier, setIdentifier] = useState('DEMO-001');
  const [otp, setOtp] = useState('123456');
  const [role, setRole] = useState<'patient' | 'caregiver'>('patient');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!hospitalSlug.trim() || !identifier.trim() || !otp.trim()) {
      setErrorMsg('Please enter hospital ID, MRN/identifier, and OTP.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInConnected({
        hospitalSlug: hospitalSlug.trim(),
        identifier: identifier.trim(),
        otp: otp.trim(),
        actorRole: role,
      });
      router.replace('/(tabs)');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOutConnected();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen back title={mode === 'connected' ? 'Hospital Patient Portal' : t('signin')}>
      {mode === 'connected' ? (
        isAuthenticated ? (
          <View style={styles.container}>
            <Panel tone="sage">
              <Row>
                <Badge text="Connected" tone="sage" />
                <Copy kind="label">{state.connectedHospital?.name || 'Oncology Center'}</Copy>
              </Row>
              <Copy>
                Signed in as <Copy kind="label">{state.patientName || 'Patient'}</Copy> (MRN: {state.mrn || 'N/A'})
              </Copy>
              <Copy kind="meta">
                Records and appointments are synchronized live with your hospital evidence ledger.
              </Copy>
            </Panel>

            <View style={{ gap: 10, marginTop: 8 }}>
              <Button
                title="Go to Records"
                onPress={() => router.replace('/(tabs)/records')}
              />
              <Button
                title="Sign Out of Portal"
                secondary
                disabled={loading}
                onPress={handleSignOut}
              />
              <Button
                title="Switch to Offline Practice Demo"
                secondary
                onPress={() => {
                  switchMode('demo');
                  router.replace('/(tabs)');
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.container}>
            <Panel tone="blue">
              <Copy kind="label">Hospital Portal Connection</Copy>
              <Copy kind="meta">
                Sign in with your hospital-issued MRN and one-time password to access your real clinical records.
              </Copy>
            </Panel>

            {errorMsg && (
              <Panel tone="amber">
                <Copy style={{ color: '#785500', fontWeight: '600' }}>{errorMsg}</Copy>
              </Panel>
            )}

            <View style={{ gap: 12 }}>
              <Field
                label="Hospital Identifier"
                value={hospitalSlug}
                onChange={setHospitalSlug}
                placeholder="e.g. apollo-chennai"
                testID="signin-hospital"
              />
              <Field
                label="Patient MRN / Phone / ABHA"
                value={identifier}
                onChange={setIdentifier}
                placeholder="e.g. DEMO-001"
                testID="signin-identifier"
              />
              <Field
                label="Verification Code (OTP)"
                value={otp}
                onChange={setOtp}
                placeholder="6-digit OTP"
                testID="signin-otp"
              />

              <View style={{ gap: 6 }}>
                <Copy kind="label">Signing in as:</Copy>
                <Row>
                  <Chip
                    title="Patient"
                    active={role === 'patient'}
                    onPress={() => setRole('patient')}
                  />
                  <Chip
                    title="Designated Caregiver"
                    active={role === 'caregiver'}
                    onPress={() => setRole('caregiver')}
                  />
                </Row>
              </View>

              <View style={{ gap: 10, marginTop: 8 }}>
                <Button
                  title={loading ? 'Verifying...' : 'Sign In to Portal'}
                  disabled={loading}
                  onPress={handleSignIn}
                  testID="signin-submit-btn"
                />
                <Button
                  title="Switch to Offline Demo Workspace"
                  secondary
                  onPress={() => {
                    switchMode('demo');
                    router.replace('/(tabs)');
                  }}
                />
              </View>
            </View>
          </View>
        )
      ) : (
        <View style={styles.container}>
          <Panel tone="blue">
            <Row>
              <Badge text="Demo Mode" tone="blue" />
              <Copy kind="label">Synthetic Offline Workspace</Copy>
            </Row>
            <Copy>{t('demoInfo')}</Copy>
          </Panel>

          <View style={{ gap: 10, marginTop: 12 }}>
            <Button
              title="Connect to Live Hospital Portal"
              onPress={() => switchMode('connected')}
            />
            <Button
              title={t('explore')}
              secondary
              onPress={() => router.push('/onboarding')}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    width: '100%',
  },
});
