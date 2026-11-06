import { createHash, randomUUID } from 'node:crypto';
import {
  FhirExporter,
  FhirImporter,
  type Role,
  type FactType,
  type FactValue,
  type ExportableFact,
} from '@oncobrief/domain';
import type { ExtractionPort, OcrPort, StoragePort } from '@oncobrief/ports';
import type { Querier } from '../client';
import { appendAuditEvent } from './audit';
import { createDocument, ingestDocument } from './documents';
import { detectAndRecordConflicts, insertFact } from './ledger';

export interface FhirEndpointRow {
  id: string;
  org_id: string;
  name: string;
  base_url: string;
  auth_kind: string;
  auth_config: Record<string, unknown>;
  allowed_operations: string[];
  is_active: boolean;
  is_trusted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FhirResourceLinkRow {
  id: string;
  org_id: string;
  patient_id: string;
  endpoint_id: string | null;
  resource_type: string;
  external_resource_id: string;
  version_id: string | null;
  system_url: string | null;
  internal_entity_kind: LinkFhirResourceInput['internalEntityKind'];
  internal_entity_id: string;
  element_path: string | null;
  raw_resource_sha256: string;
  created_at: Date;
}

export interface RegisterFhirEndpointInput {
  orgId: string;
  name: string;
  baseUrl: string;
  authKind?: 'none' | 'bearer' | 'basic' | 'smart_on_fhir' | 'mTLS';
  authConfig?: Record<string, unknown>;
  allowedOperations?: string[];
  userId?: string | null;
}

export interface RecordExchangeTransactionInput {
  orgId: string;
  patientId?: string | null;
  endpointId?: string | null;
  direction: 'INBOUND_IMPORT' | 'OUTBOUND_EXPORT';
  bundleType?: string;
  operation?: 'read' | 'search' | 'export' | 'import' | 'transaction';
  resourceType?: string;
  payloadSha256: string;
  status: 'INITIATED' | 'COMPLETED' | 'FAILED' | 'REJECTED';
  resourcesCount?: number;
  errorDetails?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
}

export interface LinkFhirResourceInput {
  orgId: string;
  patientId: string;
  endpointId?: string | null;
  resourceType: string;
  externalResourceId: string;
  versionId?: string | null;
  systemUrl?: string | null;
  elementPath?: string | null;
  rawResourceSha256: string;
  internalEntityKind: 'evidence_fact' | 'document' | 'consultation_packet' | 'clinical_encounter';
  internalEntityId: string;
  userId?: string | null;
}

export interface ImportExternalFhirBundleInput {
  orgId: string;
  patientId: string;
  endpointId?: string | null;
  bundleJson: Record<string, unknown>;
  userId: string;
  role?: Role | null;
  defaultOriginFacility?: string;
  idempotencyKey?: string | null;
}

export interface ExportPatientFhirBundleInput {
  orgId: string;
  patientId: string;
  exportKind: 'nrces_health_document' | 'mcode_cancer_record';
  consentId?: string | null;
  verifiedOnly?: boolean;
  userId: string;
  role?: Role | null;
  endpointId?: string | null;
  idempotencyKey?: string | null;
}

export interface FhirExchangeDeps {
  storage: StoragePort;
  ocr: OcrPort;
  extractor: ExtractionPort;
}

export async function registerFhirEndpoint(
  q: Querier,
  input: RegisterFhirEndpointInput
): Promise<{ endpointId: string }> {
  const authKind = input.authKind ?? 'none';
  const authConfig = JSON.stringify(input.authConfig ?? {});
  const allowedOps = input.allowedOperations ?? ['read', 'search', 'create', 'update', 'bundle'];

  const res = await q.query<{ id: string }>(
    `INSERT INTO fhir_endpoint_registry
       (org_id, name, base_url, auth_kind, auth_config, allowed_operations, is_active)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)
     RETURNING id`,
    [
      input.orgId,
      input.name,
      input.baseUrl,
      authKind,
      authConfig,
      allowedOps,
    ]
  );

  const endpointId = res.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId ?? null, role: null },
    action: 'fhir_endpoint.registered',
    entityKind: 'fhir_endpoint',
    entityId: endpointId,
    outcome: 'success',
    metadata: { name: input.name, baseUrl: input.baseUrl, authKind },
  });

  return { endpointId };
}

