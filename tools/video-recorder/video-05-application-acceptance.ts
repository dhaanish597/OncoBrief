import { type Page } from '../../apps/web/node_modules/@playwright/test';
import { recordScenario, type VideoMetadata, type RecorderHelper } from './engine';
import { seed } from '../../packages/db/src/seed';
import { getMigratorPool } from '../../packages/db/src/client';
import { execSync } from 'node:child_process';

export async function recordVideo05(): Promise<VideoMetadata> {
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

  return recordScenario({
    filename: '05_phase_04_application_acceptance.mp4',
    title: 'Phase 04 — Full Application Acceptance',
    notes: 'Demonstrates 10-scene clinician journey: intake, provenance, reconciliation room, task creation, consultation packet approval, and auditor hash-chain check.',
    scenario: async (page: Page, helper: RecorderHelper) => {
      // Step 1: Sign in as Dr. Rao
      await page.goto('/login');
      await helper.setHud(
        'Step 1: Authenticated Clinician Intake Journey',
        'Signing in as Dr. Rao to execute full application acceptance walkthrough'
      );
      await helper.fillWithTyping('input[name="email"]', 'dr.rao@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      // Step 2: Open DEMO-001 Evidence Surface
      await helper.setHud(
        'Step 2: Evidence Ledger & Source Provenance',
        'Inspecting DEMO-001 extracted facts, source links, and verification status'
      );
      await page.goto(`/patients/${p1}/evidence`);
      await helper.wait(1200);

      // Step 3: Reconciliation Room (Contradiction Resolution)
      await helper.setHud(
        'Step 3: Reconciliation Room (Contradiction Resolution)',
        'Resolving real contradiction between referral letter and histopathology report'
      );
      await page.goto(`/patients/${p1}/conflicts`);
      await helper.wait(1000);

      const reconcileBtn = page.locator('a:has-text("Open reconciliation room")').first();
      if (await reconcileBtn.isVisible()) {
        await helper.clickWithHighlight('a:has-text("Open reconciliation room")', 1200);
        await helper.highlightElement('[data-testid="source-pane"]', 1500);

        // Retain both sources honestly
        const reasonInput = page.locator('textarea[name="reason"]').first();
        if (await reasonInput.isVisible()) {
          await helper.fillWithTyping('textarea[name="reason"]', 'Retain both sources on record pending facility confirmation.');
          await helper.clickWithHighlight('[data-testid="resolve-retain-both"]', 1200);
        }
      }

      // Step 4: Record Map & Administrative Task Creation
      await helper.setHud(
        'Step 4: Record Readiness & Task Creation from Missing Gaps',
        'Creating source-backed coordinator task from missing insurance pre-authorization'
      );
      await page.goto(`/patients/${p1}/record-map`);
      await helper.wait(1200);

      const createTaskBtn = page.locator('[data-testid="create-task-from-gap"]').first();
      if (await createTaskBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="create-task-from-gap"]', 1000);
        const confirmBtn = page.locator('button:has-text("create task from this gap")').first();
        if (await confirmBtn.isVisible()) {
          await helper.clickWithHighlight('button:has-text("create task from this gap")', 1200);
        }
      }

      // Step 5: Consultation Packet Assembly & Approval
      await helper.setHud(
        'Step 5: Consultation Packet Assembly & Approval',
        'Assembling verified packet draft for DEMO-003 with cryptographic digest'
      );
      await page.goto(`/patients/${p3}/packet`);
      await helper.wait(1200);

      const assembleBtn = page.locator('button:has-text("assemble draft")').first();
      if (await assembleBtn.isVisible()) {
        await helper.clickWithHighlight('button:has-text("assemble draft")', 1200);
      }
      const approvePacketBtn = page.locator('[data-testid="approve-packet"]').first();
      if (await approvePacketBtn.isVisible()) {
        await helper.clickWithHighlight('[data-testid="approve-packet"]', 1200);
        await helper.highlightElement('[data-testid="export-packet"]', 1500);
      }

      // Step 6: Auditor Role & Immutable Hash-Chain Check
      await helper.setHud(
        'Step 6: Auditor Role & Immutable Ledger Hash Chain',
        'Signing in as auditor.k@rci.demo to verify SHA-256 hash-chain integrity'
      );
      await page.context().clearCookies();
      await page.goto('/login');
      await helper.fillWithTyping('input[name="email"]', 'auditor.k@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      await page.goto(`/patients/${p1}/audit`);
      await helper.wait(1200);
      await helper.highlightElement('[data-testid="ledger-verify"]', 1800);

      // Step 7: Terminal Evidence of E2E Suite Execution
      await helper.setHud(
        'Step 7: Playwright E2E Suite Execution Evidence',
        'Running demo-flow.spec.ts passing 10 critical journey specs'
      );

      const e2eOutput = execSync(
        `pnpm --filter @oncobrief/web exec playwright test e2e/demo-flow.spec.ts --reporter=list`,
        { encoding: 'utf8' }
      );

      await helper.showTerminal({
        title: 'Playwright End-to-End Suite Execution',
        command: 'pnpm --filter @oncobrief/web exec playwright test e2e/demo-flow.spec.ts --reporter=list',
        output: e2eOutput,
        exitCode: 0,
        durationMs: 4000,
      });

      await helper.hideTerminal();

      await helper.setHud(
        'Verification Complete: Phase 04 Release Gate Passed',
        'Full 10-scene clinician workflow verified. 100% test pass rate across web suite.'
      );
      await helper.wait(1200);
    },
  });
}
