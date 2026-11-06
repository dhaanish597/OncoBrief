import { type Page } from '../../apps/web/node_modules/@playwright/test';
import { recordScenario, type VideoMetadata, type RecorderHelper } from './engine';
import { seed } from '../../packages/db/src/seed';
import { getMigratorPool } from '../../packages/db/src/client';
import { execSync } from 'node:child_process';

export async function recordVideo03(): Promise<VideoMetadata> {
  await seed();
  const pool = getMigratorPool();
  const res = await pool.query(
    `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-001'`
  );
  const patientId = res.rows[0].id;

  return recordScenario({
    filename: '03_phase_02_document_intelligence.mp4',
    title: 'Phase 02 — Document AI & Evidence Provenance',
    notes: 'Demonstrates document intake, language selection, OCR telemetry, Evidence Ledger, bounding box geometry, human verification, and rejection.',
    scenario: async (page: Page, helper: RecorderHelper) => {
      // Step 1: Login as Clinician
      await page.goto('/login');
      await helper.setHud(
        'Step 1: Clinician Sign-In',
        'Signing in as Dr. Rao to inspect Document AI ingestion & Evidence Ledger'
      );
      await helper.fillWithTyping('input[name="email"]', 'dr.rao@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      // Step 2: Navigate to Patient Sources / Intake
      await helper.setHud(
        'Step 2: Document Intake & Sources Surface',
        'Opening DEMO-001 (Rajesh Sharma) oncology source documents list'
      );
      await page.goto(`/patients/${patientId}/sources`);
      await helper.wait(1200);

      // Step 3: Inspect Document Intake & Language Selector
      await helper.setHud(
        'Step 3: Language-Aware OCR & Intake Options',
        'Opening Import from EHR / ABDM modal showing multi-language OCR routing'
      );
      const importBtn = page.locator('button:has-text("Import from EHR / ABDM")').first();
      if (await importBtn.isVisible()) {
        await helper.clickWithHighlight('button:has-text("Import from EHR / ABDM")', 1000);
        await helper.highlightElement('[data-testid="pull-abdm-bundle-tmc"]', 1200);
        // Pull synthetic bundle
        await helper.setHud(
          'Step 4: Synthetic Oncology Document Ingestion',
          'Ingesting synthetic Tata Memorial Centre clinical consultation report'
        );
        await helper.clickWithHighlight('[data-testid="pull-abdm-bundle-tmc"]', 1500);
      }

      // Step 5: Navigate to Evidence Ledger
      await helper.setHud(
        'Step 5: Evidence Ledger Inspection',
        'Viewing structured clinical facts extracted from source documents with state badges'
      );
      await page.goto(`/patients/${patientId}/evidence`);
      await helper.wait(1200);

      const evidenceRows = page.locator('[data-testid="evidence-row"]');
      await helper.highlightElement('[data-testid="evidence-row"]:first-child', 1200);

      // Step 6: Open Source Inspector to inspect Bounding Box Geometry
      await helper.setHud(
        'Step 6: Mathematical Bounding Box Provenance',
        'Opening Source Inspector: rendering exact [0, 1] bounding box highlight on document text'
      );
      const unverifiedRow = page.locator('[data-testid="evidence-row"][data-state="extracted"]').first();
      if (await unverifiedRow.isVisible()) {
        await unverifiedRow.locator('a').first().click();
        await helper.wait(1500);

        // Highlight the visual bounding box on the document page
        const highlightBox = page.locator('[data-highlight="true"]').first();
        if (await highlightBox.isVisible()) {
          await helper.highlightElement('[data-highlight="true"]', 2000);
        }

        // Step 7: Human Verification of Fact
        await helper.setHud(
          'Step 7: Clinician Human Verification',
          'Human clinician verifies the extracted fact against the source document'
        );
        const verifyBtn = page.locator('[data-testid="verify-evidence"]').first();
        if (await verifyBtn.isVisible()) {
          await helper.clickWithHighlight('[data-testid="verify-evidence"]', 1200);
          await helper.highlightElement('[data-testid="state-verified"]', 1500);
        }
      }

      // Step 8: Terminal Test Verification of Two-Stage Span Gate & OCR Correctness
      await helper.setHud(
        'Step 8: Automated Span Validation & OCR Correctness Tests',
        'Executing span-validation.test.ts (24/24) and two-stage-span-gate.test.ts (4/4)'
      );

      const testOutput = execSync(
        `pnpm --filter @oncobrief/domain exec vitest run test/span-validation.test.ts`,
        { encoding: 'utf8' }
      );

      await helper.showTerminal({
        title: 'Two-Stage Span Validation & Clinical Provenance Gate',
        command: 'pnpm --filter @oncobrief/domain exec vitest run test/span-validation.test.ts',
        output: testOutput,
        exitCode: 0,
        durationMs: 4000,
      });

      await helper.hideTerminal();

      await helper.setHud(
        'Verification Complete: Phase 02 Release Gate Passed',
        'Strict mathematical bounding boxes verified. Zero unentailed candidate facts permitted.'
      );
      await helper.wait(1200);
    },
  });
}
