import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useStore } from './store';
import { readiness, records } from './domain';
import { filterJourney, labObservations } from './patient-selectors';
import { Badge, Button, Copy, DocumentRow, LinkRow, Panel, Row, Screen, SectionHeading } from './ui';
import { Icon, type IconName } from './icons';
import { theme as c } from './theme';

export function ConnectedHome() {
  const { state, t, mode, client, refresh, notify } = useStore();
  const router = useRouter();
  const [actingOnAppt, setActingOnAppt] = useState<string | null>(null);

  const prep = readiness(state);
  const labs = labObservations(state);
  const latest = labs[0];
  const demoAppointments = state.ledger.filter((e) => e.kind === 'appointment');
  const recent = filterJourney(state).filter((e) => !e.observation).slice(0, 2);

  const links: { label: string; icon: IconName; href: Href; color: string }[] = [
    { label: t('labResults'), icon: 'lab', href: '/labs', color: c.purple },
    { label: t('journey'), icon: 'journey', href: '/(tabs)/journey', color: c.teal },
    { label: t('wellbeing'), icon: 'heart', href: '/wellbeing', color: '#C84279' },
    { label: t('records'), icon: 'records', href: '/(tabs)/records', color: c.cobalt },
  ];

  const missingCount = state.missing.filter((m) => m.status === 'missing').length;
  const readinessPct = Math.round(prep.total ? (prep.done / prep.total) * 100 : 0);

  const handleConfirmAttendance = async (appointmentId: string) => {
    if (!client) return;
    setActingOnAppt(appointmentId);
    try {
      await client.confirmAttendance({ appointmentId, action: 'confirm' });
      await refresh();
      notify('Attendance confirmed for your care team.');
    } catch {
      notify('Could not confirm attendance. Please try again.');
    } finally {
      setActingOnAppt(null);
    }
  };

  const handleRequestReschedule = async (appointmentId: string) => {
    if (!client) return;
    setActingOnAppt(appointmentId);
    try {
      await client.confirmAttendance({
        appointmentId,
        action: 'request_reschedule',
        note: 'Patient requested reschedule via mobile app',
      });
      await refresh();
      notify('Reschedule request sent to care coordinator.');
    } catch {
      notify('Could not submit reschedule request. Please try again.');
    } finally {
      setActingOnAppt(null);
    }
  };

  return (
    <Screen title={t('homeTitle')} intro={t('homeIntro')}>
      {state.journeyStage && (
        <Panel tone="blue" compact>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Copy kind="label" style={{ color: c.cobalt, fontSize: 13 }}>
                {state.locale === 'ta' && state.patientNameTa ? state.patientNameTa : state.patientName} · {state.mrn}
              </Copy>
              <Copy kind="display" style={{ fontSize: 15, fontWeight: '600' }}>
                {state.locale === 'ta' && state.journeyStageTa ? state.journeyStageTa : state.journeyStage}
              </Copy>
              <Copy kind="meta">
                {state.locale === 'ta' && state.diagnosisTa ? state.diagnosisTa : state.diagnosis}
              </Copy>
            </View>
            <Badge text={state.personaId} tone="blue" />
          </View>
        </Panel>
      )}

      {missingCount > 0 && (
        <Panel tone="amber" compact>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="shield" color="#D97706" size={20} />
            <View style={{ flex: 1 }}>
              <Copy kind="label" style={{ color: '#92400E' }}>
                {state.locale === 'ta' ? 'காணாமல் போன பதிவுகள் உள்ளன' : 'Missing Consultation Records'}
              </Copy>
              <Copy kind="meta">
                {state.locale === 'ta'
                  ? `${missingCount} ஆவணம் சரிபார்க்கப்பட வேண்டும்`
                  : `${missingCount} record(s) pending for oncology consultation`}
              </Copy>
            </View>
          </View>
          <Button
            secondary
            title={state.locale === 'ta' ? 'சரிபார்க்கவும்' : 'Review Missing Records'}
            onPress={() => router.push('/prepare')}
          />
        </Panel>
      )}

      {/* Connected Appointments or Demo Appointment Comparison */}
      {mode === 'connected' && state.appointments && state.appointments.length > 0 ? (
        <Panel compact>
          <SectionHeading icon="calendar" title="Upcoming Appointments & OPD Status" />
          {state.appointments.map((appt) => {
            const isScheduled = appt.status === 'scheduled';
            const isConfirmed = appt.status === 'confirmed';
            const isCheckedIn = appt.status === 'checked_in';
            const isRescheduled = appt.status === 'reschedule_requested';
            const badgeTone = isConfirmed || isCheckedIn ? 'sage' : isRescheduled ? 'amber' : 'blue';
            const badgeLabel = isConfirmed
              ? 'Attendance Confirmed'
              : isCheckedIn
              ? 'Checked In at Clinic'
              : isRescheduled
              ? 'Reschedule Requested'
              : 'Scheduled';

            return (
              <View key={appt.id} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line }}>
                <Row>
                  <Badge text={badgeLabel} tone={badgeTone} />
                  {appt.tokenNumber && <Badge text={`Token: ${appt.tokenNumber}`} tone="blue" />}
                  {appt.estimatedWaitMinutes !== undefined && (
                    <Copy kind="meta">Est. wait: ~{appt.estimatedWaitMinutes} min</Copy>
                  )}
                </Row>

                <Copy kind="label" style={{ fontSize: 16 }}>
                  {new Date(appt.scheduledStart).toLocaleDateString(state.locale === 'ta' ? 'ta-IN' : 'en-IN', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Copy>

                <Copy kind="body">{appt.clinicianName}</Copy>
                <Copy kind="meta">{appt.department}</Copy>

                {appt.canConfirmAttendance && isScheduled && (
                  <Row>
                    <Button
                      title={actingOnAppt === appt.id ? 'Confirming...' : 'Confirm I Will Attend'}
                      disabled={actingOnAppt === appt.id}
                      onPress={() => void handleConfirmAttendance(appt.id)}
                    />
                    <Button
                      secondary
                      title="Request Reschedule"
                      disabled={actingOnAppt === appt.id}
                      onPress={() => void handleRequestReschedule(appt.id)}
                    />
                  </Row>
                )}
              </View>
            );
          })}
        </Panel>
      ) : (
        <Panel compact>
          <SectionHeading icon="calendar" title={t('appointmentConfirm')} />
          <Copy kind="meta">{t('appointmentSources')}</Copy>
          {demoAppointments.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`${e.date} · ${t('source')}`}
              onPress={() => router.push({ pathname: '/record/[id]', params: { id: e.source.documentId } })}
              style={{
                minHeight: 48,
                paddingVertical: 7,
                borderBottomWidth: 1,
                borderColor: c.line,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Copy kind="label">
                  {new Date(`${e.date}T12:00:00Z`).toLocaleDateString(state.locale === 'ta' ? 'ta-IN' : 'en-IN', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </Copy>
                <Copy kind="meta">{state.documents.find((d) => d.id === e.source.documentId)?.name}</Copy>
              </View>
              <Icon name="arrow" size={17} />
            </Pressable>
          ))}
          <Button
            secondary
            title={t('compareSources')}
            onPress={() =>
              router.push({
                pathname: '/compare',
                params: {
                  left: demoAppointments[0]?.source.documentId || 'd2',
                  right: demoAppointments[1]?.source.documentId || 'd5',
                },
              })
            }
          />
        </Panel>
      )}

      {latest && (
        <Panel compact>
          <SectionHeading icon="lab" title={t('latestLab')} action={t('viewAll')} onPress={() => router.push('/labs')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('viewLabs')}
            onPress={() => router.push({ pathname: '/lab/[test]', params: { test: latest.test } })}
            style={{ gap: 4 }}
          >
            <Row>
              <Copy kind="label">{t('haemoglobin')}</Copy>
              <Copy kind="display" style={{ fontSize: 27 }}>
                {latest.value}
              </Copy>
              <Copy kind="label">{latest.unit}</Copy>
            </Row>
            <Copy kind="meta">
              {t('recorded')} {latest.date} · {latest.facility}
            </Copy>
            {labs[1] && (
              <Copy kind="meta">
                {t('earlierResult')}: {labs[1].value} {labs[1].unit} · {labs[1].date}
              </Copy>
            )}
            <Badge text={t(latest.status === 'clinician-confirmed' ? 'confirmedShort' : 'extractedShort')} tone="amber" />
          </Pressable>
        </Panel>
      )}

      <Panel>
        <SectionHeading icon="check" title={t('personalChecklist')} />
        <Row>
          <Copy kind="label">
            {prep.done}/{prep.total} {t('complete')} ({readinessPct}%)
          </Copy>
        </Row>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('personalChecklist')}
          accessibilityValue={{ min: 0, max: prep.total, now: prep.done }}
          style={{ height: 9, backgroundColor: c.deep, borderRadius: 6 }}
        >
          <View
            style={{
              height: 9,
              width: `${prep.total ? (prep.done / prep.total) * 100 : 0}%`,
              backgroundColor: c.cobalt,
              borderRadius: 6,
            }}
          />
        </View>
        <Copy kind="meta">{t('notMedicalReadiness')}</Copy>
        <Button secondary title={t('reviewPreparation')} onPress={() => router.push('/prepare')} />
      </Panel>

      <Panel>
        <SectionHeading title={t('quickActions')} />
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {links.map((link) => (
            <Pressable
              key={link.icon}
              accessibilityRole="button"
              accessibilityLabel={link.label}
              onPress={() => router.push(link.href)}
              style={{
                flex: 1,
                minHeight: 93,
                padding: 9,
                backgroundColor: c.bg,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                borderWidth: 1,
                borderColor: c.line,
              }}
            >
              <Icon name={link.icon} color={link.color} />
              <Copy kind="meta" style={{ textAlign: 'center', color: c.ink, fontSize: 11 }}>
                {link.label}
              </Copy>
            </Pressable>
          ))}
        </View>
      </Panel>

      <Panel>
        <SectionHeading title={t('recent')} action={t('viewAll')} onPress={() => router.push('/(tabs)/records')} />
        {records(state)
          .slice(0, 2)
          .map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        <Button secondary title={t('addDocument')} onPress={() => router.push('/import')} />
      </Panel>

      <Panel>
        <SectionHeading title={t('recentEvents')} action={t('journey')} onPress={() => router.push('/(tabs)/journey')} />
        {recent.map((e) => (
          <LinkRow
            key={e.id}
            title={state.locale === 'ta' ? e.titleTa : e.title}
            subtitle={e.date}
            href={{ pathname: '/record/[id]', params: { id: e.source.documentId } }}
          />
        ))}
      </Panel>

      <Panel>
        <SectionHeading title={t('outstanding')} action={t('manage')} onPress={() => router.push('/prepare')} />
        {state.checks
          .filter((check) => check.enabled && !check.done)
          .slice(0, 3)
          .map((check) => (
            <LinkRow
              key={check.id}
              title={state.locale === 'ta' && check.labelTa ? check.labelTa : check.label}
              subtitle={t('notMedicalReadiness')}
              href="/prepare"
            />
          ))}
        {state.checks.every((check) => !check.enabled || check.done) && <Copy>{t('noTasks')}</Copy>}
        <LinkRow title={t('openChecklist')} href="/checklist" />
      </Panel>

      <Panel tone="blue">
        <SectionHeading title={t('careUpdate')} />
        <Copy>{t('message')}</Copy>
        <Copy kind="meta">{t('messageSource')}</Copy>
        <LinkRow title={t('openReport')} href={{ pathname: '/record/[id]', params: { id: 'd2' } }} />
      </Panel>

      <LinkRow title={t('sharing')} href="/sharing" />
    </Screen>
  );
}
