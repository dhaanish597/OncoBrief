import { NextResponse } from 'next/server';
import { sarvamStt, SarvamError } from '@oncobrief/adapters';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Speech-to-text via Sarvam. The browser falls back to the Web Speech API if
 * this returns an error, so a missing key degrades gracefully rather than
 * crashing the chat. Audio is transcribed and immediately discarded — nothing
 * is persisted.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
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

  const languageCode = (formData.get('languageCode') as string | null) ?? 'en-IN';
  const arrayBuffer = await file.arrayBuffer();

  try {
    const result = await sarvamStt({
      audioData: Buffer.from(arrayBuffer),
      languageCode,
    });
    return NextResponse.json({
      transcript: result.transcript,
      languageCode: result.languageCode,
      provider: 'sarvam',
    });
  } catch (error) {
    // A non-retryable configuration error and a transient failure look the
    // same to the client: fall back to the browser. We still return a useful
    // code so the UI can show an honest error if the browser cannot help.
    const code = error instanceof SarvamError ? 'sarvam_unavailable' : 'stt_failed';
    return NextResponse.json({ error: { code } }, { status: 503 });
  }
}
