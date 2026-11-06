import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemo,
  createEmptyConnectedState,
  reduce,
  type State,
} from '../src/domain';
import { ConnectedPatientRepository } from '../src/repository';
import { formatChecklistProgress } from '../src/patient-selectors';

describe('M6.5 Remediation: REM-001 Personal Checklist & Non-Zero Denominator', () => {
  it('formatChecklistProgress handles empty checklist without rendering 0/0 or 0%', () => {
    const emptyState: State = createEmptyConnectedState();
    const result = formatChecklistProgress(emptyState);
    assert.strictEqual(result.hasItems, false);
    assert.strictEqual(result.percentageText, null);
    assert.strictEqual(result.displayText, 'No checklist items yet');
    assert.strictEqual(result.percent, 0);
  });

  it('formatChecklistProgress formats 2 of 5 completed — 40% accurately', () => {
    const state = createDemo();
    // Configure exactly 5 enabled non-optional checks with 2 done
    state.checks = [
      { id: 'c1', label: 'Item 1', done: true, enabled: true, optional: false },
      { id: 'c2', label: 'Item 2', done: true, enabled: true, optional: false },
      { id: 'c3', label: 'Item 3', done: false, enabled: true, optional: false },
      { id: 'c4', label: 'Item 4', done: false, enabled: true, optional: false },
      { id: 'c5', label: 'Item 5', done: false, enabled: true, optional: false },
    ];
    const result = formatChecklistProgress(state);
    assert.strictEqual(result.hasItems, true);
    assert.strictEqual(result.done, 2);
    assert.strictEqual(result.total, 5);
    assert.strictEqual(result.percent, 40);
    assert.strictEqual(result.percentageText, '40%');
    assert.strictEqual(result.displayText, '2 of 5 completed · 40%');
  });

  it('ConnectedPatientRepository hydrates checklist items from preparation snapshot', () => {
    const repo = new ConnectedPatientRepository();
    repo.hydrateSnapshot({
      patient: { id: 'p1', displayName: 'Meenakshi Sundaram', mrn: 'MRN-101', stage: 'IIB', diagnosis: 'Invasive Ductal Carcinoma', primaryLanguage: 'ta' },
      summary: { diagnosis: 'Invasive Ductal Carcinoma', journeyStage: 'IIB', readinessScore: { done: 0, total: 0 } },
      documents: [],
      timeline: [],
      appointments: [],
      continuityMessages: [],
      tasks: [
        { id: 'task-1', title: 'Bring biopsy block from earlier clinic', detail: 'Required for IHC review', dueOn: '2026-11-10', status: 'open', priority: 'high' }
      ],
      caregivers: [],
      shareGrants: [],
      preparation: {
        checksJson: [
          { id: 'prep-c1', label: 'Collect previous mammogram films', done: false, enabled: true, optional: false },
          { id: 'prep-c2', label: 'Carry list of current antihypertensive medications', done: true, enabled: true, optional: false }
        ],
        questionsJson: [
          { id: 'q-1', text: 'Will this require radiation therapy?', answered: false, at: '2026-11-01T10:00:00Z' }
        ],
        symptomNotes: 'Occasional localized discomfort',
        companionName: 'Ramesh Sundaram',
        packSelectedDocumentIds: [],
        updatedAt: '2026-11-01T10:00:00Z'
      },
      lastSyncedAt: '2026-11-01T10:00:00Z'
    });

    assert.strictEqual(repo.state.checks.length, 2);
    assert.strictEqual(repo.state.checks[0]!.id, 'prep-c1');
    assert.strictEqual(repo.state.checks[1]!.done, true);
    assert.strictEqual(repo.state.questions.length, 1);
    assert.strictEqual(repo.state.questions[0]!.text, 'Will this require radiation therapy?');

    const progress = formatChecklistProgress(repo.state);
    assert.strictEqual(progress.hasItems, true);
    assert.strictEqual(progress.done, 1);
    assert.strictEqual(progress.total, 2);
    assert.strictEqual(progress.percent, 50);
  });

  it('ConnectedPatientRepository generates non-diagnostic personal preparation items if backend has no preparation record', () => {
    const repo = new ConnectedPatientRepository();
    repo.hydrateSnapshot({
      patient: { id: 'p1', displayName: 'Meenakshi Sundaram', mrn: 'MRN-101', stage: 'IIB', diagnosis: 'Invasive Ductal Carcinoma', primaryLanguage: 'ta' },
      summary: { diagnosis: 'Invasive Ductal Carcinoma', journeyStage: 'IIB', readinessScore: { done: 0, total: 0 } },
      documents: [],
      timeline: [],
      appointments: [],
      continuityMessages: [],
      tasks: [],
      caregivers: [],
      shareGrants: [],
      preparation: null,
      lastSyncedAt: '2026-11-01T10:00:00Z'
    });

    // Should initialize default non-diagnostic personal checklist items for oncology visits
    assert.ok(repo.state.checks.length > 0, 'Should have initial personal checklist items');
    const progress = formatChecklistProgress(repo.state);
    assert.strictEqual(progress.hasItems, true);
    assert.ok(progress.total > 0);
  });

  it('allows patient to add personal preparation checklist items without creating clinical orders', () => {
    let state = createEmptyConnectedState();
    state = reduce(state, { type: 'addCheck', text: 'Bring list of questions on paper' });
    assert.strictEqual(state.checks.length, 1);
    assert.strictEqual(state.checks[0]!.label, 'Bring list of questions on paper');
    assert.strictEqual(state.checks[0]!.done, false);

    // Toggle item completion
    state = reduce(state, { type: 'check', id: state.checks[0]!.id });
    assert.strictEqual(state.checks[0]!.done, true);

    const progress = formatChecklistProgress(state);
    assert.strictEqual(progress.done, 1);
    assert.strictEqual(progress.total, 1);
    assert.strictEqual(progress.percent, 100);
  });
});

