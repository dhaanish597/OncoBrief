import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { PatientPortalApiClient } from '../src/api-client';
import { ConnectedPatientRepository } from '../src/repository';

test('unsupported API mutations throw instead of falsely acknowledging success', async () => {
  await assert.rejects(new PatientPortalApiClient().executeMutation({ action: { type: 'unimplemented' } }), /unsupported/i);
});

test('approved connected preparation saves persist through API; failed saves stay queued for explicit retry', async () => {
  const writes: Parameters<PatientPortalApiClient['syncPreparation']>[0][] = [];
  let offline = false;
  const client = new PatientPortalApiClient();
  client.syncPreparation = async (params) => {
    if (offline) throw new TypeError('Failed to fetch');
    writes.push(params);
    return { updated: true };
  };
  const repo = new ConnectedPatientRepository({ client });
  repo.apply({ type: 'draft', key: 'question', text: 'Unapproved draft' });
  assert.equal(repo.syncQueue.size(), 0, 'Typing must not enqueue an approved server save');
  repo.apply({ type: 'question', text: 'Please explain my report at the visit' });
  await setImmediate();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.questions[0]?.text, 'Please explain my report at the visit');
  assert.equal(repo.syncQueue.size(), 0);
  offline = true;
  repo.apply({ type: 'notes', text: 'Bring my outside reports' });
  await setImmediate();
  assert.equal(repo.syncQueue.size(), 1, 'Failed network save remains pending');
  assert.equal(writes.length, 1);
  repo.apply({ type: 'draft', key: 'notes', text: 'Unapproved replacement' });
  offline = false;
  await repo.flush();
  assert.equal(writes.length, 2);
  assert.equal(writes[1]?.symptomNotes, 'Bring my outside reports');
  assert.equal(writes[1]?.questions[0]?.text, 'Please explain my report at the visit');
  assert.equal(repo.syncQueue.size(), 0);
});

test('failed retry and a successful refresh preserve approved local preparation for the next save', async () => {
  const client = new PatientPortalApiClient();
  let offline = true;
  const writes: Parameters<PatientPortalApiClient['syncPreparation']>[0][] = [];
  client.syncPreparation = async (params) => {
    if (offline) throw new TypeError('Failed to fetch');
    writes.push(params);
    return { updated: true };
  };
  client.getSnapshot = async () => emptySnapshot('patient-a');
  const repo = new ConnectedPatientRepository({ client });
  repo.isAuthenticated = true;
  repo.apply({ type: 'question', text: 'Approved A' });
  await setImmediate();
  await repo.retry();
  await repo.refreshSnapshot();
  assert.equal(repo.state.questions[0]?.text, 'Approved A');
  repo.apply({ type: 'question', text: 'Approved B' });
  await setImmediate();
  offline = false;
  await repo.flush();
  assert.deepEqual(writes.at(-1)?.questions.map((q) => q.text), ['Approved A', 'Approved B']);
});

function emptySnapshot(patientId: string) {
  return { patient: { id: patientId, displayName: patientId, mrn: null },
    summary: { diagnosis: '', journeyStage: '', readinessScore: { done: 0, total: 0 } },
    documents: [], timeline: [], appointments: [], continuityMessages: [], caregivers: [], shareGrants: [],
    preparation: { questions: [], symptomNotes: '', companionName: '', packSelectedDocumentIds: [] },
  };
}

test('expired patient A saves never cross into patient B session without explicit discard', async () => {
  const client = new PatientPortalApiClient();
  let patientId = 'patient-a';
  let expired = false;
  const writes: { token: string | null; texts: string[] }[] = [];
  client.createSession = async () => {
    client.setToken(patientId);
    return { token: patientId, patient: { id: patientId, displayName: patientId, mrn: null },
      organization: { id: 'org', slug: 'demo', name: 'Demo' }, actorRole: 'patient', grantedScopes: ['preparation'] };
  };
  client.getSnapshot = async () => emptySnapshot(patientId);
  client.revokeSession = async () => ({ ok: true });
  client.syncPreparation = async (params) => {
    if (expired) throw Object.assign(new Error('Expired'), { status: 401 });
    writes.push({ token: client.getToken(), texts: params.questions.map((q) => q.text) });
    return { updated: true };
  };
  const repo = new ConnectedPatientRepository({ client });
  const credentials = { hospitalSlug: 'demo', identifier: 'synthetic', otp: '246810' };
  await repo.signIn(credentials);
  expired = true;
  repo.apply({ type: 'question', text: 'Private A question' });
  await setImmediate();
  assert.equal(repo.isAuthenticated, false);
  expired = false;
  await repo.signIn(credentials);
  assert.equal(repo.syncQueue.size(), 1, 'Same patient reauthentication retains the approved pending save');
  assert.equal(repo.state.questions[0]?.text, 'Private A question');
  patientId = 'patient-b';
  await assert.rejects(repo.signIn(credentials), /pending.*another patient|discard/i);
  await repo.flush();
  assert.equal(writes.length, 0);
  assert.equal(repo.state.patientName, 'patient-a');
  await repo.signOut();
  await repo.signIn(credentials);
  repo.apply({ type: 'question', text: 'Patient B question' });
  await setImmediate();
  assert.deepEqual(writes, [{ token: 'patient-b', texts: ['Patient B question'] }]);
});
