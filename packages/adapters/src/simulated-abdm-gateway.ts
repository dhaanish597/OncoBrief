import { randomUUID } from 'node:crypto';
import type {
  AbdmDataPushPayload,
  AbdmGatewayPort,
  AbdmGatewayResponse,
  FetchConsentArtifactInput,
  GenerateLinkTokenInput,
  InitiateConsentRequestInput,
  LinkCareContextInput,
  OnConfirmUserLinkInput,
  OnDiscoverPatientInput,
  OnHealthInfoRequestInput,
  OnHipConsentNotifyInput,
  OnHiuConsentNotifyInput,
  OnInitUserLinkInput,
  RequestHealthInformationInput,
  TransferNotifyInput,
} from '@oncobrief/ports';
import { encryptPayload, generateEphemeralKeyPair } from './abdm-crypto';

export interface SimulatedGatewayOptions {
  callbackBaseUrl?: string;
  hipId?: string;
  hiuId?: string;
  dispatchDirectHttp?: boolean;
}

export class SimulatedAbdmGatewayAdapter implements AbdmGatewayPort {
  readonly driver = 'simulated' as const;

  private readonly callbackBaseUrl: string;
  private readonly hipId: string;
  private readonly hiuId: string;
  private readonly dispatchDirectHttp: boolean;

  private readonly pending: Array<{ requestId: string; deliver: () => Promise<void> }> = [];
  private readonly drains = new Map<string, Promise<void>>();
  private readonly consents = new Map<string, InitiateConsentRequestInput>();

  /** Drain after the initiating DB transaction commits; callback order is explicit. */
  async flushCallbacks(requestId: string): Promise<void> {
    const active = this.drains.get(requestId);
    if (active) return active;
    const drain = (async () => {
      let index: number;
      while ((index = this.pending.findIndex(event => event.requestId === requestId)) !== -1) {
        await this.pending.splice(index, 1)[0]!.deliver();
      }
    })();
    this.drains.set(requestId, drain);
    try { await drain; }
    finally { this.drains.delete(requestId); }
  }

  // In-memory tracking for simulation assertions
  public readonly recordedCalls: Array<{ method: string; input: unknown }> = [];

  constructor(options?: SimulatedGatewayOptions) {
    this.callbackBaseUrl = (options?.callbackBaseUrl ?? 'http://localhost:3000').replace(/\/$/, '');
    this.hipId = options?.hipId ?? 'ONCOBRIEF-HIP-SBX';
    this.hiuId = options?.hiuId ?? 'ONCOBRIEF-HIU-SBX';
    this.dispatchDirectHttp = options?.dispatchDirectHttp ?? false;
  }

  async getSessionToken(): Promise<string> {
    return 'simulated-abdm-session-token-' + randomUUID();
  }

  async registerBridgeUrl(url: string): Promise<boolean> {
    this.recordedCalls.push({ method: 'registerBridgeUrl', input: { url } });
    return true;
  }

  private dispatchWebhook(path: string, body: Record<string, unknown>, roleHeader: 'HIP' | 'HIU', requestId: string): void {
    if (!this.dispatchDirectHttp) return;
    const url = `${this.callbackBaseUrl}/${path.replace(/^\//, '')}`;
    const inboundRequestId = randomUUID();
    const timestamp = new Date().toISOString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'REQUEST-ID': inboundRequestId,
      TIMESTAMP: timestamp,
      'X-CM-ID': 'sbx',
    };
    if (roleHeader === 'HIP') headers['X-HIP-ID'] = this.hipId;
    else headers['X-HIU-ID'] = this.hiuId;

