/**
 * ABDM V3 Gateway & FHIR Transfer Port (M2 HIP + M3 HIU)
 *
 * Defines the contract for communicating with the ABDM HIE-CM V3 Gateway
 * and peer facilities for health information exchange.
 */

export interface AbdmGatewayResponse {
  requestId: string;
  status: 'accepted' | 'acknowledged' | 'failed';
  error?: {
    code: number | string;
    message: string;
  };
}

export interface AbdmKeyMaterial {
  cryptoAlg: 'ECDH';
  curve: 'Curve25519';
  dhPublicKey: {
    expiry: string;
    parameters: string;
    keyValue: string;
  };
  nonce: string;
}

export interface GenerateLinkTokenInput {
  requestId: string;
  timestamp: string;
  abhaNumber?: string | null;
  abhaAddress: string;
  name: string;
  gender: 'M' | 'F' | 'O' | 'U';
  yearOfBirth: number;
}

export interface LinkCareContextInput {
  requestId: string;
  timestamp: string;
  linkToken: string;
  abhaAddress: string;
  abhaNumber?: string | null;
  patientReference: string;
  patientDisplay: string;
  careContexts: Array<{
    referenceNumber: string;
    display: string;
  }>;
}

export interface OnDiscoverPatientInput {
  requestId: string;
  timestamp: string;
  inboundRequestId: string;
  transactionId: string;
  patient?: {
    referenceNumber: string;
    display: string;
    careContexts: Array<{
      referenceNumber: string;
      display: string;
    }>;
    matchedBy?: string[];
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface OnInitUserLinkInput {
  requestId: string;
  timestamp: string;
  inboundRequestId: string;
  transactionId: string;
  linkReferenceNumber: string;
  medium: 'MOBILE' | 'EMAIL';
  hint: string;
  expiry: string;
}

export interface OnConfirmUserLinkInput {
  requestId: string;
  timestamp: string;
  inboundRequestId: string;
  patient?: {
    referenceNumber: string;
    display: string;
    careContexts: Array<{
      referenceNumber: string;
      display: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface OnHipConsentNotifyInput {
  requestId: string;
  timestamp: string;
  inboundRequestId: string;
  consentId: string;
  status: 'OK';
}

export interface OnHealthInfoRequestInput {
  requestId: string;
  timestamp: string;
  inboundRequestId: string;
  transactionId: string;
  sessionStatus: 'ACKNOWLEDGED' | 'FAILED';
  error?: {
    code: number;
    message: string;
  };
}

export interface AbdmEncryptedEntry {
  content: string;
  media: 'application/fhir+json';
  checksum: string;
  careContextReference: string;
}

export interface AbdmDataPushPayload {
  pageNumber: number;
  pageCount: number;
  transactionId: string;
  entries: AbdmEncryptedEntry[];
  keyMaterial: AbdmKeyMaterial;
}

export interface TransferNotifyInput {
  requestId: string;
  timestamp: string;
  notifier: {
    type: 'HIP' | 'HIU';
    id: string;
  };
  statusNotification: {
    sessionStatus: 'TRANSFERRED' | 'FAILED';
    hipId?: string;
    statusResponses?: Array<{
      careContextReference: string;
      hiStatus: 'OK' | 'DELIVERED' | 'FAILED';
      description?: string;
    }>;
  };
}

export interface InitiateConsentRequestInput {
  requestId: string;
  timestamp: string;
  patientAbhaAddress: string;
  purposeCode: string;
  purposeText: string;
  hiTypes: string[];
  dateRange: {
    from: string;
    to: string;
  };
  dataEraseAt: string;
  requester: {
    name: string;
    hprId?: string;
  };
  hipId?: string | null;
}

export interface OnHiuConsentNotifyInput {
  requestId: string;
  timestamp: string;
  inboundRequestId: string;
  acknowledgement: Array<{
    status: 'OK';
    consentId: string;
  }>;
}

export interface FetchConsentArtifactInput {
  requestId: string;
  timestamp: string;
  consentId: string;
}

export interface RequestHealthInformationInput {
  requestId: string;
  timestamp: string;
  consentId: string;
  dateRange: {
    from: string;
    to: string;
  };
  dataPushUrl: string;
  keyMaterial: AbdmKeyMaterial;
}

export interface AbdmGatewayPort {
  readonly driver: 'simulated' | 'sandbox';
  getSessionToken(): Promise<string>;
  registerBridgeUrl(url: string): Promise<boolean>;

  // M2 HIP
  generateLinkToken(input: GenerateLinkTokenInput): Promise<AbdmGatewayResponse>;
  linkCareContext(input: LinkCareContextInput): Promise<AbdmGatewayResponse>;
  onDiscoverPatient(input: OnDiscoverPatientInput): Promise<AbdmGatewayResponse>;
  onInitUserLink(input: OnInitUserLinkInput): Promise<AbdmGatewayResponse>;
  onConfirmUserLink(input: OnConfirmUserLinkInput): Promise<AbdmGatewayResponse>;
  onHipConsentNotify(input: OnHipConsentNotifyInput): Promise<AbdmGatewayResponse>;
  onHealthInfoRequest(input: OnHealthInfoRequestInput): Promise<AbdmGatewayResponse>;
  pushHealthInformation(
    dataPushUrl: string,
    payload: AbdmDataPushPayload,
    bearerToken?: string,
  ): Promise<{ status: number; ok: boolean }>;
  notifyHealthInfoTransferred(input: TransferNotifyInput): Promise<AbdmGatewayResponse>;

  // M3 HIU
  initiateConsentRequest(input: InitiateConsentRequestInput): Promise<AbdmGatewayResponse>;
  onHiuConsentNotify(input: OnHiuConsentNotifyInput): Promise<AbdmGatewayResponse>;
  fetchConsentArtifact(input: FetchConsentArtifactInput): Promise<AbdmGatewayResponse>;
  requestHealthInformation(input: RequestHealthInformationInput): Promise<AbdmGatewayResponse>;
  notifyHiuHealthInfoReceived(input: TransferNotifyInput): Promise<AbdmGatewayResponse>;
}