export async function getFhirEndpoint(
  q: Querier,
  orgId: string,
  endpointId: string
): Promise<FhirEndpointRow | null> {
  const res = await q.query<FhirEndpointRow>(
    `SELECT id, org_id, name, base_url, auth_kind, auth_config, allowed_operations, is_active, is_trusted, created_at, updated_at
     FROM fhir_endpoint_registry
     WHERE org_id = $1 AND id = $2`,
    [orgId, endpointId]
  );
  return res.rows[0] ?? null;
}

export async function listFhirEndpoints(
  q: Querier,
  orgId: string,
  options: { includeInactive?: boolean } = {}
): Promise<FhirEndpointRow[]> {
  const res = await q.query<FhirEndpointRow>(
    `SELECT id, org_id, name, base_url, auth_kind, auth_config, allowed_operations, is_active, is_trusted, created_at, updated_at
     FROM fhir_endpoint_registry
     WHERE org_id = $1 ${options.includeInactive ? '' : 'AND is_active = true'}
     ORDER BY created_at DESC`,
    [orgId]
  );
  return res.rows;
}

export async function deactivateFhirEndpoint(
  q: Querier,
  orgId: string,
  endpointId: string,
  userId?: string | null
): Promise<void> {
  await q.query(
    `UPDATE fhir_endpoint_registry SET is_active = false, updated_at = now()
     WHERE org_id = $1 AND id = $2`,
    [orgId, endpointId]
  );

  await appendAuditEvent(q, {
    orgId,
    actor: { userId: userId ?? null, role: null },
    action: 'fhir_endpoint.deactivated',
    entityKind: 'fhir_endpoint',
    entityId: endpointId,
    outcome: 'success',
  });
}

export async function recordExchangeTransaction(
  q: Querier,
  input: RecordExchangeTransactionInput
): Promise<{ transactionId: string; isDuplicate: boolean }> {
  if (input.idempotencyKey) {
    const existing = await q.query<{ id: string; transaction_status: string }>(
      `SELECT id, transaction_status FROM fhir_exchange_transaction
       WHERE org_id = $1 AND idempotency_key = $2`,
      [input.orgId, input.idempotencyKey]
    );
    if (existing.rows[0]) {
      return { transactionId: existing.rows[0].id, isDuplicate: true };
    }
  }

  const isCompleted = input.status === 'COMPLETED';
  const idempotencyKey = input.idempotencyKey ?? `tx-idemp-${randomUUID()}`;

  const res = await q.query<{ id: string }>(
    `INSERT INTO fhir_exchange_transaction
       (org_id, patient_id, endpoint_id, direction, bundle_type, transaction_status,
        idempotency_key, resources_count, request_payload_sha256, error_message, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${isCompleted ? 'now()' : 'null'})
     RETURNING id`,
    [
      input.orgId,
      input.patientId ?? null,
      input.endpointId ?? null,
      input.direction,
      input.bundleType ?? 'document',
      input.status,
      idempotencyKey,
      input.resourcesCount ?? 0,
      input.payloadSha256,
      input.errorDetails ?? null,
    ]
  );

  const id = res.rows[0]!.id;

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId ?? null, role: null },
    action: input.direction === 'INBOUND_IMPORT' ? 'fhir_exchange.inbound_import' : 'fhir_exchange.outbound_export',
    entityKind: 'fhir_exchange_transaction',
    entityId: id,
    outcome: input.status === 'FAILED' || input.status === 'REJECTED' ? 'denied' : 'success',
    metadata: {
      status: input.status,
      patientId: input.patientId,
    },
  });

  return { transactionId: id, isDuplicate: false };
}

