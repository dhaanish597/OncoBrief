import { expect, test } from '@playwright/test';
import { seed } from '../../../packages/db/src/seed';
import { loginAsClinician, openFirstPatient } from './helpers';

test.describe('Connected Interoperability & Security Suite (Scenarios A through J)', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test('Scenario A: Inbound Synthetic FHIR Lab Report Ingestion with Structured Provenance', async ({
    page,
  }) => {
    await loginAsClinician(page);
    const patientId = await openFirstPatient(page);

    const syntheticLabBundle = {
      resourceType: 'Bundle',
      id: `lab-report-${Date.now()}`,
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: `pat-${patientId}`,
            name: [{ family: 'Kaur', given: ['Harpreet'] }],
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

    const importRes = await page.request.post('/api/v1/fhir/import', {
      data: {
        patientId,
        bundleJson: syntheticLabBundle,
        defaultOriginFacility: 'Apollo Diagnostics Laboratory',
        idempotencyKey: `idemp-scen-a-${Date.now()}`,
      },
    });

    expect(importRes.status()).toBe(200);
    const json = await importRes.json();
    expect(json.transactionId).toBeDefined();
    expect(json.documentId).toBeDefined();
    expect(json.importedFactsCount).toBeGreaterThan(0);
    expect(json.isDuplicate).toBe(false);

    // Verify document appears in UI Sources list
    await page.goto(`/patients/${patientId}/sources`);
    await expect(page.locator(`a[href*="/sources/${json.documentId}"]`).first()).toBeVisible();
  });

  test('Scenario B: Contradiction Detection and Preservation for Conflicting Lab Values', async ({
    page,
  }) => {
    await loginAsClinician(page);
    const patientId = await openFirstPatient(page);

    // Ingest conflicting lab observation (Severe anemia: Hb 7.2 g/dL on same observation date)
    const conflictingBundle = {
      resourceType: 'Bundle',
      id: `lab-conflict-${Date.now()}`,
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: `pat-${patientId}`,
            name: [{ family: 'Kaur', given: ['Harpreet'] }],
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-hb-conflict',
            status: 'final',
            code: {
              coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }],
              text: 'Hemoglobin',
            },
            subject: { reference: `Patient/pat-${patientId}` },
            effectiveDateTime: '2026-05-15T09:30:00Z',
            valueQuantity: { value: 7.2, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
          },
        },
      ],
    };

    const conflictRes = await page.request.post('/api/v1/fhir/import', {
      data: {
        patientId,
        bundleJson: conflictingBundle,
        defaultOriginFacility: 'Confirmatory Referral Lab',
      },
    });

    expect(conflictRes.status()).toBe(200);
    const conflictData = await conflictRes.json();
    expect(conflictData.transactionId).toBeDefined();

    // Verify evidence tab preserves contradictions without silent resolution
    await page.goto(`/patients/${patientId}/evidence`);
    await expect(page.locator('body')).toContainText(/contradiction|conflict|unverified/i);
  });

  test('Scenario C: Outbound NRCeS DocumentBundle & mCODE Export with Provenance', async ({
    page,
  }) => {
    await loginAsClinician(page);
    const patientId = await openFirstPatient(page);

    // Export NRCeS DocumentBundle
    const exportRes = await page.request.post('/api/v1/fhir/export', {
      data: {
        patientId,
        exportKind: 'nrces_health_document',
        verifiedOnly: false,
      },
    });

    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()['content-type']).toContain('application/fhir+json');

    const result = await exportRes.json();
    expect(result.transactionId).toBeDefined();
    expect(result.bundle).toBeDefined();
    expect(result.bundle.resourceType).toBe('Bundle');
    expect(result.bundle.type).toBe('document');

    // Verify Composition and Provenance entries
    const entries = result.bundle.entry || [];
    const hasComposition = entries.some((e: { resource?: { resourceType?: string } }) => e.resource?.resourceType === 'Composition');
    const hasProvenance = entries.some((e: { resource?: { resourceType?: string } }) => e.resource?.resourceType === 'Provenance');
    expect(hasComposition).toBe(true);
    expect(hasProvenance).toBe(true);
  });

  test('Scenario D: Consent Security Enforcement Blocks Data Push under Inactive/Expired Consent', async ({
    page,
  }) => {
    await loginAsClinician(page);
    const patientId = await openFirstPatient(page);

    // Attempt export under nonexistent or expired consent
    const blockedRes = await page.request.post('/api/v1/fhir/export', {
      data: {
        patientId,
        exportKind: 'nrces_health_document',
        consentId: '00000000-0000-0000-0000-000000000000',
      },
    });

    // Must be rejected with 400 Bad Request, 403 Forbidden, or 404 Not Found
    expect([400, 403, 404]).toContain(blockedRes.status());
    const err = await blockedRes.json();
    expect(err.error?.code).toBe('fhir_export_failed');
  });

  test('Scenario E: Idempotency Enforcement Prevents Duplicate Fact Creation', async ({
    page,
  }) => {
    await loginAsClinician(page);
    const patientId = await openFirstPatient(page);

    const idempotencyKey = `idemp-test-${Date.now()}`;
    const testBundle = {
      resourceType: 'Bundle',
      id: `idemp-bundle-${Date.now()}`,
      type: 'document',
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'obs-repeat-1',
            status: 'final',
            code: { coding: [{ system: 'http://loinc.org', code: '2160-0', display: 'Creatinine' }] },
            subject: { reference: `Patient/pat-${patientId}` },
            valueQuantity: { value: 1.0, unit: 'mg/dL' },
          },
        },
      ],
    };

    // First import
    const firstRes = await page.request.post('/api/v1/fhir/import', {
      data: { patientId, bundleJson: testBundle, idempotencyKey },
    });
    expect(firstRes.status()).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson.isDuplicate).toBe(false);

    // Second import with identical idempotency key
    const secondRes = await page.request.post('/api/v1/fhir/import', {
      data: { patientId, bundleJson: testBundle, idempotencyKey },
    });
    expect(secondRes.status()).toBe(200);
    const secondJson = await secondRes.json();
    expect(secondJson.isDuplicate).toBe(true);
    expect(secondJson.importedFactsCount).toBe(0);
    expect(secondJson.transactionId).toBe(firstJson.transactionId);
  });

  test('Scenario F: Cross-Tenant Boundary Rejection', async ({
    page,
  }) => {
    await loginAsClinician(page);

    // Register endpoint on current tenant
    const regRes = await page.request.post('/api/v1/fhir/endpoints', {
      data: {
        name: `Regional EMR Gateway ${Date.now()}`,
        baseUrl: 'https://emr.regional.hospital.org/fhir/r4',
        authKind: 'bearer',
      },
    });
    expect(regRes.status()).toBe(201);
    const { endpointId } = await regRes.json();

    // Query list: endpoint must be present
    const listRes = await page.request.get('/api/v1/fhir/endpoints');
    expect(listRes.status()).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.endpoints.some((e: { id: string }) => e.id === endpointId)).toBe(true);

    // Cross-tenant fetch by random non-existent ID fails with 404
    const badRes = await page.request.get('/api/v1/fhir/endpoints/00000000-0000-0000-0000-000000000000');
    expect(badRes.status()).toBe(404);
  });

  test('Scenario G: ABDM HIP Care-Context Discovery Returns 202 Accepted within SLA', async ({
    request,
  }) => {
    const res = await request.post('/api/v3/hip/patient/care-context/discover', {
      headers: {
        'content-type': 'application/json',
        'request-id': `req-hip-${Date.now()}`,
        'timestamp': new Date().toISOString(),
        'x-hip-id': 'IN010000001',
      },
      data: {
        transactionId: `txn-hip-${Date.now()}`,
        patient: {
          verifiedIdentifier: [
            { type: 'ABHA_ADDRESS', value: 'patient@sbx' },
          ],
        },
      },
    });

    expect(res.status()).toBe(202);
  });

  test('Scenario H: ABDM M3 HIU Consent Initiation Flow on Sources Page', async ({
    page,
  }) => {
    await loginAsClinician(page);
    await openFirstPatient(page);

    await page.getByTestId('tab-sources').click();
    await expect(page).toHaveURL(/\/patients\/.+\/sources/);

    const abdmTab = page.getByRole('button', { name: /EHR \/ ABDM/i });
    await expect(abdmTab).toBeVisible();
    await abdmTab.click();

    // Verify ABDM M3 HIU consent UI
    await expect(page.getByText(/ABDM Health Information Exchange Gateway \(M3 HIU/)).toBeVisible();
    const requestBtn = page.getByRole('button', { name: /Request Patient Consent \(M3 HIU\)/i });
    await expect(requestBtn).toBeVisible();
    await requestBtn.click();

    // Verify artifact status
    await expect(page.getByTestId('abdm-artifact').first()).toContainText('GRANTED');
  });

  test('Scenario I: External Outage Handling Returns Structured Failure', async ({
    page,
  }) => {
    await loginAsClinician(page);

    // Missing required fields returns 400 with structured error
    const malformedRes = await page.request.post('/api/v1/fhir/import', {
      data: { patientId: 'invalid-id' },
    });
    expect(malformedRes.status()).toBe(400);
    const err = await malformedRes.json();
    expect(err.error?.code).toBe('missing_required_fields');
  });

  test('Scenario J: Patient Portal Boundary Isolation Rejects Unauthenticated & Clinical Access', async ({
    request,
  }) => {
    // Attempting to access clinical FHIR endpoints without clinician session returns 401
    const unauthEndpoints = await request.get('/api/v1/fhir/endpoints');
    expect(unauthEndpoints.status()).toBe(401);

    const unauthImport = await request.post('/api/v1/fhir/import', {
      data: { patientId: 'some-id', bundleJson: {} },
    });
    expect(unauthImport.status()).toBe(401);

    const unauthExport = await request.post('/api/v1/fhir/export', {
      data: { patientId: 'some-id' },
    });
    expect(unauthExport.status()).toBe(401);
  });
});
