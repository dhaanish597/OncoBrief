/**
 * FHIR R4 Outbound Exporter & Provenance Generator
 *
 * Implements standard-compliant projection of verified Evidence Ledger facts
 * and approved consultation packets into NRCeS ABDM v6.5.0 and HL7 mCODE Bundles.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { FactType } from '../vocab/fact-types';
import type { FactValue } from '../vocab/fact-value';

export interface ExportableFact {
  id: string;
  factType: FactType;
  value: FactValue;
  verbatimQuote: string;
  observedOn?: string | null;
  state: 'verified' | 'reconciled' | 'extracted';
  documentName?: string;
  pageNumber?: number | null;
}

export interface FhirExportInput {
  patient: {
    id: string;
    uhid?: string;
    name: string;
    gender?: 'male' | 'female' | 'other' | 'unknown';
    birthDate?: string;
    abhaAddress?: string;
    abhaNumber?: string;
  };
  organization: {
    id: string;
    name: string;
    hfrFacilityId?: string;
  };
  practitioner: {
    id: string;
    name: string;
    hprId?: string;
    role?: string;
  };
  packet?: {
    id: string;
    title: string;
    packetType: string;
    approvedAt: string;
    packetHash: string;
  };
  facts: ExportableFact[];
  consent?: {
    consentId: string;
    status: 'GRANTED' | 'DENIED' | 'REVOKED' | 'EXPIRED';
    permissionTo: string;
  };
  purpose?: string;
  verifiedOnly?: boolean;
}

export interface FhirExportResult {
  ok: boolean;
  error?: string;
  bundle?: Record<string, unknown>;
  bundleSha256?: string;
  resourceCount?: number;
  provenanceId?: string;
}

export function formatUtcDateTime(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function exportToFhirR4Bundle(input: FhirExportInput): FhirExportResult {
  // 1. Consent Validation
  if (input.consent) {
    if (input.consent.status !== 'GRANTED') {
      return { ok: false, error: `consent_not_granted:${input.consent.status}` };
    }
    const expiry = new Date(input.consent.permissionTo).getTime();
    if (Date.now() > expiry) {
      return { ok: false, error: 'consent_expired' };
    }
  }

  // 2. Fact Verification Policy Enforcement
  const factsToExport = input.verifiedOnly === false
    ? input.facts
    : input.facts.filter((f) => f.state === 'verified' || f.state === 'reconciled');

  const bundleId = `bundle-${input.packet?.id ?? randomUUID()}`;
  const nowIso = formatUtcDateTime();
  const patientFullUrl = `urn:uuid:patient-${input.patient.id}`;
  const orgFullUrl = `urn:uuid:org-${input.organization.id}`;
  const practFullUrl = `urn:uuid:pract-${input.practitioner.id}`;
  const compFullUrl = `urn:uuid:comp-${randomUUID()}`;

  const entries: Array<{ fullUrl: string; resource: Record<string, unknown> }> = [];
  const targetResourceReferences: Array<{ reference: string }> = [];

  // 3. Composition (Entry 0)
  const compositionResource: Record<string, unknown> = {
    resourceType: 'Composition',
    id: `comp-${randomUUID()}`,
    status: 'final',
    type: {
      coding: [
        {
          system: 'https://projectndhm.in/fhir/ndhm/CodeSystem/ndhm-diagnostic-report-type-code',
          code: '721981007',
          display: 'Diagnostic studies report',
        },
      ],
      text: input.packet?.title ?? 'Oncology Consultation Summary',
    },
    subject: { reference: patientFullUrl, display: input.patient.name },
    date: nowIso,
    author: [{ reference: practFullUrl, display: input.practitioner.name }],
    custodian: { reference: orgFullUrl, display: input.organization.name },
    title: input.packet?.title ?? 'OncoBrief Consultation Packet',
    section: [
      {
        title: 'Verified Clinical Facts',
        text: {
          status: 'generated',
          div: `<div xmlns="http://www.w3.org/1999/xhtml"><ul>${factsToExport.map((f) => `<li>${f.verbatimQuote}</li>`).join('')}</ul></div>`,
        },
      },
    ],
  };
  entries.push({ fullUrl: compFullUrl, resource: compositionResource });

  // 4. Patient Resource
  const patientResource: Record<string, unknown> = {
    resourceType: 'Patient',
    id: `patient-${input.patient.id}`,
    identifier: [
      ...(input.patient.uhid
        ? [{ system: 'https://hospital.org/uhid', value: input.patient.uhid }]
        : []),
      ...(input.patient.abhaNumber
        ? [{ system: 'https://healthid.ndhm.gov.in', value: input.patient.abhaNumber }]
        : []),
      ...(input.patient.abhaAddress
        ? [{ system: 'https://abdm.gov.in/abha', value: input.patient.abhaAddress }]
        : []),
    ],
    name: [{ text: input.patient.name }],
    gender: input.patient.gender ?? 'unknown',
    birthDate: input.patient.birthDate ?? undefined,
    managingOrganization: { reference: orgFullUrl },
  };
  entries.push({ fullUrl: patientFullUrl, resource: patientResource });

  // 5. Practitioner Resource
  const practResource: Record<string, unknown> = {
    resourceType: 'Practitioner',
    id: `pract-${input.practitioner.id}`,
    identifier: input.practitioner.hprId
      ? [{ system: 'https://hpr.abdm.gov.in', value: input.practitioner.hprId }]
      : [],
    name: [{ text: input.practitioner.name }],
  };
  entries.push({ fullUrl: practFullUrl, resource: practResource });

  // 6. Organization Resource
  const orgResource: Record<string, unknown> = {
    resourceType: 'Organization',
    id: `org-${input.organization.id}`,
    identifier: input.organization.hfrFacilityId
      ? [{ system: 'https://facility.abdm.gov.in', value: input.organization.hfrFacilityId }]
      : [],
    name: input.organization.name,
  };
  entries.push({ fullUrl: orgFullUrl, resource: orgResource });

  // 7. Clinical Observations / Findings
  for (const fact of factsToExport) {
    const resId = `obs-${fact.id}`;
    const fullUrl = `urn:uuid:${resId}`;
    targetResourceReferences.push({ reference: fullUrl });

    if (fact.factType === 'lab_result.as_written') {
      const match = fact.verbatimQuote.match(/^([^:]+):\s*([0-9.]+)\s*([A-Za-z/μµdL%]+)?$/);
      const testName = match?.[1]?.trim() ?? fact.verbatimQuote;
      const numVal = match?.[2] ? parseFloat(match[2]) : null;
      const unit = match?.[3]?.trim() ?? '';

      const obsResource: Record<string, unknown> = {
        resourceType: 'Observation',
        id: resId,
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
        code: { text: testName },
        subject: { reference: patientFullUrl },
        effectiveDateTime: fact.observedOn ? formatUtcDateTime(fact.observedOn) : nowIso,
        ...(numVal !== null
          ? {
              valueQuantity: {
                value: numVal,
                unit: unit || undefined,
                system: 'http://unitsofmeasure.org',
                code: unit || undefined,
              },
            }
          : { valueString: fact.verbatimQuote }),
      };
      entries.push({ fullUrl, resource: obsResource });
    } else if (fact.factType === 'diagnosis_text.as_written' || fact.factType === 'stage_text.as_written') {
      const condResource: Record<string, unknown> = {
        resourceType: 'Condition',
        id: resId,
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
            },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
              code: 'confirmed',
            },
          ],
        },
        code: { text: fact.verbatimQuote },
        subject: { reference: patientFullUrl },
        recordedDate: fact.observedOn ? formatUtcDateTime(fact.observedOn) : nowIso,
      };
      entries.push({ fullUrl, resource: condResource });
    } else {
      const genericObs: Record<string, unknown> = {
        resourceType: 'Observation',
        id: resId,
        status: 'final',
        code: { text: fact.factType.replaceAll('_', ' ') },
        subject: { reference: patientFullUrl },
        valueString: fact.verbatimQuote,
        effectiveDateTime: fact.observedOn ? formatUtcDateTime(fact.observedOn) : nowIso,
      };
      entries.push({ fullUrl, resource: genericObs });
    }
  }

  // 8. FHIR Provenance Resource
  const provId = `prov-${randomUUID()}`;
  const provenanceResource: Record<string, unknown> = {
    resourceType: 'Provenance',
    id: provId,
    target: [
      { reference: compFullUrl },
      ...targetResourceReferences,
    ],
    recorded: nowIso,
    reason: [{ text: input.purpose ?? 'Consultation Summary Exchange' }],
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
        who: { reference: practFullUrl },
        onBehalfOf: { reference: orgFullUrl },
      },
    ],
    signature: [
      {
        type: [
          {
            system: 'urn:iso-astm:E1762-95:2013',
            code: '1.2.840.10065.1.12.1.1',
            display: "Author's Signature",
          },
        ],
        when: nowIso,
        who: { reference: practFullUrl },
        data: Buffer.from(input.packet?.packetHash ?? randomUUID(), 'utf8').toString('base64'),
      },
    ],
  };
  entries.push({ fullUrl: `urn:uuid:${provId}`, resource: provenanceResource });

  // 9. Root Document Bundle
  const bundle: Record<string, unknown> = {
    resourceType: 'Bundle',
    id: bundleId,
    meta: {
      versionId: '1',
      lastUpdated: nowIso,
      profile: [
        'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle',
        'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord',
      ],
    },
    identifier: {
      system: 'https://oncobrief.org/fhir/bundles',
      value: `ONCOBRIEF-EXPORT-${input.patient.id}-${Date.now()}`,
    },
    type: 'document',
    timestamp: nowIso,
    entry: entries,
  };

  const bundleJson = JSON.stringify(bundle);
  const bundleSha256 = createHash('sha256').update(bundleJson, 'utf8').digest('hex');

  return {
    ok: true,
    bundle,
    bundleSha256,
    resourceCount: entries.length,
    provenanceId: provId,
  };
}

function normalizeAdministrativeGender(gender: string | undefined): FhirExportInput['patient']['gender'] {
  return gender === 'male' || gender === 'female' || gender === 'other' || gender === 'unknown'
    ? gender
    : 'unknown';
}

export const FhirExporter = {
  exportPatientRecord: (input: {
    patient: { id: string; name: string; identifier?: string; abhaAddress?: string; gender?: string; birthDate?: string };
    organization: { id: string; name: string; identifier?: string };
    practitioner: { id: string; name: string; qualification?: string };
    facts: ExportableFact[];
    options?: { exportKind?: string; includeProvenance?: boolean; verifiedOnly?: boolean; custodianOrgId?: string };
  }): Record<string, unknown> => {
    const res = exportToFhirR4Bundle({
      patient: {
        id: input.patient.id,
        name: input.patient.name,
        uhid: input.patient.identifier,
        abhaAddress: input.patient.abhaAddress,
        gender: normalizeAdministrativeGender(input.patient.gender),
        birthDate: input.patient.birthDate,
      },
      organization: {
        id: input.organization.id,
        name: input.organization.name,
        hfrFacilityId: input.organization.identifier,
      },
      practitioner: {
        id: input.practitioner.id,
        name: input.practitioner.name,
        role: input.practitioner.qualification,
      },
      facts: input.facts,
      verifiedOnly: input.options?.verifiedOnly,
    });
    return res.bundle ?? {};
  },
  exportBundle: exportToFhirR4Bundle,
};