export async function linkFhirResource(
  q: Querier,
  input: LinkFhirResourceInput
): Promise<{ linkId: string }> {
  const res = await q.query<{ id: string }>(
    `INSERT INTO fhir_resource_link
       (org_id, patient_id, endpoint_id, resource_type, external_resource_id,
        version_id, system_url, internal_entity_kind, internal_entity_id, element_path, raw_resource_sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (org_id, endpoint_id, resource_type, external_resource_id)
     DO UPDATE SET
       version_id = EXCLUDED.version_id,
       raw_resource_sha256 = EXCLUDED.raw_resource_sha256,
       internal_entity_id = EXCLUDED.internal_entity_id
     RETURNING id`,
    [
      input.orgId,
      input.patientId,
      input.endpointId ?? null,
      input.resourceType,
      input.externalResourceId,
      input.versionId ?? null,
      input.systemUrl ?? null,
      input.internalEntityKind,
      input.internalEntityId,
      input.elementPath ?? null,
      input.rawResourceSha256,
    ]
  );

  return { linkId: res.rows[0]!.id };
}

export async function getLinkedFhirResources(
  q: Querier,
  orgId: string,
  patientId: string
): Promise<FhirResourceLinkRow[]> {
  const res = await q.query<FhirResourceLinkRow>(
    `SELECT id, org_id, patient_id, endpoint_id, resource_type, external_resource_id,
            version_id, system_url, internal_entity_kind, internal_entity_id,
            element_path, raw_resource_sha256, created_at
     FROM fhir_resource_link
     WHERE org_id = $1 AND patient_id = $2
     ORDER BY created_at DESC`,
    [orgId, patientId]
  );
  return res.rows;
}

