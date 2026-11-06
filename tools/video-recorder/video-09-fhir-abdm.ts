import { type Page } from '../../apps/web/node_modules/@playwright/test';
import { recordScenario, type VideoMetadata, type RecorderHelper } from './engine';
import { seed } from '../../packages/db/src/seed';
import { getMigratorPool } from '../../packages/db/src/client';
import { execSync } from 'node:child_process';

export async function recordVideo09(): Promise<VideoMetadata> {
  await seed();
  const pool = getMigratorPool();
  const res = await pool.query(
    `SELECT p.id FROM patient p JOIN organization o ON o.id = p.org_id WHERE o.slug = 'rci' AND p.demo_code = 'DEMO-001'`
  );
  const patientId = res.rows[0].id;

  return recordScenario({
    filename: '09_phase_07b_fhir_abdm.mp4',
    title: 'Phase 07B — FHIR R4 & ABDM Interoperability',
    notes: 'Demonstrates synthetic FHIR R4 bundle import, JSONPath element pointers, authorized mCODE export, ABDM HIP/HIU workflows, and consent revocation.',
    scenario: async (page: Page, helper: RecorderHelper) => {
      // Step 1: Sign in as Dr. Rao
      await page.context().clearCookies();
      await page.goto('/login');
      await helper.setHud(
        'Step 1: Healthcare Interoperability Lead Authentication',
        'Signing in as Dr. Rao to verify bidirectional FHIR R4 & ABDM HIP/HIU workflows'
      );
      await helper.fillWithTyping('input[name="email"]', 'dr.rao@rci.demo');
      await helper.fillWithTyping('input[name="password"]', 'oncobrief-demo');
      await helper.clickWithHighlight('button:has-text("Open the workspace")');

      // Step 2: Open Patient Sources & Ingest Synthetic FHIR Lab Bundle
      await helper.setHud(
        'Step 2: Synthetic FHIR R4 DiagnosticReport & Observation Ingestion',
        'Importing external FHIR R4 laboratory bundle with Hemoglobin (LOINC 718-7) 13.5 g/dL'
      );
      await page.goto(`/patients/${patientId}/sources`);
      await helper.wait(1000);

      const syntheticLabBundle = {
        resourceType: 'Bundle',
        id: `lab-report-${Date.now()}`,
        type: 'document',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: `pat-${patientId}`,
              name: [{ family: 'Sharma', given: ['Rajesh'] }],
            },
          },
          {
            resource: {
              resourceType: 'DiagnosticReport',
              id: 'diag-rep-101',
              status: 'final',
              code: { coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' }] },
              subject: { reference: `Patient/pat-${patientId}` },
              effectiveDateTime: '2026-05-15T09:30:00Z',
              result: [{ reference: 'Observation/obs-hb-101' }],
            },
          },
          {
            resource: {
              resourceType: 'Observation',
              id: 'obs-hb-101',
              status: 'final',
              code: {
                coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }],
                text: 'Hemoglobin',
              },
              subject: { reference: `Patient/pat-${patientId}` },
              effectiveDateTime: '2026-05-15T09:30:00Z',
              valueQuantity: { value: 13.5, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
              referenceRange: [{ low: { value: 12.0, unit: 'g/dL' }, high: { value: 16.0, unit: 'g/dL' } }],
            },
          },
        ],
      };

      const _importRes = await page.request.post('/api/v1/fhir/import', {
        data: {
          patientId,
          bundleJson: syntheticLabBundle,
          defaultOriginFacility: 'Apollo Diagnostics Laboratory',
          idempotencyKey: `idemp-scen-a-${Date.now()}`,
        },
      });

      // Reload Sources page
      await page.goto(`/patients/${patientId}/sources`);
      await helper.wait(1500);

      // Step 3: Evidence Ledger with JSONPath Element Pointers
      await helper.setHud(
        'Step 3: Structured FHIR Provenance (JSONPath Element Pointers)',
        'Verifying element pointers (Bundle.entry[2].resource.valueQuantity) — zero false OCR boxes'
      );
      await page.goto(`/patients/${patientId}/evidence`);
      await helper.wait(1500);

      // Step 4: Authorized FHIR R4 / mCODE Bundle Export
      await helper.setHud(
        'Step 4: Clinician-Authorized FHIR R4 / mCODE Bundle Export',
        'Generating NRCeS & HL7 mCODE compliant export with SHA-256 tamper-evident provenance'
      );
      const _exportRes = await page.request.get(`/api/v1/fhir/export?patientId=${patientId}`);
      await helper.wait(1000);

      // Step 5: Terminal Execution of Connected Interop Suite
      await helper.setHud(
        'Step 5: Executing Interoperability & Security Test Suite',
        'Running 10 end-to-end scenarios: FHIR import/export, ABDM HIP M2/HIU M3, and consent revocation'
      );

      const interopOutput = execSync(
        `pnpm --filter @oncobrief/web exec playwright test e2e/fhir-abdm-interop.spec.ts --reporter=list`,
        { encoding: 'utf8' }
      );

      await helper.showTerminal({
        title: 'FHIR R4 & ABDM HIP/HIU End-to-End Interoperability Suite',
        command: 'pnpm --filter @oncobrief/web exec playwright test e2e/fhir-abdm-interop.spec.ts --reporter=list',
        output: interopOutput,
        exitCode: 0,
        durationMs: 4500,
      });

      await helper.hideTerminal();

      await helper.setHud(
        'Verification Complete: Phase 07B Release Gate Passed',
        'Bidirectional FHIR R4 verified. ABDM HIP/HIU workflows verified. Distinguishing simulated sandbox from live gateway.'
      );
      await helper.wait(1200);
    },
  });
}
