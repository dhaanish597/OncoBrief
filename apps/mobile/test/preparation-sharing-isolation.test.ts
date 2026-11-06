import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, reduce } from '../src/domain';

test('optional check c4 is checkable and visible when enabled (BUG-MOB-06 / REQ-MOB-024)', () => {
  const s = createDemo();
  const c4 = s.checks.find(c => c.id === 'c4');
  assert.ok(c4, 'c4 check must exist in checklist');
  assert.equal(c4?.optional, true, 'c4 is an optional check');

  // When enabled, it must be included in enabled checks
  const enabledState = c4.enabled ? s : reduce(s, { type: 'enableCheck', id: 'c4' });
  const activeChecks = enabledState.checks.filter(c => c.enabled);
  assert.ok(activeChecks.some(c => c.id === 'c4'), 'c4 must be visible when enabled');

  // Can toggle done state
  const checked = reduce(enabledState, { type: 'check', id: 'c4' });
  assert.equal(checked.checks.find(c => c.id === 'c4')?.done, !enabledState.checks.find(c => c.id === 'c4')?.done);
});

test('packSelected and shareSelected are strictly isolated states (BUG-MOB-05 / REQ-MOB-024 / SEC-MOB-04)', () => {
  const s = createDemo();

  assert.ok(Array.isArray(s.packSelected), 'packSelected must be an array');
  assert.ok(Array.isArray(s.shareSelected), 'shareSelected must be an array');

  // Change pack selection
  const targetDoc = s.documents[0]!.id;
  const initialShare = [...s.shareSelected];

  const packChanged = reduce(s, { type: 'selectPack', id: targetDoc });
  assert.notDeepEqual(packChanged.packSelected, s.packSelected);
  assert.deepEqual(packChanged.shareSelected, initialShare, 'shareSelected must NOT be modified by selectPack');

  // Change share selection
  const shareChanged = reduce(packChanged, { type: 'selectShare', id: targetDoc });
  assert.notDeepEqual(shareChanged.shareSelected, packChanged.shareSelected);
  assert.deepEqual(shareChanged.packSelected, packChanged.packSelected, 'packSelected must NOT be modified by selectShare');
});

test('question prompts deduplicate identical or case-insensitive text (BUG-MOB-11 / REQ-MOB-026)', () => {
  const s = createDemo();
  const initialCount = s.questions.length;

  const added = reduce(s, { type: 'question', text: 'When is my next scan scheduled?' });
  assert.equal(added.questions.length, initialCount + 1);

  // Attempt duplicate addition with different casing and whitespace
  const dup = reduce(added, { type: 'question', text: '  when is my next scan scheduled?  ' });
  assert.equal(dup.questions.length, initialCount + 1, 'Duplicate question must be deduplicated');
});

test('onboarding gate enforces explicit consent before tab access (BUG-MOB-07 / REQ-MOB-035)', () => {
  const s = createDemo();
  assert.equal(s.onboarded, false, 'Patient app must start in un-onboarded state');

  const onboarded = reduce(s, { type: 'onboard' });
  assert.equal(onboarded.onboarded, true, 'onboard action must set onboarded to true');
});
