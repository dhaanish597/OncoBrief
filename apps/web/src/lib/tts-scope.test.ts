import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@oncobrief/domain';
import type { Querier } from '@oncobrief/db';
type TestSession = { orgId: string; userId: string; role: Role };
type TestMessage = { id: string; patientId: string; orgId: string; status: string; bodyRendered: string };
type TestConversation = { patientId: string | null; messages: { role: string; content: string; sources?: unknown[] }[] };
const state = vi.hoisted(() => ({ session: null as TestSession | null, message: null as TestMessage | null, conversation: null as TestConversation | null, document: { id: 'd' } as { id: string } | null, gate: { ok: true, blockers: [] as string[] }, synth: vi.fn(async () => ({ audioBase64: 'audio', sampleRate: 22050 })) }));
vi.mock('@/lib/session', () => ({ getSession: async () => state.session, tenantCtx: (s: TestSession) => s }));
vi.mock('@oncobrief/db', () => ({ withTenant: async (_: unknown, fn: (q: Querier) => unknown) => fn({} as Querier), getMessage: async () => state.message, checkMessageGate: async () => state.gate, getConversation: async () => state.conversation, getPatient: async () => ({ id: 'patient' }), getDocument: async () => state.document }));
vi.mock('@oncobrief/adapters', () => ({ sarvamTts: state.synth, SarvamError: class extends Error {} }));
import { POST as assistant } from '@/app/api/v1/assistant/voice/tts/route';
import { POST as continuity } from '@/app/api/v1/continuity/tts/route';
const req = (body: unknown) => new Request('http://localhost/tts', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.session = { orgId: 'org', userId: 'user', role: 'coordinator' }; state.message = { id: 'm', patientId: 'p', orgId: 'org', status: 'approved', bodyRendered: 'Authoritative reminder' }; state.conversation = null; state.gate = { ok: true, blockers: [] }; });
describe('TTS authoritative scope', () => {
  it('rejects arbitrary text without an owned conversation', async () => { expect((await assistant(req({ text: 'Any PHI' }))).status).toBe(400); expect(state.synth).not.toHaveBeenCalled(); });
  it('rejects a missing or other tenant continuity message before provider dispatch', async () => { state.message = null; expect((await continuity(req({ messageId: 'm', patientId: 'p' }))).status).toBe(404); expect(state.synth).not.toHaveBeenCalled(); });
  it('synthesizes server message text and rejects a patient mismatch', async () => { expect((await continuity(req({ messageId: 'm', patientId: 'other' }))).status).toBe(404); const res = await continuity(req({ messageId: 'm', patientId: 'p', text: 'tampered', languageCode: 'hi-IN' })); expect(res.status).toBe(200); expect(state.synth).toHaveBeenCalledWith(expect.objectContaining({ text: 'Authoritative reminder' })); expect(res.headers.get('Cache-Control')).toContain('no-store'); });
  it('blocks withdrawn message sources', async () => { state.gate = { ok: false, blockers: ['withdrawn'] }; expect((await continuity(req({ messageId: 'm', patientId: 'p' }))).status).toBe(409); expect(state.synth).not.toHaveBeenCalled(); });
  it('only reads a saved assistant answer in an owned conversation', async () => { state.conversation = { patientId: 'p', messages: [{ role: 'assistant', content: 'Saved answer' }] }; expect((await assistant(req({ conversationId: 'c', text: 'tampered' }))).status).toBe(404); expect((await assistant(req({ conversationId: 'c', text: 'Saved answer' }))).status).toBe(200); });
  it.each([null, [], { text: 42 }])('rejects malformed bodies %s', async (body) => { expect((await assistant(req(body))).status).toBe(400); });
});

it('returns only gate-validated server text for a provider fallback', async () => {
  state.synth.mockRejectedValueOnce(new Error('provider unavailable'));
  const response = await continuity(req({ messageId: 'm', patientId: 'p', text: 'tampered' }));
  expect(response.status).toBe(503);
  expect((await response.json()).fallbackText).toBe('Authoritative reminder');
});

it('blocks saved assistant speech after source withdrawal', async () => {
  state.document = null;
  state.conversation = { patientId: 'p', messages: [{ role: 'assistant', content: 'Saved PHI', sources: [{ documentId: 'd' }] }] };
  expect((await assistant(req({ conversationId: 'c', text: 'Saved PHI' }))).status).toBe(409);
  expect(state.synth).not.toHaveBeenCalled();
});
