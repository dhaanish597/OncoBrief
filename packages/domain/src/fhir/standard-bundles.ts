/**
 * Standard Oncology FHIR R4 Bundles and Schema Validator
 *
 * Implements server-side validation and deterministic fixtures for:
 * 1. NRCeS ABDM v6.5.0 DiagnosticReport / OPConsultRecord Bundle (Tata Memorial / ACTREC)
 * 2. HL7 mCODE STU4 Oncology Bundle (AIIMS)
 */

export interface BundleValidationResult {
  valid: boolean;
  error?: string;
  bundleType?: 'abdm_v650' | 'mcode_stu4' | 'generic_fhir';
  entryCount?: number;
}

export function validateFhirBundle(rawJson: unknown): BundleValidationResult {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    return { valid: false, error: 'Uploaded content is not a valid JSON object.' };
  }
  const obj = rawJson as Record<string, unknown>;
  if (obj['resourceType'] !== 'Bundle') {
    return {
      valid: false,
      error: `Invalid resourceType "${String(obj['resourceType'] ?? 'undefined')}". Expected FHIR R4 "Bundle".`,
    };
  }
  if (!Array.isArray(obj['entry']) || obj['entry'].length === 0) {
    return {
      valid: false,
      error: 'FHIR Bundle entry array is missing or empty. At least one entry resource is required.',
    };
  }

  const meta = obj['meta'] as { profile?: string[] } | undefined;
  const profiles = Array.isArray(meta?.profile) ? meta!.profile : [];
  const isAbdm = profiles.some(
    (p) =>
      p.includes('nrces.in') ||
      p.includes('ndhm.gov.in') ||
      p.includes('DiagnosticReportRecord') ||
      p.includes('OPConsultRecord'),
  );
  const isMCode = profiles.some(
    (p) =>
      p.includes('mcode') ||
      p.includes('cancer'),
  );

  return {
    valid: true,
    bundleType: isAbdm ? 'abdm_v650' : isMCode ? 'mcode_stu4' : 'generic_fhir',
    entryCount: obj['entry'].length,
  };
}

/**
 * Creates a standards-compliant NRCeS ABDM v6.5.0 DiagnosticReportRecord bundle
 * representing an outside referral & pathology/IHC report from Tata Memorial Hospital & ACTREC.
 */
export function createTataMemorialDiagnosticBundle(patientId = 'DEMO-001'): Record<string, unknown> {
  const patientRef = `Patient/${patientId}`;
  return {
    resourceType: 'Bundle',
    id: `tmc-actrec-dx-${patientId}`,
    meta: {
      versionId: '1',
      lastUpdated: '2025-06-15T10:30:00.000+05:30',
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord'],
    },
    identifier: {
      system: 'https://tmc.gov.in/actrec/fhir/bundles',
      value: `TMC-ACTREC-DX-2025-06-15-${patientId}`,
    },
    type: 'document',
    timestamp: '2025-06-15T10:30:00.000+05:30',
    entry: [
      {
        fullUrl: 'urn:uuid:tmc-comp-01',
        resource: {
          resourceType: 'Composition',
          id: 'tmc-comp-01',
          status: 'final',
          type: {
            coding: [
              {
                system: 'https://projectndhm.in/fhir/ndhm/CodeSystem/ndhm-diagnostic-report-type-code',
                code: '721981007',
                display: 'Diagnostic studies report',
              },
            ],
            text: 'Diagnostic studies report',
          },
          subject: { reference: patientRef },
          date: '2025-06-15T10:30:00.000+05:30',
          title: 'Tata Memorial Hospital & ACTREC Diagnostic and IHC Review',
        },
      },
      {
        fullUrl: 'urn:uuid:tmc-org-01',
        resource: {
          resourceType: 'Organization',
          id: 'tmc-org-01',
          identifier: [
            {
              system: 'https://facility.abdm.gov.in',
              value: 'IN2710000029',
            },
          ],
          name: 'Tata Memorial Hospital & ACTREC',
        },
      },
      {
        fullUrl: 'urn:uuid:tmc-diag-01',
        resource: {
          resourceType: 'DiagnosticReport',
          id: 'tmc-diag-01',
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
                  code: 'PAT',
                  display: 'Pathology',
                },
              ],
            },
          ],
          code: {
            text: 'Histopathology and Immunohistochemistry Panel',
          },
          subject: { reference: patientRef },
          effectiveDateTime: '2025-06-15',
          conclusion: 'Invasive ductal carcinoma, ER Positive, PR Positive, HER2 Neu Negative, Ki-67 18%',
        },
      },
      {
        fullUrl: 'urn:uuid:tmc-obs-hb',
        resource: {
          resourceType: 'Observation',
          id: 'tmc-obs-hb',
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'laboratory',
                },
              ],
            },
          ],
          code: {
            coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }],
            text: 'Hemoglobin',
          },
          subject: { reference: patientRef },
          effectiveDateTime: '2025-06-15',
          valueQuantity: {
            value: 11.2,
            unit: 'g/dL',
            system: 'http://unitsofmeasure.org',
            code: 'g/dL',
          },
        },
      },
      {
        fullUrl: 'urn:uuid:tmc-obs-plt',
        resource: {
          resourceType: 'Observation',
          id: 'tmc-obs-plt',
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'laboratory',
                },
              ],
            },
          ],
          code: {
            coding: [{ system: 'http://loinc.org', code: '777-3', display: 'Platelets [#/volume] in Blood' }],
            text: 'Platelets',
          },
          subject: { reference: patientRef },
          effectiveDateTime: '2025-06-15',
          valueQuantity: {
            value: 240000,
            unit: '/uL',
            system: 'http://unitsofmeasure.org',
            code: '/uL',
          },
        },
      },
      {
        fullUrl: 'urn:uuid:tmc-proc-bx',
        resource: {
          resourceType: 'Procedure',
          id: 'tmc-proc-bx',
          status: 'completed',
          code: {
            coding: [{ system: 'http://snomed.info/sct', code: '287572003', display: 'Diagnostic biopsy' }],
            text: 'Core biopsy',
          },
          subject: { reference: patientRef },
          performedDateTime: '2025-06-10',
        },
      },
    ],
  };
}

