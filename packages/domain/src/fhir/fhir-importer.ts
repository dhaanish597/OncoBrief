/**
 * FHIR R4 Inbound Resource Importer & Evidence Candidate Mapper
 *
 * Implements standard-compliant ingestion of external FHIR R4 clinical resources
 * into candidate facts with structured-resource provenance (no fabricated OCR spans).
 */

import { createHash } from 'node:crypto';
import type { FactType } from '../vocab/fact-types';
import type { FactValue } from '../vocab/fact-value';

export interface StructuredFhirProvenance {
  resourceType: string;
  resourceId: string;
  versionId?: string;
  elementPath: string;
  systemUrl?: string;
  rawResourceJson: Record<string, unknown>;
  rawResourceSha256: string;
  verbatimText: string;
  observedOn?: string | null;
}

export interface FhirImportOptions {
  targetPatientId: string;
  expectedTenantOrgId?: string;
  sourceSystemUrl?: string;
  strictPatientMatching?: boolean;
}

export interface ImportedFactCandidate {
  factType: FactType;
  value: FactValue;
  verbatimQuote: string;
  observedOn: string | null;
  state: 'extracted';
  provenance: StructuredFhirProvenance;
  sourceResourceId: string;
  sourceResourceType: string;
}

export interface FhirImportResult {
  valid: boolean;
  error?: string;
  bundleType?: string;
  resourcesProcessed: number;
  facts: ImportedFactCandidate[];
  diagnostics: string[];
}

