import { NextResponse } from 'next/server';
import { sarvamTts } from '@oncobrief/adapters';
import {
  withPatientPortalContext,
  appendAuditEvent,
} from '@oncobrief/db';
import { requirePatientPortalSession, NO_CACHE_HEADERS } from '@/lib/patient-session';

const LANGUAGE_MAP: Record<string, string> = {
  ta: 'ta-IN',
  'ta-IN': 'ta-IN',
  en: 'en-IN',
  'en-IN': 'en-IN',
  hi: 'hi-IN',
  'hi-IN': 'hi-IN',
};

export async function POST(request: Request) {
  const auth = await requirePatientPortalSession(request, 'reminders');
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'Invalid JSON body' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const { messageId, language = 'en-IN' } = body as {
    messageId?: string;
    language?: string;
  };

  if (!messageId || typeof messageId !== 'string') {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'messageId is required' } },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const normalizedLocale = LANGUAGE_MAP[language] ?? 'en-IN';

  const result = await withPatientPortalContext(session, async (q) => {
    // 1. Ownership check (SEC-NEG-06 / IDOR guard)
    const msgRes = await q.query<{
      id: string;
      status: string;
      body_rendered: string;
    }>(
      `SELECT id, status, body_rendered
       FROM patient_message
       WHERE id = $1 AND patient_id = $2 AND org_id = $3`,
      [messageId, session.patientId, session.orgId],
    );

    if (msgRes.rowCount === 0) {
      return { status: 404, error: 'not_found', message: 'Message not found' };
    }
    const msg = msgRes.rows[0]!;

    // 2. Clinician approval guard (SEC-NEG-12)
    if (msg.status !== 'approved') {
      return {
        status: 403,
        error: 'unapproved_message_forbidden',
        message: 'Only clinician-approved messages can be synthesized to audio',
      };
    }

    // 3. Audio synthesis via Sarvam or fallback
    let audioBase64: string | null = null;
    try {
      const tts = await sarvamTts({
        text: msg.body_rendered,
        languageCode: normalizedLocale,
      });
      audioBase64 = tts.audioBase64;
    } catch {
      // In dev/test environments without Sarvam API key or network, return graceful fallback
      return {
        status: 503,
        error: 'tts_unavailable',
        fallbackText: msg.body_rendered,
        language: normalizedLocale,
      };
    }

    // 4. Audit log
    try {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: null, role: session.actorRole },
        action: 'message.delivery_attempted' as unknown as Parameters<typeof appendAuditEvent>[1]['action'],
        entityKind: 'patient_message',
        entityId: msg.id,
        outcome: 'success',
        metadata: {
          patientId: session.patientId,
          caregiverContactId: session.caregiverContactId ?? null,
          locale: normalizedLocale,
        },
      });
    } catch {
      /* non-fatal */
    }

    return {
      status: 200,
      audioBase64,
      mimeType: 'audio/wav',
      language: normalizedLocale,
      durationEstimateMs: Math.round((msg.body_rendered.length / 15) * 1000),
      transcript: msg.body_rendered,
    };
  });

  if ('error' in result) {
    if (result.status === 503) {
      return NextResponse.json(
        {
          error: { code: result.error, message: 'TTS provider unavailable' },
          fallbackText: result.fallbackText,
          language: result.language,
        },
        { status: 503, headers: NO_CACHE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: { code: result.error, message: result.message } },
      { status: result.status, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
}
