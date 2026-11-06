import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { isSarvamConfigured, sarvamStt, sarvamTts } from '../src/sarvam-voice';
import { SarvamTranslationAdapter } from '../src/sarvam-translation';
import { SarvamVisionOcrAdapter } from '../src/sarvam-vision-ocr';

// Ensure repo root .env is loaded when running in package workspace
if (!process.env.SARVAM_API_KEY) {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1]!.trim()] = match[2]!.trim();
      }
    }
  }
}

/**
 * Bounded Live Sarvam Contract Verification (`TASK-04.01`).
 *
 * This test suite is strictly opt-in and gated by `RUN_LIVE_SARVAM_CONTRACT === '1'`.
 * When this flag is not set, the tests are skipped so that default offline CI
 * and local development runs remain 100% deterministic and offline-safe.
 *
 * When enabled with a valid funded `SARVAM_API_KEY`:
 * 1. Sarvam Bulbul v3 TTS synthesizes Tamil audio with valid RIFF WAVE header.
 * 2. Sarvam Saaras v3 STT transcribes the synthesized audio.
 * 3. Sarvam Mayura v1 translates administrative reminder text to Hindi.
 */

const shouldRunLive = process.env.RUN_LIVE_SARVAM_CONTRACT === '1';

describe.skipIf(!shouldRunLive)('Live Sarvam Provider Contract Verification (Opt-In)', () => {
  let generatedWavBuffer: Buffer;

  it('verifies live Sarvam Bulbul v3 TTS synthesizes valid Tamil WAV audio', async () => {
    if (!isSarvamConfigured()) {
      console.warn('Skipping live TTS test: SARVAM_API_KEY is not configured with a valid key.');
      return;
    }

    const ttsResult = await sarvamTts({
      text: 'உங்கள் மருத்துவ சந்திப்பு நாளை காலை 10 மணிக்கு உள்ளது.',
      languageCode: 'ta-IN',
    });

    expect(ttsResult).toBeDefined();
    expect(ttsResult.audioBase64).toBeDefined();
    expect(typeof ttsResult.audioBase64).toBe('string');

    generatedWavBuffer = Buffer.from(ttsResult.audioBase64, 'base64');
    expect(generatedWavBuffer.byteLength).toBeGreaterThan(1000);

    // Verify RIFF WAVE header
    expect(generatedWavBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(generatedWavBuffer.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(generatedWavBuffer.subarray(12, 16).toString('ascii')).toBe('fmt ');
  }, 30_000);

  it('verifies live Sarvam Saaras v3 STT transcribes audio successfully', async () => {
    if (!isSarvamConfigured()) {
      console.warn('Skipping live STT test: SARVAM_API_KEY is not configured with a valid key.');
      return;
    }

    // Use synthesized audio from step 1, or minimal synthetic WAV if run isolated
    const audioToTranscribe =
      generatedWavBuffer ??
      Buffer.from(
        'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        'base64',
      );

    const sttResult = await sarvamStt({
      audioData: audioToTranscribe,
      languageCode: 'ta-IN',
      mimeType: 'audio/wav',
    });

    expect(sttResult).toBeDefined();
    expect(typeof sttResult.transcript).toBe('string');
    expect(sttResult.languageCode).toBeDefined();
  }, 30_000);

  it('verifies live Sarvam Mayura v1 translates text into Hindi script', async () => {
    if (!isSarvamConfigured()) {
      console.warn('Skipping live translation test: SARVAM_API_KEY is not configured with a valid key.');
      return;
    }

    const adapter = new SarvamTranslationAdapter();
    expect(adapter.isConfigured()).toBe(true);

    const result = await adapter.translate({
      text: 'Your appointment is on 15 May 2025 at Surgical Oncology OPD.',
      sourceLanguageCode: 'en-IN',
      targetLanguageCode: 'hi-IN',
    });

    expect(result).toBeDefined();
    expect(result.provider).toBe('sarvam-mayura');
    expect(result.targetLanguageCode).toBe('hi-IN');
    expect(result.translatedText).toBeDefined();
    // Verify translated text contains Devanagari characters [\u0900-\u097F]
    expect(/[\u0900-\u097F]/.test(result.translatedText)).toBe(true);
  }, 30_000);

  it('verifies live Sarvam Vision Document AI Digitise extracts text and coordinates from synthetic oncology record', async () => {
    if (!isSarvamConfigured()) {
      console.warn('Skipping live Vision test: SARVAM_API_KEY is not configured with a valid key.');
      return;
    }

    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    page.drawText('REGIONAL CANCER CENTRE - OUTPATIENT RECORD', { x: 50, y: 750, size: 14, font });
    page.drawText('Patient ID: SYNTH-ONCO-2026', { x: 50, y: 720, size: 11, font });
    page.drawText('Report Date: 2026-10-15', { x: 50, y: 700, size: 11, font });
    page.drawText('Diagnosis: Infiltrating ductal carcinoma of right breast', { x: 50, y: 670, size: 11, font });
    page.drawText('Next Appointment: 2026-11-20 at 10:00 AM', { x: 50, y: 640, size: 11, font });
    page.drawText('LABORATORY INVESTIGATION TABLE:', { x: 50, y: 600, size: 12, font });
    page.drawText('Analyte          Result      Reference Interval', { x: 50, y: 580, size: 10, font });
    page.drawText('Haemoglobin      12.4 g/dL   12.0 - 15.5 g/dL', { x: 50, y: 560, size: 10, font });
    page.drawText('Absolute Neutro  3500 /uL    2000 - 7000 /uL', { x: 50, y: 540, size: 10, font });

    const pdfBytes = Buffer.from(await doc.save());

    const adapter = new SarvamVisionOcrAdapter({
      pollIntervalMs: 1500,
      minIntervalMs: 1000,
      maxPolls: 30,
    });

    const pages = await adapter.extractDocument({
      documentId: 'doc-live-sarvam-synth-01',
      bytes: pdfBytes,
      mimeType: 'application/pdf',
      filename: 'synthetic_oncology_record.pdf',
      language: 'en-IN',
    });

    expect(pages).toBeDefined();
    expect(pages.length).toBe(1);

    const firstPage = pages[0]!;
    expect(firstPage.pageNumber).toBe(1);
    expect(firstPage.engine).toBe('sarvam-vision');
    expect(firstPage.spans.length).toBeGreaterThanOrEqual(5);

    // Verify synthetic oncology entities in plain text
    expect(firstPage.plainText).toContain('SYNTH-ONCO-2026');
    expect(firstPage.plainText).toContain('2026-10-15');
    expect(firstPage.plainText).toContain('Infiltrating ductal carcinoma');
    expect(firstPage.plainText).toContain('12.4 g/dL');
    expect(firstPage.plainText).toContain('2026-11-20');

    // Verify bounding box geometry
    for (const span of firstPage.spans) {
      expect(span.bbox.x).toBeGreaterThanOrEqual(0);
      expect(span.bbox.y).toBeGreaterThanOrEqual(0);
      expect(span.bbox.w).toBeGreaterThan(0);
      expect(span.bbox.h).toBeGreaterThan(0);
      expect(span.bbox.x + span.bbox.w).toBeLessThanOrEqual(1.001);
      expect(span.bbox.y + span.bbox.h).toBeLessThanOrEqual(1.001);
    }
  }, 45_000);
});