    this.pending.push({ requestId, deliver: async () => {
      const response = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`simulated_callback_failed:${path}:${response.status}:${await response.text()}`);
    } });
  }

  // --- M2 HIP -----------------------------------------------------------------

  async generateLinkToken(input: GenerateLinkTokenInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'generateLinkToken', input });

    // Simulate async callback: POST /api/v3/hip/token/on-generate-token
    const linkToken = `sim-link-token-${randomUUID()}`;
    this.dispatchWebhook(
      '/api/v3/hip/token/on-generate-token',
      {
        abhaAddress: input.abhaAddress,
        linkToken,
        response: { requestId: input.requestId },
      },
      'HIP', input.requestId,
    );

    return {
      requestId: input.requestId,
      status: 'accepted',
    };
  }

  async linkCareContext(input: LinkCareContextInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'linkCareContext', input });

    // Simulate async callback: POST /api/v3/link/on_carecontext
    this.dispatchWebhook(
      '/api/v3/link/on_carecontext',
      {
        abhaAddress: input.abhaAddress,
        status: 'Successfully Linked care context',
        response: { requestId: input.requestId },
      },
      'HIP', input.requestId,
    );

    return {
      requestId: input.requestId,
      status: 'accepted',
    };
  }

  async onDiscoverPatient(input: OnDiscoverPatientInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'onDiscoverPatient', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  async onInitUserLink(input: OnInitUserLinkInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'onInitUserLink', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  async onConfirmUserLink(input: OnConfirmUserLinkInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'onConfirmUserLink', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  async onHipConsentNotify(input: OnHipConsentNotifyInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'onHipConsentNotify', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  async onHealthInfoRequest(input: OnHealthInfoRequestInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'onHealthInfoRequest', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  async pushHealthInformation(
    dataPushUrl: string,
    payload: AbdmDataPushPayload,
  ): Promise<{ status: number; ok: boolean }> {
    this.recordedCalls.push({ method: 'pushHealthInformation', input: { dataPushUrl, payload } });
    if (this.dispatchDirectHttp) {
      try {
        const res = await fetch(dataPushUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return { status: res.status, ok: res.ok };
      } catch {
        return { status: 503, ok: false };
      }
    }
    return { status: 200, ok: true };
  }

  async notifyHealthInfoTransferred(input: TransferNotifyInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'notifyHealthInfoTransferred', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  // --- M3 HIU -----------------------------------------------------------------

  async initiateConsentRequest(input: InitiateConsentRequestInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'initiateConsentRequest', input });

    const consentRequestId = `sim-cr-${randomUUID()}`;
    const consentArtifactId = `sim-art-${randomUUID()}`;

    this.consents.set(consentArtifactId, input);

    // 1. Simulate callback: on-init
    this.dispatchWebhook(
      '/api/v3/hiu/consent/request/on-init',
      {
        consentRequest: { id: consentRequestId },
        response: { requestId: input.requestId },
      },
      'HIU', input.requestId,
    );

    // 2. Queue the synthetic patient grant after the on-init acknowledgement.
    {
      this.dispatchWebhook(
        '/api/v3/hiu/consent/request/notify',
        {
          notification: {
            consentRequestId,
            status: 'GRANTED',
            consentArtefacts: [{ id: consentArtifactId }],
          },
        },
        'HIU', input.requestId,
      );
    }

    return {
      requestId: input.requestId,
      status: 'accepted',
    };
  }

  async onHiuConsentNotify(input: OnHiuConsentNotifyInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'onHiuConsentNotify', input });
    return { requestId: input.requestId, status: 'accepted' };
  }

  async fetchConsentArtifact(input: FetchConsentArtifactInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'fetchConsentArtifact', input });

    // Simulate callback: on-fetch delivering full consentDetail
    const requested = this.consents.get(input.consentId);
    if (this.dispatchDirectHttp && !requested) throw new Error("simulated_consent_not_found");
    const now = new Date();
    const fromDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = now.toISOString();
    const dataEraseAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    this.dispatchWebhook(
      '/api/v3/hiu/consent/on-fetch',
      {
        consent: {
          status: 'GRANTED',
          consentDetail: {
            schemaVersion: 'v3',
            consentId: input.consentId,
            createdAt: now.toISOString(),
            patient: { id: requested?.patientAbhaAddress ?? 'synthetic.patient@sbx' },
            careContexts: [{ patientReference: 'P-001', careContextReference: 'CC-001' }],
            purpose: { text: 'Care Management', code: 'CAREMGT' },
            hiTypes: requested?.hiTypes ?? ['DiagnosticReport'],
            permission: {
              accessMode: 'VIEW',
              dateRange: requested?.dateRange ?? { from: fromDate, to: toDate },
              dataEraseAt: requested?.dataEraseAt ?? dataEraseAt,
              frequency: { unit: 'HOUR', value: 1, repeats: 0 },
            },
            consentManager: { id: 'sbx' },
            hip: { id: 'SYNTHETIC-HIP' },
            hiu: { id: this.hiuId },
          },
        },
        response: { requestId: input.requestId },
      },
      'HIU', requested?.requestId ?? input.requestId,
    );

    return {
      requestId: input.requestId,
      status: 'accepted',
    };
  }

  async requestHealthInformation(input: RequestHealthInformationInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'requestHealthInformation', input });

    const transactionId = `sim-tx-${randomUUID()}`;

    // 1. Acknowledge via on-request
    this.dispatchWebhook(
      '/api/v3/hiu/health-information/on-request',
      {
        hiRequest: {
          transactionId,
          sessionStatus: 'ACKNOWLEDGED',
        },
        response: { requestId: input.requestId },
      },
      'HIU', input.requestId,
    );

    // 2. Queue encrypted delivery after the transfer acknowledgement.
    if (this.dispatchDirectHttp) this.pending.push({ requestId: input.requestId, deliver: async () => {
      const hipKeys = generateEphemeralKeyPair();

      const syntheticBundle = JSON.stringify({
        resourceType: 'Bundle',
        id: `sim-doc-${randomUUID()}`,
        meta: {
          versionId: '1',
          lastUpdated: new Date().toISOString(),
          profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle'],
        },
        type: 'document',
        timestamp: new Date().toISOString(),
        entry: [
          {
            fullUrl: 'urn:uuid:comp-01',
            resource: {
              resourceType: 'Composition',
              id: 'comp-01',
              status: 'final',
              title: 'SYNTHETIC Laboratory Report (Simulated ABDM Facility)',
              section: [{ title: 'Laboratory', entry: [{ reference: 'urn:uuid:obs-01' }] }],
            },
          },
          {
            fullUrl: 'urn:uuid:obs-01',
            resource: {
              resourceType: 'Observation',
              id: 'obs-01',
              status: 'final',
              code: {
                coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }],
                text: 'Hemoglobin',
              },
              valueQuantity: {
                value: 12.8,
                unit: 'g/dL',
                system: 'http://unitsofmeasure.org',
                code: 'g/dL',
              },
              effectiveDateTime: input.dateRange.to,
            },
          },
        ],
      });

      const encrypted = encryptPayload(
        syntheticBundle,
        hipKeys.privateKey,
        hipKeys.nonceBase64,
        input.keyMaterial.dhPublicKey.keyValue,
        input.keyMaterial.nonce,
      );

      const pushPayload: AbdmDataPushPayload = {
        pageNumber: 0,
        pageCount: 1,
        transactionId,
        entries: [
          {
            content: encrypted.content,
            media: 'application/fhir+json',
            checksum: encrypted.checksum,
            careContextReference: 'CC-001',
          },
        ],
        keyMaterial: hipKeys.keyMaterial,
      };

      const response = await fetch(input.dataPushUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushPayload), signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`simulated_push_failed:${response.status}:${await response.text()}`);
    } });

    return {
      requestId: input.requestId,
      status: 'accepted',
    };
  }

  async notifyHiuHealthInfoReceived(input: TransferNotifyInput): Promise<AbdmGatewayResponse> {
    this.recordedCalls.push({ method: 'notifyHiuHealthInfoReceived', input });
    return { requestId: input.requestId, status: 'accepted' };
  }
}
