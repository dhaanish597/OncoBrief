import { describe, expect, it } from 'vitest';
import {
  importFromFhirR4,
  exportToFhirR4Bundle,
  createTataMemorialDiagnosticBundle,
  createAiimsMCodeBundle,
  type ExportableFact,
} from '../src';

describe('TASK-07B.01: Bidirectional FHIR R4 Domain Mapping', () => {
  const patientId = 'DEMO-001';

  describe('FHIR -> OncoBrief (Import Pipeline)', () => {
    it('imports a standard NRCeS ABDM diagnostic bundle into unverified candidate facts', () => {
      const bundle = createTataMemorialDiagnosticBundle(patientId);
      const result = importFromFhirR4(bundle, {
        targetPatientId: patientId,
        sourceSystemUrl: 'https://tmc.gov.in/actrec/fhir',
      });

      expect(result.valid).toBe(true);
      expect(result.bundleType).toBe('document');
      expect(result.resourcesProcessed).toBeGreaterThanOrEqual(4);
      expect(result.facts.length).toBeGreaterThanOrEqual(3);

      // Verify lab observation fact
      const hbFact = result.facts.find((f) => f.verbatimQuote.includes('Hemoglobin'));
      expect(hbFact).toBeDefined();
      expect(hbFact?.factType).toBe('lab_result.as_written');
      expect(hbFact?.observedOn).toBe('2025-06-15');
      expect(hbFact?.state).toBe('extracted'); // Never silently verified!
      expect(hbFact?.provenance.elementPath).toContain('valueQuantity');
      expect(hbFact?.provenance.rawResourceSha256).toBeDefined();

      // Verify pathology report fact
      const dxFact = result.facts.find((f) => f.factType === 'diagnosis_text.as_written');
      expect(dxFact).toBeDefined();
      expect(dxFact?.verbatimQuote).toContain('Invasive ductal carcinoma');
      expect(dxFact?.provenance.elementPath).toContain('conclusion');
    });

    it('imports an HL7 mCODE oncology bundle preserving procedure and medication facts', () => {
      const bundle = createAiimsMCodeBundle(patientId);
      const result = importFromFhirR4(bundle, {
        targetPatientId: patientId,
        sourceSystemUrl: 'https://aiims.edu/fhir',
      });

      expect(result.valid).toBe(true);
      expect(result.facts.length).toBeGreaterThanOrEqual(3);

      const surgFact = result.facts.find((f) => f.factType === 'procedure.recorded');
      expect(surgFact).toBeDefined();
      expect(surgFact?.verbatimQuote).toContain('Modified radical mastectomy');
      expect(surgFact?.observedOn).toBe('2025-06-18');

      const chemoFact = result.facts.find((f) => f.factType === 'medication.recorded');
      expect(chemoFact).toBeDefined();
      expect(chemoFact?.verbatimQuote).toContain('Paclitaxel');
    });

    it('enforces patient linkage and rejects resources belonging to another patient', () => {
      const bundle = createTataMemorialDiagnosticBundle('OTHER-PATIENT-999');
      const result = importFromFhirR4(bundle, {
        targetPatientId: patientId,
        strictPatientMatching: true,
      });

      expect(result.valid).toBe(true);
      // All patient-scoped entries should be rejected due to mismatch
      expect(result.facts.length).toBe(0);
      expect(result.diagnostics.some((d) => d.startsWith('patient_mismatch'))).toBe(true);
    });

    it('handles single isolated FHIR resources without requiring a bundle', () => {
      const singleObs = {
        resourceType: 'Observation',
        id: 'obs-standalone-1',
        status: 'final',
        code: { text: 'CA 15-3' },
        subject: { reference: `Patient/${patientId}` },
        effectiveDateTime: '2025-07-01',
        valueQuantity: {
          value: 28.5,
          unit: 'U/mL',
        },
      };

      const result = importFromFhirR4(singleObs, { targetPatientId: patientId });
      expect(result.valid).toBe(true);
      expect(result.facts.length).toBe(1);
      expect(result.facts[0]?.factType).toBe('lab_result.as_written');
      expect(result.facts[0]?.verbatimQuote).toBe('CA 15-3: 28.5 U/mL');
      expect(result.facts[0]?.provenance.elementPath).toBe('Observation.valueQuantity');
    });

    it('gracefully rejects malformed or non-FHIR payloads', () => {
      expect(importFromFhirR4(null, { targetPatientId: patientId }).valid).toBe(false);
      expect(importFromFhirR4({ foo: 'bar' }, { targetPatientId: patientId }).valid).toBe(false);
      expect(importFromFhirR4({ resourceType: 'Bundle', entry: [] }, { targetPatientId: patientId }).valid).toBe(false);
    });
  });

  describe('OncoBrief -> FHIR (Export Pipeline)', () => {
    const mockFacts: ExportableFact[] = [
      {
        id: 'fact-1',
        factType: 'lab_result.as_written',
        value: { kind: 'text', text: 'Hemoglobin: 11.4 g/dL' },
        verbatimQuote: 'Hemoglobin: 11.4 g/dL',
        observedOn: '2025-06-15',
        state: 'verified',
      },
      {
        id: 'fact-2',
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: 'Infiltrating ductal carcinoma, Right breast' },
        verbatimQuote: 'Infiltrating ductal carcinoma, Right breast',
        observedOn: '2025-06-10',
        state: 'verified',
      },
      {
        id: 'fact-3',
        factType: 'lab_result.as_written',
        value: { kind: 'text', text: 'Platelets: 210000 /uL' },
        verbatimQuote: 'Platelets: 210000 /uL',
        observedOn: '2025-06-15',
        state: 'extracted', // Unverified!
      },
    ];

    const baseExportInput = {
      patient: {
        id: patientId,
        uhid: 'RCI-2025-001',
        name: 'Kavita S.',
        gender: 'female' as const,
        birthDate: '1982-04-12',
        abhaAddress: 'kavita.s@abdm',
      },
      organization: {
        id: 'org-rci',
        name: 'Regional Cancer Institute',
        hfrFacilityId: 'IN2710000045',
      },
      practitioner: {
        id: 'doc-rao',
        name: 'Dr. Rao',
        hprId: '91-1234-5678-9012',
      },
      packet: {
        id: 'packet-123',
        title: 'Initial Oncology Consultation Summary',
        packetType: 'consultation',
        approvedAt: '2025-06-16T10:00:00Z',
        packetHash: 'sha256-mock-packet-hash-1234567890abcdef',
      },
      facts: mockFacts,
    };

    it('exports verified facts into a valid NRCeS ABDM DocumentBundle with Composition and Provenance', () => {
      const res = exportToFhirR4Bundle(baseExportInput);
      expect(res.ok).toBe(true);
      expect(res.bundle).toBeDefined();
      expect(res.bundleSha256).toBeDefined();

      const b = res.bundle as Record<string, unknown>;
      expect(b['resourceType']).toBe('Bundle');
      expect(b['type']).toBe('document');
      const entries = b['entry'] as Array<{ fullUrl: string; resource: Record<string, unknown> }>;
      expect(entries.length).toBeGreaterThanOrEqual(5);

      // Entry 0 must be Composition
      expect(entries[0]?.resource['resourceType']).toBe('Composition');
      expect(entries[0]?.resource['title']).toBe('Initial Oncology Consultation Summary');

      // Patient entry
      const patientEntry = entries.find((e) => e.resource['resourceType'] === 'Patient');
      expect(patientEntry?.resource['name']).toEqual([{ text: 'Kavita S.' }]);

      // Observation entry with parsed quantity
      const hbEntry = entries.find((e) => e.resource['resourceType'] === 'Observation');
      expect(hbEntry).toBeDefined();
      expect((hbEntry?.resource['valueQuantity'] as Record<string, unknown>)?.['value']).toBe(11.4);
      expect((hbEntry?.resource['valueQuantity'] as Record<string, unknown>)?.['unit']).toBe('g/dL');

      // Provenance entry
      const provEntry = entries.find((e) => e.resource['resourceType'] === 'Provenance');
      expect(provEntry).toBeDefined();
      expect(provEntry?.resource['signature']).toBeDefined();

      // Verified-only policy check: fact-3 (extracted) was excluded!
      expect(entries.some((e) => e.fullUrl.includes('fact-3'))).toBe(false);
    });

    it('blocks export when consent is DENIED or EXPIRED', () => {
      const deniedRes = exportToFhirR4Bundle({
        ...baseExportInput,
        consent: {
          consentId: 'consent-denied-1',
          status: 'DENIED',
          permissionTo: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      expect(deniedRes.ok).toBe(false);
      expect(deniedRes.error).toContain('consent_not_granted:DENIED');

      const expiredRes = exportToFhirR4Bundle({
        ...baseExportInput,
        consent: {
          consentId: 'consent-exp-1',
          status: 'GRANTED',
          permissionTo: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        },
      });
      expect(expiredRes.ok).toBe(false);
      expect(expiredRes.error).toBe('consent_expired');
    });
  });
});

it.each(['female', 'male', 'other', 'unknown', 'invalid', undefined])(
  'exports only a supported administrative gender for %s', async (gender) => {
    const { FhirExporter } = await import('../src');
    const bundle = FhirExporter.exportPatientRecord({
      patient: { id: 'synthetic-patient', name: 'Synthetic Patient', gender },
      organization: { id: 'synthetic-org', name: 'Synthetic Facility' },
      practitioner: { id: 'synthetic-user', name: 'Synthetic Reviewer' },
      facts: [],
    });
    const entries = bundle.entry as Array<{ resource: Record<string, unknown> }>;
    const patient = entries.find((entry) => entry.resource.resourceType === 'Patient')?.resource;
    expect(patient?.gender).toBe(gender && ['male', 'female', 'other', 'unknown'].includes(gender) ? gender : 'unknown');
  },
);
