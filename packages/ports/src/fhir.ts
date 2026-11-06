/**
 * FHIR R4 Client & Interoperability Port Contracts
 *
 * Defines typed interfaces for bidirectional communication with external
 * hospital EMR/HIS systems adhering to HL7 FHIR Release 4 (v4.0.1).
 */

export interface FhirResourceIdentity {
  resourceType: string;
  id: string;
  versionId?: string;
  lastUpdated?: string;
  systemUrl?: string;
}

export interface FhirOperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics?: string;
  expression?: string[];
}

export interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  id?: string;
  issue: FhirOperationOutcomeIssue[];
}

export interface FhirSearchSet<T = Record<string, unknown>> {
  resourceType: 'Bundle';
  type: 'searchset';
  total?: number;
  entry?: Array<{
    fullUrl?: string;
    resource: T;
  }>;
}

export interface FhirTransactionResponse {
  resourceType: 'Bundle';
  type: 'transaction-response' | 'batch-response';
  entry: Array<{
    response: {
      status: string;
      location?: string;
      etag?: string;
      lastModified?: string;
      outcome?: FhirOperationOutcome;
    };
    resource?: Record<string, unknown>;
  }>;
}

export interface FhirCapabilityStatement {
  resourceType: 'CapabilityStatement';
  status: string;
  date: string;
  fhirVersion: string;
  format: string[];
  rest: Array<{
    mode: 'server' | 'client';
    resource?: Array<{
      type: string;
      interaction?: Array<{ code: string }>;
    }>;
  }>;
}

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

export interface FhirClientOptions {
  baseUrl: string;
  authKind?: 'none' | 'bearer' | 'basic' | 'smart_on_fhir' | 'mTLS';
  authToken?: string;
  username?: string;
  password?: string;
  allowedHostnames?: string[];
  timeoutMs?: number;
  maxRetries?: number;
}

export interface FhirClientPort {
  readonly name: string;
  getCapabilityStatement(): Promise<FhirCapabilityStatement>;
  readResource<T = Record<string, unknown>>(resourceType: string, id: string): Promise<{ resource: T; etag?: string }>;
  searchResources<T = Record<string, unknown>>(resourceType: string, params: Record<string, string>): Promise<FhirSearchSet<T>>;
  createResource<T = Record<string, unknown>>(resourceType: string, resource: T): Promise<{ id: string; versionId?: string; etag?: string; resource: T }>;
  updateResource<T = Record<string, unknown>>(resourceType: string, id: string, resource: T, ifMatchVersion?: string): Promise<{ id: string; versionId?: string; etag?: string; resource: T }>;
  submitBundle(bundle: Record<string, unknown>): Promise<FhirTransactionResponse>;
}
