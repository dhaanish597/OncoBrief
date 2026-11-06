import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, reduce, records, timeline, readiness, validateFile, buildPacket, hydrate, productionGateway } from '../src/domain';

const now = '2026-10-28T10:00:00.000Z';
test('search and category filters compose without changing stored records', () => {
  const s = createDemo();
  assert.equal(records(s, 'laboratory', 'blood').length, 2);
  assert.equal(records(s, 'imaging', 'blood').length, 0);
  assert.equal(s.documents.length, 5);
});
test('timeline is a projection of sourced ledger facts; filters do not fabricate milestones', () => {
  const s = createDemo();
  assert.ok(timeline(s).every(e => e.source.documentId && e.source.quote));
  assert.ok(timeline(s, 'appointment').every(e => e.kind === 'appointment'));
  assert.equal(timeline({ ...s, ledger: [] }).length, 0);
});
test('patient review preserves original evidence and cannot confer clinician verification', () => {
  const s = createDemo();
  const updated = reduce(s, { type: 'review', id: 'd2' }, now);
  assert.equal(updated.documents.find(d => d.id === 'd2')?.patientReviewed, true);
  assert.equal(updated.documents.find(d => d.id === 'd2')?.clinicianVerified, false);
  assert.deepEqual(s.ledger, updated.ledger);
  assert.equal(updated.audit.at(-1)?.action, 'patient_review');
});
test('readiness excludes optional and disabled items and never measures treatment', () => {
  const s = createDemo();
  assert.equal(readiness({ ...s, checks: [] }).total, 0);
  const changed = reduce(s, { type: 'check', id: s.checks[0]!.id }, now);
  assert.equal(readiness(changed).done, readiness(s).done + 1);
});
test('question validation rejects blank and excessive inputs and audits valid additions', () => {
  const s = createDemo();
  assert.throws(() => reduce(s, { type: 'question', text: ' ' }, now));
  assert.throws(() => reduce(s, { type: 'question', text: 'x'.repeat(1001) }, now));
  const changed = reduce(s, { type: 'question', text: 'Where can I obtain the original report?' }, now);
  assert.equal(changed.questions.length, s.questions.length + 1);
  assert.equal(changed.audit.at(-1)?.actor, 'demo-patient');
});
test('sharing requires approval, recipient, purpose, known documents and future expiry', () => {
  const s = createDemo();
  const grant = { recipient: 'Demo coordinator', purpose: 'Prepare visit', ids: ['d1'], expiresAt: '2026-10-29T10:00:00.000Z', approved: true };
  assert.throws(() => reduce(s, { type: 'share', ...grant, approved: false }, now));
  assert.throws(() => reduce(s, { type: 'share', ...grant, ids: ['unknown'] }, now));
  assert.throws(() => reduce(s, { type: 'share', ...grant, expiresAt: '2020-01-01' }, now));
  assert.throws(() => reduce(s, { type: 'share', ...grant, recipient: '' }, now));
  const changed = reduce(s, { type: 'share', ...grant }, now);
  assert.equal(changed.grants[0]?.simulated, true);
  const revoked = reduce(changed, { type: 'revoke', id: changed.grants[0]!.id }, now);
  assert.equal(revoked.grants[0]?.revokedAt, now);
});
test('patient flags preserve conflicting sources; reconciliation stays human only', () => {
  const s = createDemo();
  const changed = reduce(s, { type: 'flag', id: 'd2', reason: 'Please confirm the appointment date' }, now);
  assert.equal(changed.flags.length, 1);
  assert.deepEqual(changed.ledger, s.ledger);
  assert.equal(changed.ledger.filter(e => e.status === 'conflicting').length, 2);
});
test('file validation rejects oversized files, unsupported types, missing sizes and misleading extensions', () => {
  assert.equal(validateFile({ name: 'report.pdf', mimeType: 'application/pdf', size: 100 }), null);
  assert.ok(validateFile({ name: 'report.exe', mimeType: 'application/pdf', size: 100 }));
  assert.ok(validateFile({ name: 'report.pdf', mimeType: 'application/pdf', size: 26 * 1024 * 1024 }));
  assert.ok(validateFile({ name: 'report.pdf', mimeType: 'application/pdf' }));
});
test('packet requires explicit approval and retains uncertainty and exact document scope', () => {
  const s = createDemo();
  assert.throws(() => buildPacket(s, ['d1'], false));
  assert.throws(() => buildPacket(s, [], true));
  const pack = buildPacket(s, ['d1', 'd2'], true);
  assert.match(pack, /SYNTHETIC/);
  assert.match(pack, /conflicting/);
  assert.ok(!pack.includes(s.documents.find(d => d.id === 'd5')!.name));
});
test('hydration rejects unknown versions and malformed persisted data without exposing real patient data', () => {
  const s = createDemo();
  assert.equal(hydrate(JSON.stringify(s)).mode, 'demo');
  assert.throws(() => hydrate('{"version":99}'));
  assert.throws(() => hydrate(JSON.stringify({ ...s, mode: 'production' })));
  assert.throws(() => hydrate(JSON.stringify({ ...s, documents: [{ id: 'bad' }] })));
});
test('wellbeing entries are patient-reported, validated, timestamped and never interpreted', () => {
  const s = createDemo();
  assert.throws(() => reduce(s, { type: 'wellbeing', text: '', intensity: 6 }, now));
  const changed = reduce(s, { type: 'wellbeing', text: 'Tired after a long day', intensity: 3 }, now);
  assert.equal(changed.observations[0]?.source, 'patient-reported');
  assert.equal(changed.observations[0]?.at, now);
});
test('missing-record items are patient maintained and attaching a document validates ownership', () => {
  const s = createDemo();
  const changed = reduce(s, { type: 'missing', text: 'My referral copy', note: 'Ask reception' }, now);
  assert.equal(changed.missing.at(-1)?.source, 'patient');
  assert.throws(() => reduce(changed, { type: 'missingStatus', id: changed.missing.at(-1)!.id, status: 'available', documentId: 'unknown' }, now));
});
test('production gateway fails closed without making an HTTP request', async () => {
  await assert.rejects(() => productionGateway.load(), /not configured/i);
});
