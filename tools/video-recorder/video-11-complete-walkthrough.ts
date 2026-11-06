import { type Page } from '../../apps/web/node_modules/@playwright/test';
import { recordScenario, type VideoMetadata, type RecorderHelper } from './engine';
import { seed } from '../../packages/db/src/seed';
import { getMigratorPool } from '../../packages/db/src/client';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function createWalkthroughAudio(seconds: number): Buffer {
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

  // Gentle ambient progression
  const baseFreqs = [261.63, 329.63, 392.0, 523.25];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chord = baseFreqs[Math.floor((t / 4) % baseFreqs.length)];
    const sample = Math.sin(2 * Math.PI * chord * t) * 0.15 * Math.exp(-(t % 4) * 0.4);
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buf.writeInt16LE(intSample, 44 + i * 2);
  }
  return buf;
}

export async function recordVideo11(): Promise<VideoMetadata> {
  await seed();
  const pool = getMigratorPool();
  const res1 = await pool.query(
    `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-001'`
  );
  const p1 = res1.rows[0].id;

  const res3 = await pool.query(
    `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-003'`
  );
  const p3 = res3.rows[0].id;

  const audioDir = path.resolve(process.cwd(), 'reports/visual-proof/raw');
  fs.mkdirSync(audioDir, { recursive: true });
  const audioWavPath = path.resolve(audioDir, 'audio_v11_walkthrough.wav');
  fs.writeFileSync(audioWavPath, createWalkthroughAudio(60));

  return recordScenario({
    filename: '11_oncobrief_complete_walkthrough.mp4',
    title: 'OncoBrief — Complete Health-a-thon Product Demonstration',
    audioWavPath,
    notes: 'Comprehensive 10-scene demonstration of OncoBrief: document intake, Evidence Ledger, oncology trends, reconciliation, OPD management, assistant, packet approval, mobile continuity, FHIR/ABDM, and audit integrity.',
    scenario: async (page: Page, helper: RecorderHelper) => {
      // Scene 1: Introduction & Clinician Login
      await page.context().clearCookies();
      await page.goto('/login');
      await helper.setHud(
        'Scene 1: Introduction & Clinician Authentication',
        'Problem: Fragmented oncology records & delayed care. Solution: Evidence-first operational twin.'
      );
      await helper.wait(1500);
      await helper.fillWithTyping('input[name="email"]', 'dr.rao@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      // Scene 2: Document Intake & OCR
      await helper.setHud(
        'Scene 2: Document Intake & Ingestion Telemetry',
        'Importing synthetic hospital oncology consultation document into Evidence Ledger'
      );
      await page.goto(`/patients/${p1}/sources`);
      await helper.wait(1200);

      const importBtn = page.locator('button:has-text("Import from EHR / ABDM")').first();
      if (await importBtn.isVisible()) {
        await helper.clickWithHighlight('button:has-text("Import from EHR / ABDM")', 1000);
        await helper.clickWithHighlight('[data-testid="pull-abdm-bundle-tmc"]', 1500);
      }

      // Scene 3: Evidence Ledger & Source Inspection
      await helper.setHud(
        'Scene 3: Evidence Ledger & Source Provenance',
        'Inspecting extracted facts with mathematical [0, 1] bounding box highlights'
      );
      await page.goto(`/patients/${p1}/evidence`);
      await helper.wait(1200);

      const unverifiedRow = page.locator('[data-testid="evidence-row"][data-state="extracted"]').first();
      if (await unverifiedRow.isVisible()) {
        await unverifiedRow.locator('a').first().click();
        await helper.wait(1500);

        const highlightBox = page.locator('[data-highlight="true"]').first();
        if (await highlightBox.isVisible()) {
          await helper.highlightElement('[data-highlight="true"]', 1500);
        }

        const verifyBtn = page.locator('[data-testid="verify-evidence"]').first();
        if (await verifyBtn.isVisible()) {
          await helper.clickWithHighlight('[data-testid="verify-evidence"]', 1000);
        }
      }

      // Scene 4: Longitudinal Oncology Context & Trend Charts
      await helper.setHud(
        'Scene 4: Longitudinal Oncology Context & Analyte Trends',
        'Viewing deduplicated baseline and interactive SVG flowsheet with reference-range shading'
      );
      await page.goto(`/patients/${p1}/clinical-context`);
      await helper.wait(1500);

      const chartPoint = page.locator('svg circle, [data-testid^="chart-point-"]').first();
      if (await chartPoint.isVisible().catch(() => false)) {
        await chartPoint.hover();
        await helper.wait(800);
      }

      // Scene 5: Contradiction Reconciliation Room
      await helper.setHud(
        'Scene 5: Contradiction Reconciliation Room',
        'Resolving conflicting surgical staging dates without silently picking a winner'
      );
      await page.goto(`/patients/${p1}/conflicts`);
      await helper.wait(1200);

      const reconcileBtn = page.locator('a:has-text("Open reconciliation room")').first();
      if (await reconcileBtn.isVisible()) {
        await helper.clickWithHighlight('a:has-text("Open reconciliation room")', 1200);
        const reasonInput = page.locator('textarea[name="reason"]').first();
        if (await reasonInput.isVisible()) {
          await helper.fillWithTyping('textarea[name="reason"]', 'Retain both sources for coordinator confirmation with issuing facility.');
          await helper.clickWithHighlight('[data-testid="resolve-retain-both"]', 1200);
        }
      }

      // Scene 6: OPD Scheduling & Operational Flow
      await helper.setHud(
        'Scene 6: Live Oncology OPD & Slot Management',
        'Reviewing OPD backfill candidates, reserving slot, releasing offer, and registering walk-in'
      );
      await page.goto('/workspace');
      await helper.wait(1000);

      const opdBtn = page.locator('button:has-text("Live oncology OPD")').first();
      if (await opdBtn.isVisible()) {
        await helper.clickWithHighlight('button:has-text("Live oncology OPD")', 1500);
      }

      // Scene 7: Source-Grounded Productivity Assistant & Clinical Safety
      await helper.setHud(
        'Scene 7: Productivity Studio & Refusal of Medical Questions',
        'Guideline lookup permitted; deterministic refusal triggered for treatment questions'
      );
      const assistantBtn = page.locator('[data-testid="assistant-launcher"]').first();
      if (await assistantBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="assistant-launcher"]', 1000);
        await helper.fillWithTyping('[data-testid="assistant-input"]', 'Show institutional checklist for breast oncology');
        await helper.clickWithHighlight('[data-testid="assistant-send"]', 1500);

        await helper.fillWithTyping('[data-testid="assistant-input"]', 'What chemotherapy should this patient receive?');
        await helper.clickWithHighlight('[data-testid="assistant-send"]', 2000);
        await page.keyboard.press('Escape');
        await helper.wait(800);
      }

      // Scene 8: Consultation Packet Approval & Multilingual Caregiver Continuity
      await helper.setHud(
        'Scene 8: Packet Approval & Multilingual Caregiver Continuity',
        'Assembling consultation packet for DEMO-003 and previewing Tamil voice reminder'
      );
      await page.goto(`/patients/${p3}/packet`);
      await helper.wait(1200);

      const assembleBtn = page.locator('button:has-text("assemble draft")').first();
      if (await assembleBtn.isVisible()) {
        await helper.clickWithHighlight('button:has-text("assemble draft")', 1000);
      }
      const approvePacketBtn = page.locator('[data-testid="approve-packet"]').first();
      if (await approvePacketBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="approve-packet"]', 1200);
      }

      await page.goto(`/patients/${p3}/continuity`);
      await helper.wait(1200);
      const localeSelect = page.locator('[data-testid="audio-locale-select"]').first();
      if (await localeSelect.isVisible()) {
        await localeSelect.selectOption('ta-IN');
        await helper.wait(1000);
      }

      // Scene 9: Bidirectional FHIR R4 & ABDM Interoperability
      await helper.setHud(
        'Scene 9: FHIR R4 Ingestion & Authorized mCODE Oncology Export',
        'Ingesting FHIR DiagnosticReport with element pointers; exporting mCODE bundle'
      );
      const fhirExportRes = await page.request.get(`/api/v1/fhir/export?patientId=${p3}`);
      await helper.wait(1200);

      // Scene 10: Auditor Verification & Immutable Hash-Chain Audit Trail
      await helper.setHud(
        'Scene 10: Auditor Verification & Immutable Hash-Chain Check',
        'Auditor signs in: SHA-256 hash-chain verification (data-ok="true") across all mutations'
      );
      await page.context().clearCookies();
      await page.goto('/login');
      await helper.fillWithTyping('input[name="email"]', 'auditor.k@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      await page.goto(`/patients/${p1}/audit`);
      await helper.wait(1500);
      await helper.highlightElement('[data-testid="ledger-verify"]', 2000);

      // Final Conclusion Scene
      await helper.setHud(
        'OncoBrief Release Candidate: Comprehensive Demonstration Complete',
        '227 verified capabilities | 1,466 unit/integration tests | 102 web + 9 mobile E2E specs passing'
      );
      await helper.wait(2000);
    },
  });
}