describe('M6.5 Remediation: REM-002 & REM-003 Question Editor Crash Prevention & Lifecycle', () => {
  it('prevents raw text nodes and space strings in preparation workspace JSX', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.resolve(__dirname, '../src/preparation-workspace.tsx');
    const content = fs.readFileSync(filePath, 'utf8');
    // Verify no literal whitespace between adjacent JSX expression braces inside Panels
    assert.doesNotMatch(content, /\/>\}\s+\{clearNotes/);
  });

  it('supports full question lifecycle: add, edit, toggle answer, delete', () => {
    let state = createDemo();
    const initialCount = state.questions.length;

    // 1. Add question
    state = reduce(state, { type: 'question', text: 'Should I take my blood pressure pills before the visit?' });
    assert.strictEqual(state.questions.length, initialCount + 1);
    const addedId = state.questions[state.questions.length - 1]!.id;

    // 2. Edit question
    state = reduce(state, { type: 'editQuestion', id: addedId, text: 'Should I take my morning medications before the appointment?' });
    const edited = state.questions.find((q) => q.id === addedId);
    assert.strictEqual(edited?.text, 'Should I take my morning medications before the appointment?');

    // 3. Toggle answered
    state = reduce(state, { type: 'answer', id: addedId });
    assert.strictEqual(state.questions.find((q) => q.id === addedId)?.answered, true);

    // 4. Delete question with explicit approval
    state = reduce(state, { type: 'removeQuestion', id: addedId, approved: true });
    assert.strictEqual(state.questions.some((q) => q.id === addedId), false);
  });

  it('deduplicates identical or case-insensitive questions without duplicating', () => {
    let state = createDemo();
    const count = state.questions.length;
    state = reduce(state, { type: 'question', text: 'What side effects should I expect?' });
    assert.strictEqual(state.questions.length, count + 1);
    const deduped = reduce(state, { type: 'question', text: '  what side effects should i expect?  ' });
    assert.strictEqual(deduped.questions.length, count + 1);
  });

  it('rejects blank question text', () => {
    const state = createDemo();
    assert.throws(
      () => reduce(state, { type: 'question', text: '   ' }),
      /invalid_input/
    );
  });
});

describe('M6.5 Remediation: REM-006 Medical Records Grounded Vault & Categories', () => {
  it('categorizes documents without double-counting and provides grounded counts', () => {
    const state = createDemo();
    const totalDocs = state.documents.length;
    assert.ok(totalDocs >= 5);

    // Check categories
    const categories = ['laboratory', 'pathology', 'imaging', 'referral', 'prescription', 'other'] as const;
    const categoryCounts: Record<string, number> = {};
    for (const cat of categories) {
      categoryCounts[cat] = state.documents.filter((d) => d.category === cat).length;
    }

    // Sum of categorized documents equals total (no double counting)
    const sum = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, totalDocs);
  });
});
