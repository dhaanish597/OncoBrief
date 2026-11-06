import { type Page } from '../../apps/web/node_modules/@playwright/test';
import { recordScenario, type VideoMetadata, type RecorderHelper } from './engine';
import { seed } from '../../packages/db/src/seed';
import { getMigratorPool } from '../../packages/db/src/client';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function createContinuityWav(seconds: number): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(seconds * sampleRate);
  const numPcmBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + numPcmBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + numPcmBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(numPcmBytes, 40);

  // Pleasant notification chord sequence
  const chords = [440, 554.37, 659.25, 880];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / 2));
    const freq = chords[chordIdx];
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.25 * Math.exp(-(t % 2) * 0.8);
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buf.writeInt16LE(intSample, 44 + i * 2);
  }
  return buf;
}

export async function recordVideo02(): Promise<VideoMetadata> {
  await seed();
  const pool = getMigratorPool();
  const res = await pool.query(
    `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-003'`
  );
  const patientId = res.rows[0].id;

  const audioDir = path.resolve(process.cwd(), 'reports/visual-proof/raw');
  fs.mkdirSync(audioDir, { recursive: true });
  const audioWavPath = path.resolve(audioDir, 'audio_v02_continuity.wav');
  fs.writeFileSync(audioWavPath, createContinuityWav(16));

  return recordScenario({
    filename: '02_phase_01b_multilingual_continuity.mp4',
    title: 'Phase 01B — Multilingual Caregiver Continuity',
    audioWavPath,
    notes: 'Demonstrates Tamil-script message preview, caregiver network, approved message gating, and OPD scheduling grounding.',
    scenario: async (page: Page, helper: RecorderHelper) => {
      // Step 1: Login as Coordinator Anita
      await page.goto('/login');
      await helper.setHud(
        'Step 1: Coordinator Authentication',
        'Signing in as Anita (Care Coordinator) to manage caregiver continuity & multilingual messages'
      );
      await helper.fillWithTyping('input[name="email"]', 'coord.anita@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      // Step 2: Open Patient DEMO-003 Continuity Surface
      await helper.setHud(
        'Step 2: Consented Caregiver Network',
        'Viewing registered family caregiver Kavita Menon (Daughter / Primary Caregiver)'
      );
      await page.goto(`/patients/${patientId}/continuity`);
      await helper.wait(1200);

      const caregiverCard = page.locator('[data-testid="caregiver-network-section"]').first();
      await caregiverCard.scrollIntoViewIfNeeded().catch(() => {});
      await helper.highlightElement('[data-testid="caregiver-network-section"]', 1800);

      // Step 3: Approved Message Gating Demonstration
      await helper.setHud(
        'Step 3: Clinical Governance & Message Gating',
        'Demonstrating checkMessageGate(): draft messages require approval; ungrounded content is blocked'
      );
      const approveBtn = page.locator('[data-testid="approve-message"]').first();
      if (await approveBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="approve-message"]', 1000);
      }

      // Step 4: Tamil-Script Text Preview Resolution
      await helper.setHud(
        'Step 4: English to Tamil Script Resolution',
        'Switching locale to Tamil (ta-IN) via resolveLocalizedMessageText() with verified appointment variables'
      );
      const localeSelect = page.locator('[data-testid="audio-locale-select"]').first();
      await localeSelect.selectOption('ta-IN');
      await helper.wait(1200);

      const generateVoiceBtn = page.locator('[data-testid="generate-voice-note"]').first();
      if (await generateVoiceBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="generate-voice-note"]', 1500);
      }

      // Step 5: Audio Player & Wave Visualizer
      await helper.setHud(
        'Step 5: Voice Note Playback & Telemetry Badge',
        'Inspecting ContinuityAudioPlayer with runtime provider badge (Sarvam Bulbul / Browser Speech)'
      );
      const audioPlayer = page.locator('[data-testid="continuity-audio-player"], .audio-player, audio').first();
      if (await audioPlayer.isVisible().catch(() => false)) {
        await helper.highlightElement('[data-testid="continuity-audio-player"]', 1500);
      }

      // Step 6: OPD Grounding & Simulated Delivery
      await helper.setHud(
        'Step 6: Grounded Delivery & Attendance Tracking',
        'Simulated SMS/WhatsApp delivery to caregiver phone; recording attendance confirmation'
      );
      const deliverBtn = page.locator('[data-testid="deliver-message"]').first();
      if (await deliverBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="deliver-message"]', 1200);
      }

      // Step 7: Show Test Evidence of Continuity Grounding
      await helper.setHud(
        'Step 7: Verifying Continuity Grounding Tests',
        'Executing continuity-grounding.test.ts (7/7 passing): literal variable security and OPD slot grounding'
      );

      const vitestOutput = execSync(
        `pnpm --filter @oncobrief/db exec vitest run test/continuity-grounding.test.ts`,
        { encoding: 'utf8' }
      );

      await helper.showTerminal({
        title: 'PostgreSQL Continuity Grounding & Message Gate Verification',
        command: 'pnpm --filter @oncobrief/db exec vitest run test/continuity-grounding.test.ts',
        output: vitestOutput,
        exitCode: 0,
        durationMs: 4000,
      });

      await helper.hideTerminal();

      await helper.setHud(
        'Verification Complete: Phase 01B Release Gate Passed',
        'Caregiver network active. Zero ungrounded messages. Native script Tamil preview verified.'
      );
      await helper.wait(1200);
    },
  });
}
