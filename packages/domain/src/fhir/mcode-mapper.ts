/**
 * HL7 FHIR R4 mCODE STU4 Profile Mapper
 *
 * Maps verified oncology facts to HL7 FHIR R4 mCODE STU4 oncology profiles:
 * - CancerRelatedSurgicalProcedure (http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-related-surgical-procedure)
 * - RadiotherapyCourseSummary (http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-radiotherapy-course-summary)
 * - LaboratoryTestResult (http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-laboratory-test-result)
 *
 * NOTE ON STANDARDS SEPARATION (Architecture §1.2):
 * HL7 mCODE STU4 is a US-realm oncology specification on FHIR R4.
 * It is maintained as a distinct export format and does NOT automatically
 * satisfy Indian National Resource Centre for EHR Standards (NRCeS) ABDM v6.5.0
 * profile validation.
 */

import { randomUUID } from 'node:crypto';
import type { FactWithProvenance, FhirBundleEntry } from './abdm-bundle-mapper';

export interface MCodeExportOptions {
  patientId: string;
  patientName?: string;
  facilityName?: string;
  practitionerName?: string;
}

export interface MCodeBundle {
  resourceType: 'Bundle';
  id: string;
  meta: {
    lastUpdated: string;
    profile: string[];
  };
  type: 'collection';
  entry: FhirBundleEntry[];
}

export function exportToMCodeBundle(
  facts: readonly FactWithProvenance[],
  options: MCodeExportOptions,
): MCodeBundle {
  const now = new Date().toISOString();
  const bundleUuid = randomUUID();
  const patientUuid = randomUUID();
  const practitionerUuid = randomUUID();
  const provenanceUuid = randomUUID();

  const entries: FhirBundleEntry[] = [];
  const targetResourceUuids: string[] = [];

  // Patient resource
  const patientResource = {
    resourceType: 'Patient',
    id: patientUuid,
    meta: {
      profile: ['http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-patient'],
    },
    identifier: [
      {
        system: 'https://oncobrief.org/patients',
        value: options.patientId,
      },
    ],
    name: [
      {
        text: options.patientName ?? 'Cancer Patient',
      },
    ],
  };
  entries.push({
    fullUrl: `urn:uuid:${patientUuid}`,
    resource: patientResource,
  });

  const eligibleFacts = facts.filter((f) => f.state === 'verified' || f.state === 'corrected');

  for (const fact of eligibleFacts) {
    const resourceUuid = randomUUID();
    targetResourceUuids.push(resourceUuid);
    const factTime = fact.observedOn
      ? new Date(fact.observedOn).toISOString()
      : now;

    if (fact.factType === 'procedure.recorded' || fact.factType === 'imaging.recorded') {
      const procedureName =
        fact.value.kind === 'procedure' ? fact.value.name : 'Cancer Surgical Procedure';
      const procedureCode =
        fact.value.kind === 'procedure' && fact.value.code ? fact.value.code : '392021009';

      const surgicalResource = {
        resourceType: 'Procedure',
        id: resourceUuid,
        meta: {
          profile: [
            'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-cancer-related-surgical-procedure',
          ],
        },
        status: 'completed',
        category: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '387713003',
              display: 'Surgical procedure',
            },
          ],
        },
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: procedureCode,
              display: procedureName,
            },
          ],
          text: procedureName,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
        },
        performedDateTime: factTime,
      };

      entries.push({
        fullUrl: `urn:uuid:${resourceUuid}`,
        resource: surgicalResource,
      });
    } else if (fact.factType === 'radiation.recorded') {
      const radName =
        fact.value.kind === 'procedure' ? fact.value.name : 'Radiation Therapy Course';

      const radiotherapyResource = {
        resourceType: 'Procedure',
        id: resourceUuid,
        meta: {
          profile: [
            'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-radiotherapy-course-summary',
          ],
        },
        status: 'completed',
        category: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '108290001',
              display: 'Radiation oncology AND/OR radiotherapy',
            },
          ],
        },
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '448385000',
              display: radName,
            },
          ],
          text: radName,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
        },
        performedDateTime: factTime,
      };

      entries.push({
        fullUrl: `urn:uuid:${resourceUuid}`,
        resource: radiotherapyResource,
      });
    } else if (fact.value.kind === 'lab') {
      const numericVal = parseFloat(fact.value.valueText);
      const isNumeric = !isNaN(numericVal);

      const labResource = {
        resourceType: 'Observation',
        id: resourceUuid,
        meta: {
          profile: [
            'http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-laboratory-test-result',
          ],
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
              code: '718-7',
              display: fact.value.name,
            },
          ],
          text: fact.value.name,
        },
        subject: {
          reference: `urn:uuid:${patientUuid}`,
        },
        effectiveDateTime: factTime,
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
        resource: labResource,
      });
    }
  }

  // Linked FHIR Provenance
  const provenanceResource = {
    resourceType: 'Provenance',
    id: provenanceUuid,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Provenance'],
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
      },
    })),
  };

  entries.push({
    fullUrl: `urn:uuid:${provenanceUuid}`,
    resource: provenanceResource,
  });

  return {
    resourceType: 'Bundle',
    id: bundleUuid,
    meta: {
      lastUpdated: now,
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
    },
    type: 'collection',
    entry: entries,
  };
}
