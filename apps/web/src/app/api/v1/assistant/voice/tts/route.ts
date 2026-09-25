import { NextResponse } from 'next/server';
import { sarvamTts, SarvamError } from '@oncobrief/adapters';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Text-to-speech via Sarvam. The client falls back to the browser
 * speechSynthesis API if this fails.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  let body: { text?: string; languageCode?: string; speaker?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'bad_request' } }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (text.length === 0) {
    return NextResponse.json({ error: { code: 'empty_text' } }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: { code: 'text_too_long' } }, { status: 400 });
  }

  try {
    const result = await sarvamTts({
      text,
      languageCode: body.languageCode ?? 'en-IN',
      ...(body.speaker ? { speaker: body.speaker } : {}),
    });
    return NextResponse.json({
      audioBase64: result.audioBase64,
      sampleRate: result.sampleRate,
      provider: 'sarvam',
    });
  } catch (error) {
    const code = error instanceof SarvamError ? 'sarvam_unavailable' : 'tts_failed';
    return NextResponse.json({ error: { code } }, { status: 503 });
  }
}
