/**
 * NRCeS ABDM v6.5.0 DocumentBundle Mapper
 *
 * Maps verified/corrected intermediate facts from the OncoBrief Evidence Ledger
 * into NRCeS ABDM v6.5.0 DocumentBundle JSON adhering to the 8 canonical profiles:
 * - OPConsultRecord
 * - DischargeSummaryRecord
 * - DiagnosticReportRecord
 * - PrescriptionRecord
 * - WellnessRecord
 * - ImmunizationRecord
 * - HealthDocumentRecord
 * - InvoiceRecord
 *
 * Strictly assistive: intermediate facts are stored first in PostgreSQL and
 * human-verified before projection into ABDM bundles.
 * All internal references are RFC 4122 urn:uuid:<uuid>, Composition is at entry[0],
 * timestamps use IST +05:30 offset, and linked FHIR Provenance carries source spans.
 */

import { randomUUID } from 'node:crypto';
import type { FactType } from '../vocab/fact-types';
import type { FactValue } from '../vocab/fact-value';
import type { ReviewState } from '../evidence/state';

export type AbdmCanonicalProfile =
  | 'OPConsultRecord'
  | 'DischargeSummaryRecord'
  | 'DiagnosticReportRecord'
  | 'PrescriptionRecord'
  | 'WellnessRecord'
  | 'ImmunizationRecord'
  | 'HealthDocumentRecord'
  | 'InvoiceRecord';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CharInterval {
  start: number;
  end: number;
}

export interface FactWithProvenance {
  id: string;
  patientId: string;
  documentId: string;
  factType: FactType;
  value: FactValue;
  observedOn?: string | Date | null;
  state: ReviewState | string;
  spanIds?: string[];
  verbatimQuote?: string;
  pageNumber?: number;
  bbox?: BoundingBox;
  charInterval?: CharInterval;
  confidence?: number | null;
}

export interface AbdmExportOptions {
  profileType?: AbdmCanonicalProfile;
  patientId: string;
  patientName?: string;
  abhaNumber?: string;
  abhaAddress?: string;
  facilityId?: string;
  facilityName?: string;
  practitionerId?: string;
  practitionerSystem?: string;
  practitionerName?: string;
  now?: Date | string;
}

export interface FhirBundleEntry {
  fullUrl: string;
  resource: Record<string, unknown>;
}

export interface AbdmDocumentBundle {
  resourceType: 'Bundle';
  id: string;
  meta: {
    versionId: string;
    lastUpdated: string;
    profile: string[];
    security?: Array<{ system: string; code: string; display: string }>;
  };
  identifier: {
    system: string;
    value: string;
  };
  type: 'document';
  timestamp: string;
  entry: FhirBundleEntry[];
}

/**
 * Formats a Date or ISO date string to ISO 8601 with +05:30 IST offset.
 */
export function formatIstTimestamp(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const validDate = isNaN(date.getTime()) ? new Date() : date;
  
  // IST is UTC + 5h 30m
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(validDate.getTime() + istOffsetMs);
  const iso = istDate.toISOString();
  return iso.replace('Z', '+05:30');
}

const PROFILE_DEFINITIONS: Record<
  AbdmCanonicalProfile,
  { url: string; snomedCode: string; snomedDisplay: string; title: string }
> = {
  OPConsultRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord',
    snomedCode: '371530004',
    snomedDisplay: 'Clinical consultation report',
    title: 'Oncology Outpatient Consultation Record',
  },
  DischargeSummaryRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DischargeSummaryRecord',
    snomedCode: '373942005',
    snomedDisplay: 'Discharge summary report',
    title: 'Discharge Summary Record',
  },
  DiagnosticReportRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord',
    snomedCode: '721981007',
    snomedDisplay: 'Diagnostic studies report',
    title: 'Diagnostic & Laboratory Studies Record',
  },
  PrescriptionRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord',
    snomedCode: '440545006',
    snomedDisplay: 'Prescription record',
    title: 'Prescription Record',
  },
  WellnessRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/WellnessRecord',
    snomedCode: '41000179103',
    snomedDisplay: 'Wellness record',
    title: 'Wellness Record',
  },
  ImmunizationRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/ImmunizationRecord',
    snomedCode: '41000179108',
    snomedDisplay: 'Immunization record',
    title: 'Immunization Record',
  },
  HealthDocumentRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/HealthDocumentRecord',
    snomedCode: '419891008',
    snomedDisplay: 'Record artifact',
    title: 'Health Document Record',
  },
  InvoiceRecord: {
    url: 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/InvoiceRecord',
    snomedCode: '286570002',
    snomedDisplay: 'Invoice',
    title: 'Patient Financial Invoice',
  },
};

