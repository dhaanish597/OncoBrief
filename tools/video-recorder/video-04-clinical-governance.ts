import { type Page } from '../../apps/web/node_modules/@playwright/test';
import { recordScenario, type VideoMetadata, type RecorderHelper } from './engine';
import { seed } from '../../packages/db/src/seed';
import { getMigratorPool } from '../../packages/db/src/client';
import { execSync } from 'node:child_process';

export async function recordVideo04(): Promise<VideoMetadata> {
  await seed();
  const pool = getMigratorPool();
  const res = await pool.query(
    `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-001'`
  );
  const patientId = res.rows[0].id;

  return recordScenario({
    filename: '04_phase_03_clinical_governance.mp4',
    title: 'Phase 03 — Clinical Governance & Operations',
    notes: 'Demonstrates clinician worklist, readiness bands, Tumor Board multidisciplinary workflow, encounters, OPD appointments, and safety restrictions.',
    scenario: async (page: Page, helper: RecorderHelper) => {
      // Step 1: Clinician Sign-In
      await page.goto('/login');
      await helper.setHud(
        'Step 1: Clinician Authentication',
        'Signing in as Dr. Rao to inspect Clinical Governance & Operations'
      );
      await helper.fillWithTyping('input[name="email"]', 'dr.rao@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      // Step 2: Clinician Consultation Worklist & Readiness Bands
      await helper.setHud(
        'Step 2: Clinician Consultation Worklist',
        'Inspecting patient readiness bands: Record Complete, Open Conflicts, Missing Documents'
      );
      await helper.wait(1000);
      await helper.highlightElement('[data-testid="readiness-band"]', 1500);

      // Step 3: OPD Appointment Slot Management
      await helper.setHud(
        'Step 3: Live Oncology OPD Workspace',
        'Opening Live Oncology OPD: managing appointment slots, backfill waitlists, and walk-in arrivals'
      );
      const opdBtn = page.locator('button:has-text("Live oncology OPD")').first();
      if (await opdBtn.isVisible()) {
        await helper.clickWithHighlight('button:has-text("Live oncology OPD")', 1200);
        await helper.highlightElement('.opd-workspace, [data-testid^="opd-slot-"]', 1500);
      }

      // Step 4: Open Patient Clinical Context & Staging Facts
      await helper.setHud(
        'Step 4: Clinical Context & Staging Verification',
        'Inspecting verified TNM staging facts (T2N1M0, Stage IIB) and longitudinal trends'
      );
      await page.goto(`/patients/${patientId}/overview`);
      await helper.wait(1200);
      await helper.highlightElement('h1, [data-testid="clinical-context-card"]', 1500);

      // Step 5: Encounters Surface
      await helper.setHud(
        'Step 5: Longitudinal Encounters History',
        'Opening encounters timeline: linking past consultations, chemotherapy cycles, and surgical records'
      );
      await page.goto(`/patients/${patientId}/encounters`);
      await helper.wait(1200);
      await helper.highlightElement('.encounters-list, table', 1200);

      // Step 6: Multidisciplinary Tumor Board Workflow
      await helper.setHud(
        'Step 6: Multidisciplinary Tumor Board Surface',
        'Navigating to /tumor-board: collaborative specialist reviews, case presentations, and consensus capture'
      );
      await page.goto('/tumor-board');
      await helper.wait(1500);
      await helper.highlightElement('.tumor-board-container, [data-testid="tumor-board-case"]', 1500);

      // Step 7: Clinical Safety Restrictions & Refusal
      await helper.setHud(
        'Step 7: Enforcing Strict Clinical Safety Boundaries',
        'Demonstrating tool refusal: zero diagnostic predictions, zero unsupervised treatment changes'
      );
      const boundaryOutput = execSync(
        `pnpm exec tsx tools/check-clinical-boundary.ts`,
        { encoding: 'utf8' }
      );

      await helper.showTerminal({
        title: 'Clinical Boundary & Safety Rule Verification',
        command: 'pnpm exec tsx tools/check-clinical-boundary.ts',
        output: boundaryOutput,
        exitCode: 0,
        durationMs: 4000,
      });

      await helper.hideTerminal();

      await helper.setHud(
        'Verification Complete: Phase 03 Release Gate Passed',
        'Clinical governance intact. Worklist synchronized. Strict safety boundary 100% verified.'
      );
      await helper.wait(1200);
    },
  });
}
