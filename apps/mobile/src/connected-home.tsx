import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useStore } from './store';
import { records } from './domain';
import { filterJourney, labObservations, formatChecklistProgress } from './patient-selectors';
import { Badge, Button, Copy, DocumentRow, LinkRow, Panel, Row, Screen, SectionHeading } from './ui';
import { Icon, type IconName } from './icons';
import { theme as c } from './theme';
import { VoicePlayerBar } from './voice-player';

export function ConnectedHome() {
  const { state, t, mode, client, refresh, notify } = useStore();
  const router = useRouter();
  const [actingOnAppt, setActingOnAppt] = useState<string | null>(null);

  const progress = formatChecklistProgress(state);
  const labs = labObservations(state);
  const latest = labs[0];
  const demoAppointments = state.ledger.filter((e) => e.kind === 'appointment');
  const recent = filterJourney(state).filter((e) => !e.observation).slice(0, 2);
  const totalDocs = records(state).length;
  const totalEvents = state.ledger.length;
  const totalQuestions = state.questions.length;
  const futureAppts = (state.appointments ?? []).length || demoAppointments.length;

  const quickAccessCards: { label: string; countLabel: string; icon: IconName; href: Href; color: string }[] = [
    { label: t('records'), countLabel: `${totalDocs} records`, icon: 'records', href: '/(tabs)/records', color: c.cobalt },
    { label: t('labResults'), countLabel: `${labs.length} results`, icon: 'lab', href: '/labs', color: c.purple },
    { label: t('journey'), countLabel: `${totalEvents} events`, icon: 'journey', href: '/(tabs)/journey', color: c.teal },
    { label: 'Questions', countLabel: `${totalQuestions} saved`, icon: 'insights', href: '/prepare', color: '#D97706' },
  ];

  const missingCount = state.missing.filter((m) => m.status === 'missing').length;

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
      {/* SECTION 1: PATIENT SUMMARY & IDENTITY */}
      <Panel tone="blue" compact>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Copy kind="meta" style={{ color: c.cobalt, fontWeight: '600' }}>
              {mode === 'connected' ? 'CONNECTED HOSPITAL PORTAL' : 'SAMPLE PATIENT PROFILE'}
            </Copy>
            <Copy kind="display" style={{ fontSize: 18, fontWeight: '700' }}>
              {state.locale === 'ta' && state.patientNameTa ? state.patientNameTa : state.patientName}
            </Copy>
            <Copy kind="label" style={{ color: c.ink, fontSize: 13 }}>
              MRN: {state.mrn} · {state.connectedHospital?.name || 'Apollo Cancer Centre'}
            </Copy>
            {state.diagnosis && (
              <Copy kind="meta">
                {state.locale === 'ta' && state.diagnosisTa ? state.diagnosisTa : state.diagnosis}
                {state.journeyStage ? ` · Stage ${state.journeyStage}` : ''}
              </Copy>
            )}
          </View>
          <Badge text={mode === 'connected' ? 'Verified EHR' : state.personaId} tone="blue" />
        </View>
      </Panel>

      {/* SECTION 2: NEXT UPCOMING APPOINTMENT (PROMINENT) */}
      {mode === 'connected' && state.appointments && state.appointments.length > 0 ? (
        <Panel compact>
          <SectionHeading icon="calendar" title="Next Appointment & Clinic Status" />
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

                <Copy kind="label" style={{ fontSize: 17, color: c.ink }}>
                  {new Date(appt.scheduledStart).toLocaleDateString(state.locale === 'ta' ? 'ta-IN' : 'en-IN', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Copy>

                <Copy kind="body" style={{ fontWeight: '600' }}>{appt.clinicianName}</Copy>
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
                <Copy kind="label" style={{ fontSize: 16 }}>
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

      {/* SECTION 3: IMPORTANT APPROVED CARE INSTRUCTIONS (PRIORITIZED HIGH) */}
      {state.continuityMessages && state.continuityMessages.length > 0 ? (
        <Panel tone="blue">
          <SectionHeading title="Approved Care Instructions" />
          <Copy kind="meta">Clinician-authorized instructions for your upcoming consultation and home care.</Copy>
          {state.continuityMessages.map((msg) => (
            <View key={msg.id} style={{ gap: 8, marginVertical: 4, paddingVertical: 4 }}>
              <Row>
                <Badge text="Approved by Care Team" tone="sage" />
                <Copy kind="meta">{msg.locale === 'ta' ? 'தமிழ்' : 'English'}</Copy>
                {msg.approvedAt && (
                  <Copy kind="meta">· {new Date(msg.approvedAt).toLocaleDateString()}</Copy>
                )}
              </Row>
              <Copy kind="body" style={{ fontSize: 15, lineHeight: 22 }}>
                {msg.body}
              </Copy>
              <VoicePlayerBar
                messageId={msg.id}
                text={msg.body}
                defaultLanguage={msg.locale === 'ta' ? 'ta' : 'en'}
              />
            </View>
          ))}
        </Panel>
      ) : (
        <Panel tone="blue">
          <SectionHeading title={t('careUpdate')} />
          <Copy>{t('message')}</Copy>
          <Copy kind="meta">{t('messageSource')}</Copy>
          <VoicePlayerBar text={t('message')} />
          <LinkRow title={t('openReport')} href={{ pathname: '/record/[id]', params: { id: 'd2' } }} />
        </Panel>
      )}

      {/* SECTION 4: MY VISIT PREPARATION & CHECKLIST */}
      <Panel>
        <SectionHeading icon="check" title={t('personalChecklist')} />
        {progress.hasItems ? (
          <>
            <Row>
              <Copy kind="label" style={{ fontSize: 15 }}>
                {progress.displayText}
              </Copy>
            </Row>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel={t('personalChecklist')}
              accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
              style={{ height: 9, backgroundColor: c.deep, borderRadius: 6 }}
            >
              <View
                style={{
                  height: 9,
                  width: `${progress.percent}%`,
                  backgroundColor: c.cobalt,
                  borderRadius: 6,
                }}
              />
            </View>
          </>
        ) : (
          <View style={{ gap: 6 }}>
            <Copy kind="body">No checklist items yet</Copy>
            <Copy kind="meta">Create a personal visit preparation checklist for your next clinic visit.</Copy>
          </View>
        )}
        <Copy kind="meta">{t('notMedicalReadiness')}</Copy>

        {missingCount > 0 && (
          <View style={{ gap: 6, padding: 10, backgroundColor: '#FEF3C7', borderRadius: 8 }}>
            <Row>
              <Icon name="shield" color="#D97706" size={16} />
              <Copy kind="label" style={{ color: '#92400E', fontSize: 13 }}>
                {missingCount} missing document task(s) requested by your clinic
              </Copy>
            </Row>
          </View>
        )}

        <Row>
          <Button
            title={progress.hasItems ? t('reviewPreparation') : 'Create my checklist'}
            onPress={() => router.push('/prepare')}
          />
          <Button
            secondary
            title="Add a question"
            onPress={() => router.push({ pathname: '/prepare', params: { stage: 'questions' } })}
          />
        </Row>
      </Panel>

      {/* SECTION 5: QUICK ACCESS (GROUNDED REAL COUNTS) */}
      <Panel>
        <SectionHeading title={t('quickActions')} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {quickAccessCards.map((card) => (
            <Pressable
              key={card.label}
              accessibilityRole="button"
              accessibilityLabel={`${card.label}, ${card.countLabel}`}
              onPress={() => router.push(card.href)}
              style={{
                flex: 1,
                minWidth: '45%',
                minHeight: 88,
                padding: 12,
                backgroundColor: c.bg,
                borderRadius: 12,
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: c.line,
              }}
            >
              <Row wrap={false}>
                <Icon name={card.icon} color={card.color} size={22} />
                <Copy kind="label" style={{ fontSize: 14, color: c.ink, flex: 1 }}>
                  {card.label}
                </Copy>
              </Row>
              <Copy kind="meta" style={{ fontSize: 12, color: c.cobalt, fontWeight: '600' }}>
                {card.countLabel}
              </Copy>
            </Pressable>
          ))}
        </View>
      </Panel>

      {/* SECTION 6: RECENT RECORDS & RECENT EVENTS PREVIEWS */}
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
              <Copy kind="display" style={{ fontSize: 25 }}>
                {latest.value}
              </Copy>
              <Copy kind="label">{latest.unit}</Copy>
            </Row>
            <Copy kind="meta">
              {t('recorded')} {latest.date} · {latest.facility}
            </Copy>
            <Badge text={t(latest.status === 'clinician-confirmed' ? 'confirmedShort' : 'extractedShort')} tone="amber" />
          </Pressable>
        </Panel>
      )}

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

      {/* SECTION 7: ADMINISTRATIVE HELP & CAREGIVER SHARING */}
      <LinkRow
        title="Care Coordinator Help"
        subtitle="Request medical certificates, scheduling assistance, or record transfers"
        href="/coordinator-request"
      />

      <LinkRow
        title={t('sharing')}
        subtitle="Manage caregiver access and temporary doctor share links"
        href="/sharing"
      />
    </Screen>
  );
}