export async function importExternalFhirBundle(
  q: Querier,
  deps: FhirExchangeDeps,
  input: ImportExternalFhirBundleInput
): Promise<{
  transactionId: string;
  documentId: string;
  importedFactsCount: number;
  conflictsDetected: number;
  isDuplicate: boolean;
}> {
  const rawBytes = Buffer.from(JSON.stringify(input.bundleJson), 'utf8');
  const payloadSha256 = createHash('sha256').update(rawBytes).digest('hex');

  // Check idempotency
  if (input.idempotencyKey) {
    const existing = await q.query<{ id: string; transaction_status: string }>(
      `SELECT id, transaction_status FROM fhir_exchange_transaction
       WHERE org_id = $1 AND idempotency_key = $2`,
      [input.orgId, input.idempotencyKey]
    );
    if (existing.rows[0] && existing.rows[0].transaction_status === 'COMPLETED') {
      const docRes = await q.query<{ id: string }>(
        `SELECT id FROM document WHERE org_id = $1 AND patient_id = $2 AND content_sha256 = $3`,
        [input.orgId, input.patientId, Buffer.from(payloadSha256, 'hex')]
      );
      return {
        transactionId: existing.rows[0].id,
        documentId: docRes.rows[0]?.id ?? '',
        importedFactsCount: 0,
        conflictsDetected: 0,
        isDuplicate: true,
      };
    }
  }

  // Record pending inbound transaction
  const tx = await recordExchangeTransaction(q, {
    orgId: input.orgId,
    patientId: input.patientId,
    endpointId: input.endpointId,
    direction: 'INBOUND_IMPORT',
    bundleType: typeof input.bundleJson.type === 'string' ? input.bundleJson.type : 'document',
    payloadSha256,
    status: 'INITIATED',
    idempotencyKey: input.idempotencyKey,
    userId: input.userId,
  });

  try {
    // 1. Ingest as structured document in document table
    const docFilename = `fhir-${input.bundleJson.id || randomUUID().slice(0, 8)}.json`;
    const docResult = await createDocument(q, deps.storage, {
      orgId: input.orgId,
      patientId: input.patientId,
      uploadedBy: input.userId,
      filename: docFilename,
      mimeType: 'application/fhir+json',
      content: rawBytes,
      sourceKind: 'fhir_document',
      issuingFacility: input.defaultOriginFacility ?? 'External Hospital HIS',
      recordOrigin: 'external_hospital',
    });

    const docId = docResult.documentId;

    // 2. Ingest document pages & spans via pipeline
    await ingestDocument(q, { storage: deps.storage, ocr: deps.ocr, extractor: deps.extractor }, docId);

    // 3. Parse domain candidates using typed FhirImporter
    const importResult = FhirImporter.importBundle(input.bundleJson, {
      orgId: input.orgId,
      patientId: input.patientId,
      defaultOriginFacility: input.defaultOriginFacility,
    });

    let importedFactsCount = 0;
    let conflictsDetected = 0;

    // Fetch generated text spans for the ingested fhir document
    const spansRes = await q.query<{ id: string; text: string }>(
      `SELECT id, text FROM text_span WHERE document_id = $1 ORDER BY span_index ASC`,
      [docId]
    );
    const spans = spansRes.rows;

    for (const cand of importResult.facts) {
      // Find matching span or use first span as anchor
      const quoteLower = cand.verbatimQuote.toLowerCase();
      const matchingSpan = spans.find((s) => s.text.toLowerCase().includes(quoteLower) || quoteLower.includes(s.text.toLowerCase())) || spans[0];

      if (!matchingSpan) {
        continue;
      }

      // Insert fact through ledger service
      const insertResult = await insertFact(q, {
        orgId: input.orgId,
        patientId: input.patientId,
        documentId: docId,
        factType: cand.factType,
        value: cand.value,
        verbatimQuote: matchingSpan.text,
        spanIds: [matchingSpan.id],
        extractorKind: 'rule',
        extractorName: 'fhir_r4_importer',
        extractorVersion: '1.0.0',
        confidenceRaw: 1.0,
        observedOn: cand.observedOn ?? null,
        createdBy: input.userId,
      });

      if (!insertResult.ok) {
        continue;
      }

      const factId = insertResult.factId;

      // Link FHIR identity in fhir_resource_link
      await linkFhirResource(q, {
        orgId: input.orgId,
        patientId: input.patientId,
        endpointId: input.endpointId,
        resourceType: cand.provenance.resourceType,
        externalResourceId: cand.provenance.resourceId,
        versionId: cand.provenance.versionId ?? null,
        elementPath: cand.provenance.elementPath,
        rawResourceSha256: cand.provenance.rawResourceSha256,
        internalEntityKind: 'evidence_fact',
        internalEntityId: factId,
        userId: input.userId,
      });

      // Detect conflicts
      const conflicts = await detectAndRecordConflicts(q, input.orgId, input.patientId);
      if (conflicts && conflicts.created > 0) {
        conflictsDetected += conflicts.created;
      }

      importedFactsCount++;
    }

    // Mark transaction completed
    await q.query(
      `UPDATE fhir_exchange_transaction
       SET transaction_status = 'COMPLETED', resources_count = $2, completed_at = now()
       WHERE id = $1`,
      [tx.transactionId, importedFactsCount]
    );

    return {
      transactionId: tx.transactionId,
      documentId: docId,
      importedFactsCount,
      conflictsDetected,
      isDuplicate: false,
    };
  } catch (err: unknown) {
    console.error('importExternalFhirBundle original error:', err);
    try {
      await q.query(
        `UPDATE fhir_exchange_transaction
         SET transaction_status = 'FAILED', error_message = $2, completed_at = now()
         WHERE id = $1`,
        [tx.transactionId, err instanceof Error ? err.message : String(err)]
      );
    } catch {
      // Transaction already aborted
    }
    throw err;
  }
}

