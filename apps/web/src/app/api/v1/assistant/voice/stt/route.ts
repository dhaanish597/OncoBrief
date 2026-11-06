import { NextResponse } from 'next/server';
import { can } from '@oncobrief/domain';
import { sarvamSttWithRetry, SarvamError, isSarvamConfigured } from '@oncobrief/adapters';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Check whether Sarvam STT is configured.
 * Open endpoint so UI can initialize voice input capability seamlessly.
 */
export async function GET() {
  return NextResponse.json({
    configured: isSarvamConfigured(),
  });
}

/**
 * Speech-to-text via Sarvam (`TASK-01.03`).
 * Audio is transcribed and immediately discarded — nothing is persisted.
 * Explicitly guards role permission (patient:read), upload size (< 10 MiB),
 * and uses sarvamSttWithRetry for reliability against transient network glitches.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }

  if (!can(session.role, 'patient:read')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: { code: 'bad_request' } }, { status: 400 });
  }

  const file = formData.get('audio');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: { code: 'no_audio' } }, { status: 400 });
  }

  // Pre-allocation upload-size enforcement (< 10 MiB)
  const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_AUDIO_SIZE) {
    return NextResponse.json({ error: { code: 'audio_too_large' } }, { status: 413 });
  }

  if (file.size < 100) {
    return NextResponse.json({ error: { code: 'audio_too_short' } }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength < 100) {
    return NextResponse.json({ error: { code: 'audio_too_short' } }, { status: 400 });
  }

  const languageCode = (formData.get('languageCode') as string | null) ?? 'en-IN';
  const rawMime = file.type || 'audio/webm';
  const mimeType = rawMime.split(';')[0]?.trim() || 'audio/webm';
  const filename =
    file instanceof File && file.name
      ? file.name
      : mimeType.includes('mp4')
        ? 'audio.mp4'
        : mimeType.includes('wav')
          ? 'audio.wav'
          : 'audio.webm';

  try {
    const result = await sarvamSttWithRetry(
      {
        audioData: Buffer.from(arrayBuffer),
        languageCode,
        mimeType,
        filename,
      },
      1,
    );
    return NextResponse.json({
      transcript: result.transcript,
      languageCode: result.languageCode,
      provider: 'sarvam',
    });
  } catch (error) {
    console.error('[STT API] Sarvam transcription failed:', error);
    const code = error instanceof SarvamError ? 'sarvam_unavailable' : 'stt_failed';
    const message = error instanceof Error ? error.message : 'Transcription failed';
    return NextResponse.json({ error: { code, message } }, { status: 503 });
  }
}
