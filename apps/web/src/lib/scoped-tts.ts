import { NextResponse } from 'next/server';
import { can } from '@oncobrief/domain';
import { sarvamTts, SarvamError } from '@oncobrief/adapters';
import { withTenant, getMessage, checkMessageGate, getConversation, getPatient, getDocument } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';
import { SUPPORTED_LOCALES } from '@/lib/locales';

const ALLOWED_LOCALES = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code));
const headers = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache' };
const failure = (code: string, status: number) => NextResponse.json({ error: { code } }, { status, headers });

/** Only saved, tenant-scoped text may leave the server for speech synthesis. */
export function scopedTts(scope: 'continuity' | 'assistant') {
  return async (request: Request) => {
    const session = await getSession();
    if (!session) return failure('unauthorized', 401);
    if (!can(session.role, 'patient:read')) return failure('forbidden', 403);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return failure('bad_request', 400);
      body = parsed as Record<string, unknown>;
    } catch { return failure('bad_request', 400); }
    const languageCode = body.languageCode ?? 'en-IN';
    if (typeof languageCode !== 'string' || !ALLOWED_LOCALES.has(languageCode)) return failure('unsupported_locale', 400);
    if (scope === 'continuity' && (typeof body.messageId !== 'string' || typeof body.patientId !== 'string')) return failure('bad_request', 400);
    if (scope === 'assistant' && (typeof body.conversationId !== 'string' || typeof body.text !== 'string')) return failure('bad_request', 400);

    const resolved = await withTenant(tenantCtx(session), async (q) => {
      if (scope === 'continuity') {
        const message = await getMessage(q, body.messageId as string);
        if (!message || message.orgId !== session.orgId || message.patientId !== body.patientId) return { error: 'not_found', status: 404 };
        if (message.status === 'withdrawn') return { error: 'source_unavailable', status: 409 };
        const gate = await checkMessageGate(q, message.id);
        if (!gate.ok) return { error: 'source_unavailable', status: 409 };
        return { text: message.bodyRendered };
      }
      const conversation = await getConversation(q, body.conversationId as string, session.userId);
      if (!conversation || (conversation.patientId && !await getPatient(q, conversation.patientId))) return { error: 'not_found', status: 404 };
      const saved = conversation.messages.find((m) => m.role === 'assistant' && m.content === body.text);
      if (!saved) return { error: 'not_found', status: 404 };
      for (const source of saved.sources ?? []) {
        if (source && typeof source === 'object' && 'documentId' in source && typeof source.documentId === 'string') {
          if (!conversation.patientId || !await getDocument(q, conversation.patientId, source.documentId)) return { error: 'source_unavailable', status: 409 };
        }
      }
      return { text: saved.content };
    });
    if ('error' in resolved) return failure(resolved.error!, resolved.status!);
    if (!resolved.text.trim() || resolved.text.length > 2000) return failure('invalid_text_length', 400);
    try {
      const result = await sarvamTts({ text: resolved.text, languageCode });
      return NextResponse.json({ audioBase64: result.audioBase64, sampleRate: result.sampleRate, provider: 'sarvam' }, { headers });
    } catch (error) {
      return NextResponse.json({ error: { code: error instanceof SarvamError ? 'sarvam_unavailable' : 'tts_failed' }, fallbackText: resolved.text }, { status: 503, headers });
    }
  };
}