export async function exportPatientFhirBundle(
  q: Querier,
  input: ExportPatientFhirBundleInput
): Promise<{
  transactionId: string;
  bundle: Record<string, unknown>;
  sha256: string;
}> {
  // Check consent if given
  if (input.consentId) {
    const consentRes = await q.query<{ status: string; expires_at: Date | null }>(
      `SELECT status, expires_at FROM abdm_consent_request
       WHERE org_id = $1 AND id = $2`,
      [input.orgId, input.consentId]
    );
    const consent = consentRes.rows[0];
    if (!consent) {
      throw new Error('consent_not_found');
    }
    const isExpired = consent.expires_at && new Date(consent.expires_at) < new Date();
    if (consent.status !== 'GRANTED' || isExpired) {
      throw new Error(`consent_not_granted_or_expired: status=${consent.status}, expired=${Boolean(isExpired)}`);
    }
  }

  // Fetch patient details
  const patRes = await q.query<{
    id: string;
    demo_code: string;
    display_name: string;
  }>(
    `SELECT id, demo_code, display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.patientId]
  );
  const pat = patRes.rows[0];
  if (!pat) {
    throw new Error('patient_not_found');
  }

  // Fetch identifiers (MRN, ABHA)
  const identsRes = await q.query<{ system: string; value: string }>(
    `SELECT system, value FROM patient_identifier WHERE org_id = $1 AND patient_id = $2`,
    [input.orgId, input.patientId]
  );
  const mrn = identsRes.rows.find((i) => i.system.toLowerCase() === 'mrn')?.value || pat.demo_code;
  const abha = identsRes.rows.find((i) => i.system.toLowerCase().includes('abha'))?.value;

  // Fetch facts
  const verifiedClause = input.verifiedOnly !== false ? `AND coalesce(es.state, 'extracted') = 'verified'` : '';
  const factsRes = await q.query<{
    id: string;
    fact_type: string;
    state: string;
    slot_key: string;
    value_json: FactValue;
    verbatim_quote: string;
    observed_on: string | null;
    created_at: Date;
  }>(
    `SELECT ef.id, ef.fact_type, coalesce(es.state, 'extracted') AS state, ef.slot_key,
            ef.value_json, ef.verbatim_quote, ef.observed_on, ef.created_at
     FROM evidence_fact ef
     LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
     WHERE ef.org_id = $1 AND ef.patient_id = $2 ${verifiedClause}
     ORDER BY ef.observed_on ASC NULLS LAST, ef.created_at ASC`,
    [input.orgId, input.patientId]
  );

  const facts: ExportableFact[] = factsRes.rows.map((f) => ({
    id: f.id,
    factType: f.fact_type as FactType,
    state: (f.state as 'verified' | 'reconciled' | 'extracted') ?? 'extracted',
    value: f.value_json,
    verbatimQuote: f.verbatim_quote,
    observedOn: f.observed_on,
  }));

  // Fetch active clinician
  const userRes = await q.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM app_user WHERE id = $1`,
    [input.userId]
  );
  const clinician = userRes.rows[0] ?? {
    id: input.userId,
    display_name: 'Dr. Clinician',
  };

  // Generate standard bundle
  const bundle = FhirExporter.exportPatientRecord({
    patient: {
      id: pat.id,
      name: pat.display_name,
      identifier: mrn,
      abhaAddress: abha,
    },
    organization: {
      id: input.orgId,
      name: 'Regional Cancer Institute (RCI)',
      identifier: 'ROHINI-001',
    },
    practitioner: {
      id: clinician.id,
      name: clinician.display_name,
      qualification: 'MD Oncology',
    },
    facts,
    options: {
      exportKind: input.exportKind,
      includeProvenance: true,
      verifiedOnly: input.verifiedOnly !== false,
      custodianOrgId: input.orgId,
    },
  });

  const payloadBytes = Buffer.from(JSON.stringify(bundle), 'utf8');
  const payloadSha256 = createHash('sha256').update(payloadBytes).digest('hex');
  const bundleEntries = Array.isArray(bundle.entry) ? bundle.entry : [];

  // Record outbound transaction
  const tx = await recordExchangeTransaction(q, {
    orgId: input.orgId,
    patientId: input.patientId,
    endpointId: input.endpointId,
    direction: 'OUTBOUND_EXPORT',
    bundleType: input.exportKind === 'mcode_cancer_record' ? 'collection' : 'document',
    payloadSha256,
    status: 'COMPLETED',
    resourcesCount: bundleEntries.length,
    idempotencyKey: input.idempotencyKey,
    userId: input.userId,
  });

  return {
    transactionId: tx.transactionId,
    bundle,
    sha256: payloadSha256,
  };
}