/**
 * Creates a standards-compliant HL7 mCODE STU4 oncology bundle
 * representing an outside treatment and lab record from AIIMS New Delhi.
 */
export function createAiimsMCodeBundle(patientId = 'DEMO-001'): Record<string, unknown> {
  const patientRef = `Patient/${patientId}`;
  return {
    resourceType: 'Bundle',
    id: `aiims-mcode-${patientId}`,
    meta: {
      versionId: '1',
      lastUpdated: '2025-06-20T11:00:00.000+05:30',
      profile: [
        'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-patient',
        'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-related-surgical-procedure',
      ],
    },
    type: 'collection',
    entry: [
      {
        fullUrl: 'urn:uuid:aiims-org-01',
        resource: {
          resourceType: 'Organization',
          id: 'aiims-org-01',
          name: 'All India Institute of Medical Sciences Hospital',
        },
      },
      {
        fullUrl: 'urn:uuid:aiims-proc-surg',
        resource: {
          resourceType: 'Procedure',
          id: 'aiims-proc-surg',
          meta: {
            profile: ['http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-related-surgical-procedure'],
          },
          status: 'completed',
          code: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '392021009',
                display: 'Modified radical mastectomy',
              },
            ],
            text: 'Modified radical mastectomy',
          },
          subject: { reference: patientRef },
          performedDateTime: '2025-06-18',
        },
      },
      {
        fullUrl: 'urn:uuid:aiims-med-01',
        resource: {
          resourceType: 'MedicationStatement',
          id: 'aiims-med-01',
          status: 'recorded',
          medicationCodeableConcept: {
            coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '59787', display: 'Paclitaxel' }],
            text: 'Paclitaxel',
          },
          subject: { reference: patientRef },
          effectiveDateTime: '2025-06-20',
        },
      },
      {
        fullUrl: 'urn:uuid:aiims-obs-hb',
        resource: {
          resourceType: 'Observation',
          id: 'aiims-obs-hb',
          meta: {
            profile: ['http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-laboratory-test-result'],
          },
          status: 'final',
          code: {
            coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }],
            text: 'Hemoglobin',
          },
          subject: { reference: patientRef },
          effectiveDateTime: '2025-06-20',
          valueQuantity: {
            value: 11.8,
            unit: 'g/dL',
            system: 'http://unitsofmeasure.org',
            code: 'g/dL',
          },
        },
      },
    ],
  };
}
