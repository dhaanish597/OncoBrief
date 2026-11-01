import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDraft, useStore } from './store';
import { formatChecklistProgress } from './patient-selectors';
import { Button, Chip, Copy, DocumentRow, Field, LinkRow, Panel, Row, Screen, SectionHeading, Toggle } from './ui';
import { theme as c } from './theme';
import consultationArt from '../assets/consultation.png';

type Stage = 'checklist' | 'questions' | 'reports' | 'review';
const stages: Stage[] = ['checklist', 'questions', 'reports', 'review'];

const QUESTION_SUGGESTIONS = [
  'What are the common side effects of this treatment plan?',
  'Should I take my regular medications on the morning of my visit?',
  'What warning symptoms should prompt an immediate clinic call?',
  'When should I expect the results of my recent tests?',
];

export function PreparationWorkspace() {
  const { state, t, dispatch, notify } = useStore();
  const params = useLocalSearchParams<{ stage?: string }>();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(
    stages.includes(params.stage as Stage) ? (params.stage as Stage) : 'checklist'
  );

  const [question, setQuestion] = useDraft('question');
  const [notes, setNotes] = useDraft('notes');
  const [check, setCheck] = useDraft('check');

  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [clearNotes, setClearNotes] = useState(false);
  const [configure, setConfigure] = useState(false);

  const progress = formatChecklistProgress(state);

  function saveQuestion() {
    const textToSave = (editId ? editText : question).trim();
    if (!textToSave) return;
    const ok = editId
      ? dispatch({ type: 'editQuestion', id: editId, text: textToSave })
      : dispatch({ type: 'question', text: textToSave });

    if (ok) {
      if (!editId) setQuestion('');
      setEditId(null);
      setEditText('');
      notify(t('saved'));
    }
  }

  function handleSelectSuggestion(suggestion: string) {
    if (editId) {
      setEditText(suggestion);
    } else {
      setQuestion(suggestion);
    }
  }

  return (
    <Screen back title={t('prepTitle')} intro={t('prepIntro')}>
      <Image
        source={consultationArt}
        accessibilityLabel={t('preparation')}
        resizeMode="cover"
        style={{ width: '100%', height: 128, borderRadius: 13, backgroundColor: c.blue }}
      />

      <Panel>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {stages.map((item, i) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={t(
                item === 'checklist'
                  ? 'stageChecklist'
                  : item === 'questions'
                  ? 'stageQuestions'
                  : item === 'reports'
                  ? 'stageReports'
                  : 'stageReview'
              )}
              accessibilityState={{ selected: stage === item }}
              onPress={() => setStage(item)}
              style={{ flex: 1, alignItems: 'center', gap: 8, minHeight: 62 }}
            >
              <View
                style={{
                  width: 29,
                  height: 29,
                  borderWidth: 1,
                  borderColor: stage === item ? c.cobalt : c.sand,
                  borderRadius: 18,
                  backgroundColor: stage === item ? c.cobalt : c.paper,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Copy kind="label" style={{ color: stage === item ? c.paper : c.muted }}>
                  {i + 1}
                </Copy>
              </View>
              <Copy kind="meta" style={{ color: stage === item ? c.cobalt : c.muted, textAlign: 'center' }}>
                {t(
                  item === 'checklist'
                    ? 'stageChecklist'
                    : item === 'questions'
                    ? 'stageQuestions'
                    : item === 'reports'
                    ? 'stageReports'
                    : 'stageReview'
                )}
              </Copy>
            </Pressable>
          ))}
        </View>
      </Panel>

      {/* STAGE 1: CHECKLIST */}
      {stage === 'checklist' && (
        <>
          <Panel compact>
            <SectionHeading
              title={progress.hasItems ? `${t('personalChecklist')} · ${progress.done}/${progress.total}` : t('personalChecklist')}
              action={progress.hasItems ? (configure ? 'Done' : t('manage')) : undefined}
              onPress={() => setConfigure(!configure)}
            />
            <Copy kind="meta">Personal preparation suggestions (optional self-reminders, not clinician medical orders).</Copy>

            {progress.hasItems ? (
              <>
                <Row>
                  <Copy kind="label">{progress.displayText}</Copy>
                </Row>
                <View
                  style={{ height: 9, backgroundColor: c.deep, borderRadius: 8 }}
                  accessibilityLabel={`${progress.done}/${progress.total} ${t('complete')}`}
                >
                  <View
                    style={{
                      height: 9,
                      borderRadius: 8,
                      width: `${progress.percent}%`,
                      backgroundColor: c.cobalt,
                    }}
                  />
                </View>
                {state.checks
                  .filter((c) => c.enabled)
                  .map((c) => (
                    <Toggle
                      key={c.id}
                      title={state.locale === 'ta' && c.labelTa ? c.labelTa : c.label}
                      checked={c.done}
                      onPress={() => dispatch({ type: 'check', id: c.id })}
                    />
                  ))}
              </>
            ) : (
              <View style={{ gap: 8, paddingVertical: 6 }}>
                <Copy kind="body">No checklist items yet</Copy>
                <Copy kind="meta">Create personal preparation items below to get ready for your visit.</Copy>
              </View>
            )}

            <Copy kind="meta">{t('notMedicalReadiness')}</Copy>

            {(configure || !progress.hasItems) && (
              <View style={{ gap: 12, marginTop: 8 }}>
                {state.checks.map((c) => (
                  <Toggle
                    key={c.id}
                    title={`${state.locale === 'ta' && c.labelTa ? c.labelTa : c.label} · ${t(
                      c.enabled ? 'enabled' : 'excluded'
                    )}${c.optional ? ` · ${t('optional')}` : ''}`}
                    checked={c.enabled}
                    onPress={() => dispatch({ type: 'enableCheck', id: c.id })}
                  />
                ))}
                <Field
                  label={t('checkPlaceholder')}
                  value={check}
                  onChange={setCheck}
                  maxLength={200}
                  placeholder="e.g. Bring pathology slides or scan CDs"
                />
                <Button
                  secondary
                  disabled={!check.trim()}
                  title={t('addCheck')}
                  onPress={() => {
                    if (dispatch({ type: 'addCheck', text: check })) setCheck('');
                  }}
                />
              </View>
            )}
          </Panel>

          <Panel tone="blue">
            <SectionHeading title={t('appointmentConfirm')} />
            <Copy kind="meta">{t('noVisits')}</Copy>
            {state.ledger
              .filter((e) => e.kind === 'appointment')
              .map((e) => (
                <LinkRow
                  key={e.id}
                  title={e.date}
                  subtitle={state.documents.find((d) => d.id === e.source.documentId)?.name}
                  href={{ pathname: '/record/[id]', params: { id: e.source.documentId } }}
                />
              ))}
            <Button
              secondary
              title={t('compareSources')}
              onPress={() => router.push({ pathname: '/compare', params: { left: 'd2', right: 'd5' } })}
            />
          </Panel>

          <Panel>
            <SectionHeading
              title={`${t('questionCount')} (${state.questions.length})`}
              action={t('edit')}
              onPress={() => setStage('questions')}
            />
            {state.questions.length === 0 ? (
              <Copy kind="meta">No questions saved yet. Add questions for your doctor in Step 2.</Copy>
            ) : (
              state.questions.slice(0, 2).map((q) => <Copy key={q.id}>• {q.text}</Copy>)
            )}
          </Panel>
        </>
      )}

      {/* STAGE 2: QUESTIONS FOR MY DOCTOR */}
      {stage === 'questions' && (
        <>
          <Panel>
            <SectionHeading
              title={editId ? t('editQuestion') : 'Add a question for my doctor'}
            />
            <Copy kind="meta">
              Save priority questions to ask your oncologist during your consultation. Saved questions are included in your personal consultation pack.
            </Copy>

            {!editId && (
              <View style={{ gap: 6, marginVertical: 4 }}>
                <Copy kind="label" style={{ fontSize: 13, color: c.muted }}>
                  Suggested questions:
                </Copy>
                <Row>
                  {QUESTION_SUGGESTIONS.map((sug, idx) => (
                    <Chip
                      key={idx}
                      title={sug.length > 36 ? sug.slice(0, 36) + '...' : sug}
                      onPress={() => handleSelectSuggestion(sug)}
                    />
                  ))}
                </Row>
              </View>
            )}

            <Field
              label={editId ? t('editQuestion') : 'Your question'}
              value={editId ? editText : question}
              onChange={editId ? setEditText : setQuestion}
              multiline
              placeholder="e.g. What are the common side effects of my chemotherapy regimen?"
              testID="question-input"
            />

            <Button
              title={editId ? t('saveChanges') : 'Save a question for my next visit'}
              disabled={!(editId ? editText : question).trim()}
              onPress={saveQuestion}
            />

            {editId && (
              <Button
                secondary
                title={t('cancel')}
                onPress={() => {
                  setEditId(null);
                  setEditText('');
                }}
              />
            )}
          </Panel>

          <Panel>
            <SectionHeading title={`${t('questionCount')} (${state.questions.length})`} />
            {state.questions.length === 0 ? (
              <View style={{ gap: 4, paddingVertical: 8 }}>
                <Copy kind="body">{t('noQuestions')}</Copy>
                <Copy kind="meta">Jot down questions as they occur to you so you can make the most of your clinic visit.</Copy>
              </View>
            ) : null}

            {state.questions.map((q) => (
              <View key={q.id} style={{ paddingBottom: 12, borderBottomWidth: 1, borderColor: c.line, gap: 9 }}>
                <Toggle
                  title={`${q.text} · ${t(q.answered ? 'answered' : 'unanswered')}`}
                  checked={q.answered}
                  onPress={() => dispatch({ type: 'answer', id: q.id })}
                />
                <Row>
                  <Chip
                    title={t('edit')}
                    onPress={() => {
                      setEditId(q.id);
                      setEditText(q.text);
                    }}
                  />
                  <Chip title={t('remove')} onPress={() => setRemoveId(q.id)} />
                </Row>

                {removeId === q.id && (
                  <Panel tone="amber">
                    <Copy kind="label">{t('removeQuestion')}</Copy>
                    <Copy>{t('removeQuestionInfo')}</Copy>
                    <Button
                      title={t('confirmRemove')}
                      onPress={() => {
                        dispatch({ type: 'removeQuestion', id: q.id, approved: true });
                        setRemoveId(null);
                        if (editId === q.id) setEditId(null);
                      }}
                    />
                    <Button secondary title={t('cancel')} onPress={() => setRemoveId(null)} />
                  </Panel>
                )}
              </View>
            ))}
          </Panel>

          <Panel tone="blue">
            <SectionHeading title="Need immediate clinic assistance?" />
            <Copy kind="meta">
              Saved questions are for your personal visit packet. If you require medical certificates, urgent scheduling, or record transfers before your visit, contact your care coordinator.
            </Copy>
            <LinkRow
              title="Send a message to my clinic"
              subtitle="Submit an administrative or scheduling request"
              href="/coordinator-request"
            />
          </Panel>

          <Panel>
            <SectionHeading title={t('notes')} />
            <Field
              label={t('notes')}
              value={notes}
              onChange={setNotes}
              multiline
              maxLength={5000}
              placeholder="Record personal symptom observations or discussion points"
            />
            <Copy kind="meta">{t('notesDraft')}</Copy>
            <Button
              secondary
              title={t('saveNotes')}
              onPress={() => {
                if (dispatch({ type: 'notes', text: notes })) notify(t('saved'));
              }}
            />
            {!!(notes || state.notes) && (
              <Button secondary title={t('clearNotes')} onPress={() => setClearNotes(true)} />
            )}
            {clearNotes && (
              <Panel tone="amber">
                <Copy>{t('clearNotes')}?</Copy>
                <Button
                  title={t('confirmClearNotes')}
                  onPress={() => {
                    dispatch({ type: 'notes', text: '' });
                    setNotes('');
                    setClearNotes(false);
                  }}
                />
                <Button secondary title={t('cancel')} onPress={() => setClearNotes(false)} />
              </Panel>
            )}
          </Panel>
        </>
      )}

      {/* STAGE 3: REPORTS */}
      {stage === 'reports' && (
        <Panel>
          <SectionHeading
            title={`${t('recordsSelected')} (${state.packSelected.length})`}
            action={t('addDocument')}
            onPress={() => router.push('/import')}
          />
          {state.documents.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              selected={state.packSelected.includes(d.id)}
              onSelect={() => dispatch({ type: 'selectPack', id: d.id })}
            />
          ))}
        </Panel>
      )}

      {/* STAGE 4: REVIEW */}
      {stage === 'review' && (
        <>
          <Panel>
            <Copy kind="title">{t('preparationSummary')}</Copy>
            <Copy>
              {progress.hasItems ? `${progress.done}/${progress.total} ${t('complete')}` : 'No checklist items'}
            </Copy>
            <Copy kind="meta">{t('notMedicalReadiness')}</Copy>

            <SectionHeading title={t('outstanding')} />
            {state.checks.filter((c) => c.enabled && !c.done).length === 0 ? (
              <Copy kind="meta">All preparation checks completed.</Copy>
            ) : (
              state.checks
                .filter((c) => c.enabled && !c.done)
                .map((c) => (
                  <Copy key={c.id}>• {state.locale === 'ta' && c.labelTa ? c.labelTa : c.label}</Copy>
                ))
            )}

            <SectionHeading title={t('questions')} />
            {state.questions.filter((q) => !q.answered).length === 0 ? (
              <Copy kind="meta">No pending questions.</Copy>
            ) : (
              state.questions
                .filter((q) => !q.answered)
                .map((q) => <Copy key={q.id}>• {q.text}</Copy>)
            )}

            <SectionHeading title={t('notes')} />
            <Copy>{state.notes || '—'}</Copy>
          </Panel>

          <Panel>
            <SectionHeading title={`${t('recordsSelected')} (${state.packSelected.length})`} />
            {state.documents
              .filter((d) => state.packSelected.includes(d.id))
              .map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
          </Panel>

          {state.flags.length > 0 && (
            <Panel tone="amber">
              <Copy kind="label">{t('discussion')}</Copy>
              {state.flags.map((f) => (
                <Copy key={f.id}>{f.reason}</Copy>
              ))}
            </Panel>
          )}
        </>
      )}

      {stage !== 'review' && (
        <Button title={t('reviewPack')} onPress={() => setStage('review')} />
      )}
      <Button
        title={t('previewPacket')}
        disabled={!state.packSelected.length}
        onPress={() => router.push('/packet')}
      />
      <LinkRow title={t('checklist')} href="/checklist" />
    </Screen>
  );
}