const LOINC_CODE_MAP: Record<string, { code: string; display: string }> = {
  hemoglobin: { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' },
  hb: { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' },
  platelets: { code: '777-3', display: 'Platelets [#/volume] in Blood' },
  platelet: { code: '777-3', display: 'Platelets [#/volume] in Blood' },
  'platelet count': { code: '777-3', display: 'Platelets [#/volume] in Blood' },
  wbc: { code: '6690-2', display: 'Leukocytes [#/volume] in Blood' },
  'white blood cell': { code: '6690-2', display: 'Leukocytes [#/volume] in Blood' },
  cea: { code: '2039-6', display: 'Carcinoembryonic Ag [Mass/volume] in Serum or Plasma' },
  'ca-125': { code: '2009-9', display: 'Cancer Ag 125 [Units/volume] in Serum or Plasma' },
  ca125: { code: '2009-9', display: 'Cancer Ag 125 [Units/volume] in Serum or Plasma' },
  'ca 19-9': { code: '24108-3', display: 'Cancer Ag 19-9 [Units/volume] in Serum or Plasma' },
  creatinine: { code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' },
  bilirubin: { code: '1975-2', display: 'Bilirubin.total [Mass/volume] in Serum or Plasma' },
};

function resolveLoincCode(testName: string): { code: string; display: string } {
  const normalized = testName.trim().toLowerCase();
  const found = LOINC_CODE_MAP[normalized];
  if (found) return found;
  return { code: '11502-2', display: `${testName} [Laboratory report]` };
}

/**
 * Maps verified/corrected intermediate facts to an NRCeS ABDM v6.5.0 DocumentBundle.
 */
export function exportToAbdmDocumentBundle(
  facts: readonly FactWithProvenance[],
  options: AbdmExportOptions,
): AbdmDocumentBundle {
  const now = options.now ? formatIstTimestamp(options.now) : formatIstTimestamp(new Date());
  const profileType = options.profileType ?? 'OPConsultRecord';
  const profileDef = PROFILE_DEFINITIONS[profileType];

  const bundleUuid = randomUUID();
  const compositionUuid = randomUUID();
  const patientUuid = randomUUID();
  const practitionerUuid = randomUUID();
  const organizationUuid = randomUUID();
  const provenanceUuid = randomUUID();

  const entries: FhirBundleEntry[] = [];
  const sectionEntries: Array<{ reference: string; display?: string }> = [];
  const targetResourceUuids: string[] = [compositionUuid];

  // 1. Patient Resource
  const patientIdentifiers: Array<{ system: string; value: string }> = [
    {
      system: 'https://healthid.abdm.gov.in',
      value: options.abhaNumber ?? '91-0000-0000-0000',
    },
  ];
  if (options.abhaAddress) {
    patientIdentifiers.push({
      system: 'https://healthid.ndhm.gov.in',
      value: options.abhaAddress,
    });
  }
  patientIdentifiers.push({
    system: 'https://oncobrief.org/patients',
    value: options.patientId,
  });

  const patientResource = {
    resourceType: 'Patient',
    id: patientUuid,
    meta: {
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient'],
    },
    identifier: patientIdentifiers,
    name: [
      {
        text: options.patientName ?? 'Oncology Patient',
      },
    ],
  };

  // 2. Organization Resource
  const organizationResource = {
    resourceType: 'Organization',
    id: organizationUuid,
    meta: {
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Organization'],
    },
    identifier: [
      {
        system: 'https://facility.ndhm.gov.in',
        value: options.facilityId ?? 'IN-HOSP-001',
      },
    ],
    name: options.facilityName ?? 'National Cancer Grid Hospital',
  };

  // 3. Practitioner Resource
  const practitionerResource = {
    resourceType: 'Practitioner',
    id: practitionerUuid,
    meta: {
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner'],
    },
    identifier: [
      {
        system: options.practitionerSystem ?? 'https://doctor.ndhm.gov.in',
        value: options.practitionerId ?? 'HPR-DEMO-1001',
      },
    ],
    name: [
      {
        text: options.practitionerName ?? 'Consulting Oncologist, MD',
      },
    ],
  };

  // Process eligible facts (verified or corrected only)
  const eligibleFacts = facts.filter((f) => f.state === 'verified' || f.state === 'corrected');

  // Map each fact to standard clinical FHIR resources
  for (const fact of eligibleFacts) {
    const resourceUuid = randomUUID();
    targetResourceUuids.push(resourceUuid);
    const factTimestamp = fact.observedOn ? formatIstTimestamp(fact.observedOn) : now;

    if (fact.value.kind === 'lab') {
      const loinc = resolveLoincCode(fact.value.name);
      const numericVal = parseFloat(fact.value.valueText);
      const isNumeric = !isNaN(numericVal);

      const observationResource = {
        resourceType: 'Observation',
        id: resourceUuid,
        meta: {
          profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation'],
        },
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
                display: 'Laboratory',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: loinc.code,
              display: loinc.display,
            },
          ],
          text: fact.value.name,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
          display: options.patientName ?? 'Patient',
        },
        effectiveDateTime: factTimestamp,
        ...(isNumeric && fact.value.unitText
          ? {
              valueQuantity: {
                value: numericVal,
                unit: fact.value.unitText,
                system: 'http://unitsofmeasure.org',
                code: fact.value.unitText,
              },
            }
          : {
              valueString: fact.value.unitText
                ? `${fact.value.valueText} ${fact.value.unitText}`
                : fact.value.valueText,
            }),
      };

      entries.push({
        fullUrl: `urn:uuid:${resourceUuid}`,
        resource: observationResource,
      });
      sectionEntries.push({
        reference: `urn:uuid:${resourceUuid}`,
        display: `${fact.value.name}: ${fact.value.valueText}`,
      });
    } else if (fact.value.kind === 'procedure') {
      const procedureResource = {
        resourceType: 'Procedure',
        id: resourceUuid,
        meta: {
          profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Procedure'],
        },
        status: 'completed',
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: fact.value.code ?? '71388002',
              display: fact.value.name,
            },
          ],
          text: fact.value.name,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
        },
        performedDateTime: factTimestamp,
      };

      entries.push({
        fullUrl: `urn:uuid:${resourceUuid}`,
        resource: procedureResource,
      });
      sectionEntries.push({
        reference: `urn:uuid:${resourceUuid}`,
        display: fact.value.name,
      });
    } else if (fact.value.kind === 'medication') {
      const medResource = {
        resourceType: 'MedicationStatement',
        id: resourceUuid,
        meta: {
          profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationStatement'],
        },
        status: 'active',
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '410942007',
              display: fact.value.name,
            },
          ],
          text: fact.value.doseText ? `${fact.value.name} (${fact.value.doseText})` : fact.value.name,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
        },
        effectiveDateTime: factTimestamp,
      };

      entries.push({
        fullUrl: `urn:uuid:${resourceUuid}`,
        resource: medResource,
      });
      sectionEntries.push({
        reference: `urn:uuid:${resourceUuid}`,
        display: fact.value.name,
      });
    } else if (fact.value.kind === 'text') {
      const conditionResource = {
        resourceType: 'Condition',
        id: resourceUuid,
        meta: {
          profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition'],
        },
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
              display: 'Active',
            },
          ],
        },
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '64572001',
              display: fact.value.text,
            },
          ],
          text: fact.value.text,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
        },
        recordedDate: factTimestamp,
      };

      entries.push({
        fullUrl: `urn:uuid:${resourceUuid}`,
        resource: conditionResource,
      });
      sectionEntries.push({
        reference: `urn:uuid:${resourceUuid}`,
        display: fact.value.text,
      });
    }
  }

  // 4. Composition Resource (MUST BE Bundle.entry[0])
  const compositionResource = {
    resourceType: 'Composition',
    id: compositionUuid,
    meta: {
      versionId: '1',
      lastUpdated: now,
      profile: [profileDef.url],
    },
    status: 'final',
    type: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: profileDef.snomedCode,
          display: profileDef.snomedDisplay,
        },
      ],
      text: profileDef.title,
    },
    subject: {
      reference: `urn:uuid:${patientUuid}`,
      display: options.patientName ?? 'Oncology Patient',
    },
    date: now,
    author: [
      {
        reference: `urn:uuid:${practitionerUuid}`,
        display: options.practitionerName ?? 'Consulting Oncologist, MD',
      },
    ],
    title: profileDef.title,
    custodian: {
      reference: `urn:uuid:${organizationUuid}`,
      display: options.facilityName ?? 'National Cancer Grid Hospital',
    },
    section: [
      {
        title: 'Clinical Summary & Observations',
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '423100009',
              display: 'Results section',
            },
          ],
        },
        entry: sectionEntries,
      },
    ],
  };

  // 5. Linked FHIR Provenance Resource carrying documentId, pageNumber, bbox, charInterval
  const provenanceResource = {
    resourceType: 'Provenance',
    id: provenanceUuid,
    meta: {
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Provenance'],
    },
    target: targetResourceUuids.map((id) => ({
      reference: `urn:uuid:${id}`,
    })),
    recorded: now,
    agent: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'author',
              display: 'Author',
            },
          ],
        },
        who: {
          reference: `urn:uuid:${practitionerUuid}`,
        },
      },
    ],
    entity: eligibleFacts.map((fact) => ({
      role: 'source',
      what: {
        identifier: {
          system: 'https://oncobrief.org/documents',
          value: fact.documentId,
        },
        display: `Source Document ${fact.documentId}${fact.pageNumber ? ` p.${fact.pageNumber}` : ''}`,
      },
      extension: [
        {
          url: 'https://oncobrief.org/fhir/StructureDefinition/document-id',
          valueString: fact.documentId,
        },
        ...(fact.pageNumber !== undefined
          ? [
              {
                url: 'https://oncobrief.org/fhir/StructureDefinition/page-number',
                valueInteger: fact.pageNumber,
              },
            ]
          : []),
        ...(fact.bbox
          ? [
              {
                url: 'https://oncobrief.org/fhir/StructureDefinition/bounding-box',
                valueString: JSON.stringify(fact.bbox),
              },
            ]
          : []),
        ...(fact.charInterval
          ? [
              {
                url: 'https://oncobrief.org/fhir/StructureDefinition/char-interval',
                valueString: `${fact.charInterval.start}-${fact.charInterval.end}`,
              },
            ]
          : []),
        ...(fact.verbatimQuote
          ? [
              {
                url: 'https://oncobrief.org/fhir/StructureDefinition/verbatim-quote',
                valueString: fact.verbatimQuote,
              },
            ]
          : []),
      ],
    })),
  };

  // Assemble Bundle:
  // Bundle.entry[0] MUST be Composition!
  const finalEntries: FhirBundleEntry[] = [
    { fullUrl: `urn:uuid:${compositionUuid}`, resource: compositionResource },
    { fullUrl: `urn:uuid:${patientUuid}`, resource: patientResource },
    { fullUrl: `urn:uuid:${practitionerUuid}`, resource: practitionerResource },
    { fullUrl: `urn:uuid:${organizationUuid}`, resource: organizationResource },
    ...entries,
    { fullUrl: `urn:uuid:${provenanceUuid}`, resource: provenanceResource },
  ];

  return {
    resourceType: 'Bundle',
    id: bundleUuid,
    meta: {
      versionId: '1',
      lastUpdated: now,
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle'],
      security: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
          code: 'V',
          display: 'very restricted',
        },
      ],
    },
    identifier: {
      system: 'http://hip.in',
      value: bundleUuid,
    },
    type: 'document',
    timestamp: now,
    entry: finalEntries,
  };
}
