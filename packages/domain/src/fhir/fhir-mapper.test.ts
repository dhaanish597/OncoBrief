import { describe, expect, it } from 'vitest';
import {
  exportToAbdmDocumentBundle,
  formatIstTimestamp,
  type FactWithProvenance,
} from './abdm-bundle-mapper';
import { exportToMCodeBundle } from './mcode-mapper';

describe('Layer 2: Standards-Based FHIR R4 Import/Export Mapper (DOM-09)', () => {
  const verifiedFacts: FactWithProvenance[] = [
    {
      id: 'fact-1',
      patientId: 'patient-123',
      documentId: 'doc-path-001',
      factType: 'lab_result.as_written',
      value: { kind: 'lab', name: 'Hemoglobin', valueText: '11.4', unitText: 'g/dL' },
      observedOn: '2026-05-14T08:30:00.000Z',
      state: 'verified',
      pageNumber: 3,
      bbox: { x: 0.12, y: 0.34, w: 0.55, h: 0.04 },
      charInterval: { start: 120, end: 145 },
      verbatimQuote: 'Hemoglobin: 11.4 g/dL',
      confidence: 0.96,
    },
    {
      id: 'fact-2',
      patientId: 'patient-123',
      documentId: 'doc-surg-002',
      factType: 'procedure.recorded',
      value: { kind: 'procedure', name: 'Left Modified Radical Mastectomy', code: '392021009' },
      observedOn: '2026-04-10T11:00:00.000Z',
      state: 'corrected',
      pageNumber: 1,
      bbox: { x: 0.15, y: 0.22, w: 0.65, h: 0.05 },
      charInterval: { start: 50, end: 85 },
      verbatimQuote: 'Procedure: Left Modified Radical Mastectomy',
      confidence: 0.98,
    },
    {
      id: 'fact-3',
      patientId: 'patient-123',
      documentId: 'doc-draft-003',
      factType: 'medication.recorded',
      value: { kind: 'medication', name: 'Tamoxifen', doseText: '20 mg OD' },
      state: 'extracted', // Unverified! Must NOT be exported
      pageNumber: 1,
      verbatimQuote: 'Tamoxifen 20 mg OD',
    },
  ];

  it('DOM-09: ABDM v6.5.0 Bundle Structure: Composition at entry[0], urn:uuid refs, IST +05:30 timestamps', () => {
    const bundle = exportToAbdmDocumentBundle(verifiedFacts, {
      profileType: 'OPConsultRecord',
      patientId: 'patient-123',
      patientName: 'Kavita Sharma',
      abhaNumber: '91-1234-5678-9012',
      abhaAddress: 'kavita@sbx',
      facilityId: 'TMH-FACILITY-001',
      facilityName: 'Tata Memorial Hospital',
      practitionerId: 'HPR-98765',
      practitionerName: 'Dr. S. Nair, MD',
    });

    // 1. Bundle top-level checks
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('document');
    expect(bundle.meta.profile).toContain(
      'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle',
    );
    expect(bundle.timestamp).toMatch(/\+05:30$/);

    // 2. DOM-09: Composition at Bundle.entry[0]
    expect(bundle.entry[0]).toBeDefined();
    expect(bundle.entry[0]!.resource.resourceType).toBe('Composition');
    const composition = bundle.entry[0]!.resource as Record<string, unknown>;
    expect(composition['status']).toBe('final');
    expect((composition['meta'] as Record<string, unknown>)['profile']).toContain(
      'https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord',
    );

    // 3. Timestamps end in +05:30
    expect(composition['date']).toMatch(/\+05:30$/);
    expect((composition['meta'] as Record<string, unknown>)['lastUpdated']).toMatch(/\+05:30$/);

    // 4. Verify all internal references match RFC 4122 urn:uuid pattern
    const uuidRegex = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const entry of bundle.entry) {
      expect(entry.fullUrl).toMatch(uuidRegex);
      const res = entry.resource;
      if (res['subject'] && typeof res['subject'] === 'object') {
        const sub = res['subject'] as Record<string, string>;
        expect(sub['reference']).toMatch(uuidRegex);
      }
      if (Array.isArray(res['author'])) {
        for (const author of res['author']) {
          const auth = author as Record<string, string>;
          expect(auth['reference']).toMatch(uuidRegex);
        }
      }
      if (res['custodian'] && typeof res['custodian'] === 'object') {
        const cust = res['custodian'] as Record<string, string>;
        expect(cust['reference']).toMatch(uuidRegex);
      }
    }

    // 5. Verify Patient, Organization, and Practitioner identifiers
    const patientEntry = bundle.entry.find((e) => e.resource.resourceType === 'Patient');
    expect(patientEntry).toBeDefined();
    const patientRes = patientEntry!.resource as { identifier: Array<{ system: string; value: string }> };
    expect(patientRes.identifier.some((id) => id.system === 'https://healthid.abdm.gov.in' && id.value === '91-1234-5678-9012')).toBe(true);
    expect(patientRes.identifier.some((id) => id.system === 'https://healthid.ndhm.gov.in' && id.value === 'kavita@sbx')).toBe(true);

    const orgEntry = bundle.entry.find((e) => e.resource.resourceType === 'Organization');
    expect(orgEntry).toBeDefined();
    const orgRes = orgEntry!.resource as { identifier: Array<{ system: string; value: string }> };
    expect(orgRes.identifier.some((id) => id.system === 'https://facility.ndhm.gov.in' && id.value === 'TMH-FACILITY-001')).toBe(true);

    const practitionerEntry = bundle.entry.find((e) => e.resource.resourceType === 'Practitioner');
    expect(practitionerEntry).toBeDefined();
    const pracRes = practitionerEntry!.resource as { identifier: Array<{ system: string; value: string }> };
    expect(pracRes.identifier.some((id) => id.value === 'HPR-98765')).toBe(true);

    // 6. Verify unverified fact-3 was filtered out (only verified & corrected are included)
    const resourceTypes = bundle.entry.map((e) => e.resource.resourceType);
    expect(resourceTypes).toContain('Observation'); // Hemoglobin
    expect(resourceTypes).toContain('Procedure'); // Mastectomy
    expect(resourceTypes).not.toContain('MedicationStatement'); // Unverified Tamoxifen excluded

    // 6. Verify linked FHIR Provenance resource
    const provenanceEntry = bundle.entry.find((e) => e.resource.resourceType === 'Provenance');
    expect(provenanceEntry).toBeDefined();
    const provenance = provenanceEntry!.resource as Record<string, unknown>;
    expect(provenance['recorded']).toMatch(/\+05:30$/);
    const entities = provenance['entity'] as Array<{
      role: string;
      extension: Array<{ url: string; valueString?: string; valueInteger?: number }>;
    }>;
    expect(entities.length).toBe(2); // exactly 2 verified facts
    const docIdExt = entities[0]!.extension.find((x) => x.url.includes('document-id'));
    expect(docIdExt?.valueString).toBe('doc-path-001');
    const pageExt = entities[0]!.extension.find((x) => x.url.includes('page-number'));
    expect(pageExt?.valueInteger).toBe(3);
    const quoteExt = entities[0]!.extension.find((x) => x.url.includes('verbatim-quote'));
    expect(quoteExt?.valueString).toBe('Hemoglobin: 11.4 g/dL');
  });

  it('formats dates accurately with +05:30 IST offset', () => {
    const timestamp = formatIstTimestamp(new Date('2026-05-14T00:00:00.000Z'));
    expect(timestamp).toContain('+05:30');
    expect(timestamp).toContain('2026-05-14T05:30:00.000+05:30');
  });

  it('exports HL7 mCODE STU4 bundle with appropriate US oncology profiles', () => {
    const mcodeBundle = exportToMCodeBundle(verifiedFacts, {
      patientId: 'patient-123',
      patientName: 'Kavita Sharma',
    });

    expect(mcodeBundle.resourceType).toBe('Bundle');
    expect(mcodeBundle.type).toBe('collection');

    // Procedure profile check
    const procedureEntry = mcodeBundle.entry.find((e) => e.resource.resourceType === 'Procedure');
    expect(procedureEntry).toBeDefined();
    const proc = procedureEntry!.resource as Record<string, unknown>;
    const procProfiles = (proc['meta'] as Record<string, unknown>)['profile'] as string[];
    expect(procProfiles).toContain(
      'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-related-surgical-procedure',
    );

    // Lab profile check
    const labEntry = mcodeBundle.entry.find((e) => e.resource.resourceType === 'Observation');
    expect(labEntry).toBeDefined();
    const lab = labEntry!.resource as Record<string, unknown>;
    const labProfiles = (lab['meta'] as Record<string, unknown>)['profile'] as string[];
    expect(labProfiles).toContain(
      'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-laboratory-test-result',
    );
  });
});
