import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, withTenant } from '../src/client';
import {
  deactivateFhirEndpoint,
  exportPatientFhirBundle,
  getFhirEndpoint,
  getLinkedFhirResources,
  importExternalFhirBundle,
  listFhirEndpoints,
  recordExchangeTransaction,
  registerFhirEndpoint,
} from '../src/services/fhir-exchange';
import { appClientNoTenant, setupFixtures, withSuperuser, type Fixtures } from './helpers';
import { LocalFsStorageAdapter } from '../../adapters/src/local-fs-storage';
import { LocalMultimodalOcrAdapter } from '../../adapters/src/local-multimodal-ocr';
import { RuleBasedExtractor } from '../../adapters/src/rule-based-extractor';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('FHIR Interoperability & Security Suite (0023_fhir_interoperability)', () => {
  let f: Fixtures;
  let tempDir: string;
  let storage: LocalFsStorageAdapter;
  let ocr: LocalMultimodalOcrAdapter;
  let extractor: RuleBasedExtractor;

  beforeAll(async () => {
    f = await setupFixtures();
    tempDir = mkdtempSync(join(tmpdir(), 'oncobrief-fhir-test-'));
    storage = new LocalFsStorageAdapter(tempDir, 'test-secret-at-least-32-chars-long!');
    ocr = new LocalMultimodalOcrAdapter();
    extractor = new RuleBasedExtractor();

    // Ensure RLS tenant isolation policies match 0023 definition
    await withSuperuser(async (client) => {
      const fhirTables = ['fhir_endpoint_registry', 'fhir_resource_link', 'fhir_exchange_transaction'];
      for (const t of fhirTables) {
        await client.query(`DROP POLICY IF EXISTS tenant_isolation ON ${t}`);
        await client.query(
          `CREATE POLICY tenant_isolation ON ${t} ` +
          `USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid) ` +
          `WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)`
        );
      }
    });
  });

  afterAll(async () => {
    await closePools();
  });

  describe('1. PostgreSQL RLS Enforcement (0023)', () => {
    const fhirTables = ['fhir_endpoint_registry', 'fhir_resource_link', 'fhir_exchange_transaction'];

    it('enforces relrowsecurity = true and relforcerowsecurity = true on all FHIR tables', async () => {
      await withSuperuser(async (client) => {
        const res = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
          [fhirTables]
        );
        expect(res.rows.length).toBe(3);
        for (const row of res.rows) {
          expect(row.relrowsecurity).toBe(true);
          expect(row.relforcerowsecurity).toBe(true);
        }
      });
    });

    it('fails closed with 0 rows when app.org_id is unset or empty string', async () => {
      const anon = await appClientNoTenant();
      try {
        for (const tbl of fhirTables) {
          const res = await anon.query(`SELECT * FROM ${tbl}`);
          expect(res.rows).toHaveLength(0);
        }
      } finally {
        await anon.end();
      }
    });
  });

  describe('2. Endpoint Registry & Tenant Isolation', () => {
    it('registers an external FHIR endpoint and enforces tenant isolation', async () => {
      let endpointId = '';

      await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
        const res = await registerFhirEndpoint(q, {
          orgId: f.org1,
          name: 'Apollo Hospital HIS',
          baseUrl: 'https://his.apollo.in/fhir/r4',
          authKind: 'bearer',
          allowedOperations: ['read', 'search', 'import'],
          userId: f.clinicians.clinician,
        });
        endpointId = res.endpointId;
        expect(endpointId).toBeDefined();

        const fetched = await getFhirEndpoint(q, f.org1, endpointId);
        expect(fetched).not.toBeNull();
        if (!fetched) throw new Error('Registered endpoint missing');
        expect(fetched.name).toBe('Apollo Hospital HIS');
        expect(fetched.is_active).toBe(true);

        const list = await listFhirEndpoints(q, f.org1);
        expect(list.some((e) => e.id === endpointId)).toBe(true);
      });

      // Cross-tenant read must return null / empty
      await withTenant({ orgId: f.org2, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
        const fetched = await getFhirEndpoint(q, f.org2, endpointId);
        expect(fetched).toBeNull();

        const list = await listFhirEndpoints(q, f.org2);
        expect(list.some((e) => e.id === endpointId)).toBe(false);
      });

      // Deactivation
      await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
        await deactivateFhirEndpoint(q, f.org1, endpointId, f.clinicians.clinician);
        const list = await listFhirEndpoints(q, f.org1, { includeInactive: false });
        expect(list.some((e) => e.id === endpointId)).toBe(false);

        const listWithInactive = await listFhirEndpoints(q, f.org1, { includeInactive: true });
        expect(listWithInactive.some((e) => e.id === endpointId && !e.is_active)).toBe(true);
      });
    });
  });

  describe('3. Exchange Transactions & Idempotency', () => {
    it('records an exchange transaction and prevents duplicates with idempotencyKey', async () => {
      const idempotencyKey = `tx-key-${Date.now()}`;
      await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
        const first = await recordExchangeTransaction(q, {
          orgId: f.org1,
          patientId: f.patients.demo3,
          direction: 'INBOUND_IMPORT',
          payloadSha256: 'deadbeef1234',
          status: 'COMPLETED',
          idempotencyKey,
          userId: f.clinicians.clinician,
        });
        expect(first.isDuplicate).toBe(false);

        const second = await recordExchangeTransaction(q, {
          orgId: f.org1,
          patientId: f.patients.demo3,
          direction: 'INBOUND_IMPORT',
          payloadSha256: 'deadbeef1234',
          status: 'COMPLETED',
          idempotencyKey,
          userId: f.clinicians.clinician,
        });
        expect(second.isDuplicate).toBe(true);
        expect(second.transactionId).toBe(first.transactionId);
      });
    });
  });

  describe('4. Bidirectional FHIR Ingestion & Export', () => {
    it('imports an external FHIR lab report bundle and links resources', async () => {
      const syntheticBundle = {
        resourceType: 'Bundle',
        id: `bundle-lab-${Date.now()}`,
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'pat-ext-1',
              identifier: [{ system: 'https://healthid.ndhm.gov.in', value: 'ABHA-9999' }],
              name: [{ family: 'Kaur', given: ['Harpreet'] }],
            },
          },
          {
            resource: {
              resourceType: 'DiagnosticReport',
              id: 'rep-ext-1',
              status: 'final',
              code: { coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' }] },
              subject: { reference: 'Patient/pat-ext-1' },
              effectiveDateTime: '2026-05-10T10:00:00Z',
              result: [{ reference: 'Observation/obs-ext-1' }],
            },
          },
          {
            resource: {
              resourceType: 'Observation',
              id: 'obs-ext-1',
              status: 'final',
              code: {
                coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }],
                text: 'Hemoglobin',
              },
              subject: { reference: 'Patient/pat-ext-1' },
              effectiveDateTime: '2026-05-10T10:00:00Z',
              valueQuantity: { value: 12.8, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
              referenceRange: [{ low: { value: 12.0, unit: 'g/dL' }, high: { value: 16.0, unit: 'g/dL' } }],
            },
          },
        ],
      };

      await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
        const importRes = await importExternalFhirBundle(
          q,
          { storage, ocr, extractor },
          {
            orgId: f.org1,
            patientId: f.patients.demo3,
            bundleJson: syntheticBundle,
            userId: f.clinicians.clinician,
            role: 'clinician',
            defaultOriginFacility: 'Max Healthcare Lab',
          }
        );

        expect(importRes.transactionId).toBeDefined();
        expect(importRes.documentId).toBeDefined();
        expect(importRes.importedFactsCount).toBeGreaterThan(0);

        // Verify linked FHIR identities
        const links = await getLinkedFhirResources(q, f.org1, f.patients.demo3);
        expect(links.length).toBeGreaterThan(0);
        expect(links.some((l) => l.resource_type === 'Observation' && l.external_resource_id === 'obs-ext-1')).toBe(true);
      });
    });

    it('exports a compliant NRCeS DocumentBundle with Provenance for a patient', async () => {
      await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
        const exportRes = await exportPatientFhirBundle(q, {
          orgId: f.org1,
          patientId: f.patients.demo3,
          exportKind: 'nrces_health_document',
          userId: f.clinicians.clinician,
          role: 'clinician',
        });

        expect(exportRes.transactionId).toBeDefined();
        expect(exportRes.sha256).toBeDefined();
        expect(exportRes.bundle.resourceType).toBe('Bundle');
        expect(exportRes.bundle.type).toBe('document');

        // Check entries
        const entries = Array.isArray(exportRes.bundle.entry) ? exportRes.bundle.entry : [];
        expect(entries.some((e: { resource?: { resourceType?: string } }) => e.resource?.resourceType === 'Composition')).toBe(true);
        expect(entries.some((e: { resource?: { resourceType?: string } }) => e.resource?.resourceType === 'Patient')).toBe(true);
        expect(entries.some((e: { resource?: { resourceType?: string } }) => e.resource?.resourceType === 'Provenance')).toBe(true);
      });
    });
  });
});