export function computeJsonSha256(obj: unknown): string {
  const normalized = JSON.stringify(obj, Object.keys(obj as object).sort());
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function resolvePatientReference(ref: unknown, targetPatientId: string): boolean {
  if (!ref || typeof ref !== 'string') return false;
  const cleanRef = ref.trim();
  return (
    cleanRef === targetPatientId ||
    cleanRef === `Patient/${targetPatientId}` ||
    cleanRef === `urn:uuid:${targetPatientId}` ||
    cleanRef.endsWith(`/${targetPatientId}`)
  );
}

export function importFromFhirR4(
  payload: unknown,
  options: FhirImportOptions,
): FhirImportResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      error: 'Invalid FHIR payload: expected JSON object.',
      resourcesProcessed: 0,
      facts: [],
      diagnostics: ['payload_not_object'],
    };
  }

  const root = payload as Record<string, unknown>;
  const resourceType = String(root['resourceType'] ?? '');

  if (!resourceType) {
    return {
      valid: false,
      error: 'Missing required "resourceType" attribute.',
      resourcesProcessed: 0,
      facts: [],
      diagnostics: ['missing_resource_type'],
    };
  }

  const resourcesToProcess: Array<{ resource: Record<string, unknown>; elementPath: string }> = [];

  if (resourceType === 'Bundle') {
    const entries = Array.isArray(root['entry']) ? root['entry'] : [];
    if (entries.length === 0) {
      return {
        valid: false,
        error: 'FHIR Bundle entry array is empty.',
        resourcesProcessed: 0,
        facts: [],
        diagnostics: ['empty_bundle_entries'],
      };
    }
    entries.forEach((entry, idx) => {
      if (entry && typeof entry === 'object' && 'resource' in entry && entry.resource && typeof entry.resource === 'object') {
        resourcesToProcess.push({
          resource: entry.resource as Record<string, unknown>,
          elementPath: `Bundle.entry[${idx}].resource`,
        });
      }
    });
  } else {
    resourcesToProcess.push({
      resource: root,
      elementPath: `${resourceType}`,
    });
  }

  const facts: ImportedFactCandidate[] = [];
  const diagnostics: string[] = [];
  let processedCount = 0;

  for (const { resource, elementPath } of resourcesToProcess) {
    const resType = String(resource['resourceType'] ?? '');
    const resId = String(resource['id'] ?? `auto-${facts.length + 1}`);
    const meta = resource['meta'] as Record<string, unknown> | undefined;
    const versionId = meta ? String(meta['versionId'] ?? '') : undefined;
    const rawSha256 = computeJsonSha256(resource);

    // Patient Linkage Verification:
    if (options.strictPatientMatching !== false && resType !== 'Organization' && resType !== 'Practitioner') {
      let subjectRef: unknown;
      if (resType === 'Patient') {
        subjectRef = resId;
      } else {
        const subject = resource['subject'] as Record<string, unknown> | undefined;
        const patient = resource['patient'] as Record<string, unknown> | undefined;
        subjectRef = subject?.['reference'] ?? patient?.['reference'];
      }

      if (subjectRef && !resolvePatientReference(subjectRef, options.targetPatientId)) {
        diagnostics.push(`patient_mismatch:${resType}/${resId}`);
        continue; // Reject resource belonging to a different patient
      }
    }

    processedCount++;

    // 1. Observation -> Laboratory Analyte or Measurement
    if (resType === 'Observation') {
      const codeObj = resource['code'] as Record<string, unknown> | undefined;
      const codeText =
        (codeObj?.['text'] as string) ||
        ((codeObj?.['coding'] as Array<Record<string, unknown>>)?.[0]?.['display'] as string) ||
        'Laboratory Observation';

      const effectiveDate =
        (resource['effectiveDateTime'] as string) ||
        ((resource['effectivePeriod'] as Record<string, unknown>)?.['start'] as string) ||
        null;

      let valueFormatted = '';
      let factValue: FactValue | null = null;

      if (resource['valueQuantity'] && typeof resource['valueQuantity'] === 'object') {
        const vq = resource['valueQuantity'] as Record<string, unknown>;
        const val = vq['value'];
        const unit = (vq['unit'] as string) || (vq['code'] as string) || '';
        valueFormatted = `${val}${unit ? ` ${unit}` : ''}`;
        factValue = {
          kind: 'text',
          text: `${codeText}: ${valueFormatted}`,
        };
      } else if (resource['valueString']) {
        valueFormatted = String(resource['valueString']);
        factValue = { kind: 'text', text: `${codeText}: ${valueFormatted}` };
      } else if (resource['valueCodeableConcept']) {
        const vcc = resource['valueCodeableConcept'] as Record<string, unknown>;
        valueFormatted = (vcc['text'] as string) || ((vcc['coding'] as Array<Record<string, unknown>>)?.[0]?.['display'] as string) || 'Observed';
        factValue = { kind: 'text', text: `${codeText}: ${valueFormatted}` };
      }

      if (factValue) {
        facts.push({
          factType: 'lab_result.as_written',
          value: factValue,
          verbatimQuote: `${codeText}: ${valueFormatted}`,
          observedOn: effectiveDate,
          state: 'extracted',
          sourceResourceId: resId,
          sourceResourceType: resType,
          provenance: {
            resourceType: resType,
            resourceId: resId,
            versionId,
            elementPath: `${elementPath}.valueQuantity`,
            systemUrl: options.sourceSystemUrl,
            rawResourceJson: resource,
            rawResourceSha256: rawSha256,
            verbatimText: `${codeText}: ${valueFormatted}`,
            observedOn: effectiveDate,
          },
        });
      }
    }

    // 2. DiagnosticReport -> Pathology / IHC / Radiology findings
    else if (resType === 'DiagnosticReport') {
      const conclusion = (resource['conclusion'] as string) || '';
      const codeObj = resource['code'] as Record<string, unknown> | undefined;
      const reportName =
        (codeObj?.['text'] as string) ||
        ((codeObj?.['coding'] as Array<Record<string, unknown>>)?.[0]?.['display'] as string) ||
        'Diagnostic Report';

      const effectiveDate = (resource['effectiveDateTime'] as string) || null;
      const textSummary = conclusion ? `${reportName} - Conclusion: ${conclusion}` : reportName;

      facts.push({
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: textSummary },
        verbatimQuote: textSummary,
        observedOn: effectiveDate,
        state: 'extracted',
        sourceResourceId: resId,
        sourceResourceType: resType,
        provenance: {
          resourceType: resType,
          resourceId: resId,
          versionId,
          elementPath: `${elementPath}.conclusion`,
          systemUrl: options.sourceSystemUrl,
          rawResourceJson: resource,
          rawResourceSha256: rawSha256,
          verbatimText: textSummary,
          observedOn: effectiveDate,
        },
      });
    }

    // 3. Condition -> Cancer Diagnosis & Stage
    else if (resType === 'Condition') {
      const codeObj = resource['code'] as Record<string, unknown> | undefined;
      const diagnosisText =
        (codeObj?.['text'] as string) ||
        ((codeObj?.['coding'] as Array<Record<string, unknown>>)?.[0]?.['display'] as string) ||
        'Oncology Condition';

      const recordedDate = (resource['recordedDate'] as string) || null;

      facts.push({
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: diagnosisText },
        verbatimQuote: diagnosisText,
        observedOn: recordedDate,
        state: 'extracted',
        sourceResourceId: resId,
        sourceResourceType: resType,
        provenance: {
          resourceType: resType,
          resourceId: resId,
          versionId,
          elementPath: `${elementPath}.code`,
          systemUrl: options.sourceSystemUrl,
          rawResourceJson: resource,
          rawResourceSha256: rawSha256,
          verbatimText: diagnosisText,
          observedOn: recordedDate,
        },
      });
    }

    // 4. Procedure -> Surgical / Radiation intervention
    else if (resType === 'Procedure') {
      const codeObj = resource['code'] as Record<string, unknown> | undefined;
      const procedureText =
        (codeObj?.['text'] as string) ||
        ((codeObj?.['coding'] as Array<Record<string, unknown>>)?.[0]?.['display'] as string) ||
        'Procedure';

      const performedDate =
        (resource['performedDateTime'] as string) ||
        ((resource['performedPeriod'] as Record<string, unknown>)?.['start'] as string) ||
        null;

      facts.push({
        factType: 'procedure.recorded',
        value: { kind: 'procedure', name: procedureText },
        verbatimQuote: procedureText,
        observedOn: performedDate,
        state: 'extracted',
        sourceResourceId: resId,
        sourceResourceType: resType,
        provenance: {
          resourceType: resType,
          resourceId: resId,
          versionId,
          elementPath: `${elementPath}.code`,
          systemUrl: options.sourceSystemUrl,
          rawResourceJson: resource,
          rawResourceSha256: rawSha256,
          verbatimText: procedureText,
          observedOn: performedDate,
        },
      });
    }

    // 5. MedicationStatement -> Chemotherapy / Systemic Therapy
    else if (resType === 'MedicationStatement') {
      const medObj = resource['medicationCodeableConcept'] as Record<string, unknown> | undefined;
      const medText =
        (medObj?.['text'] as string) ||
        ((medObj?.['coding'] as Array<Record<string, unknown>>)?.[0]?.['display'] as string) ||
        'Systemic Therapy';

      const effectiveDate = (resource['effectiveDateTime'] as string) || null;

      facts.push({
        factType: 'medication.recorded',
        value: { kind: 'medication', name: medText },
        verbatimQuote: `Medication: ${medText}`,
        observedOn: effectiveDate,
        state: 'extracted',
        sourceResourceId: resId,
        sourceResourceType: resType,
        provenance: {
          resourceType: resType,
          resourceId: resId,
          versionId,
          elementPath: `${elementPath}.medicationCodeableConcept`,
          systemUrl: options.sourceSystemUrl,
          rawResourceJson: resource,
          rawResourceSha256: rawSha256,
          verbatimText: `Medication: ${medText}`,
          observedOn: effectiveDate,
        },
      });
    }

    // 6. Encounter -> Clinic consultation appointment
    else if (resType === 'Encounter') {
      const period = resource['period'] as Record<string, unknown> | undefined;
      const encounterDate = (period?.['start'] as string) || null;
      const status = (resource['status'] as string) || 'finished';

      facts.push({
        factType: 'appointment.recorded',
        value: { kind: 'appointment', date: encounterDate ?? '1970-01-01', detailText: `Encounter (${status})` },
        verbatimQuote: `Encounter (${status}) on ${encounterDate ?? 'date unstated'}`,
        observedOn: encounterDate,
        state: 'extracted',
        sourceResourceId: resId,
        sourceResourceType: resType,
        provenance: {
          resourceType: resType,
          resourceId: resId,
          versionId,
          elementPath: `${elementPath}.period`,
          systemUrl: options.sourceSystemUrl,
          rawResourceJson: resource,
          rawResourceSha256: rawSha256,
          verbatimText: `Encounter (${status}) on ${encounterDate ?? 'date unstated'}`,
          observedOn: encounterDate,
        },
      });
    }
  }

  return {
    valid: true,
    bundleType: resourceType === 'Bundle' ? String(root['type'] ?? 'document') : undefined,
    resourcesProcessed: processedCount,
    facts,
    diagnostics,
  };
}

export const FhirImporter = {
  importBundle: (
    bundle: Record<string, unknown>,
    options: { orgId?: string; patientId: string; defaultOriginFacility?: string }
  ) => {
    return importFromFhirR4(bundle, {
      targetPatientId: options.patientId,
      expectedTenantOrgId: options.orgId,
      sourceSystemUrl: options.defaultOriginFacility,
      strictPatientMatching: false,
    });
  },
  importResourceOrBundle: importFromFhirR4,
};

