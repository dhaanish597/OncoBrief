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

export interface HttpAbdmGatewayOptions {
  baseUrl: string;
  sessionUrl: string;
  cmId: string;
  clientId: string;
  clientSecret: string;
  hipId: string;
  hiuId: string;
  fetchFn?: typeof fetch;
}

export class HttpAbdmGatewayAdapter implements AbdmGatewayPort {
  readonly driver = 'sandbox' as const;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private activeTokenPromise: Promise<string> | null = null;

  constructor(private readonly options: HttpAbdmGatewayOptions) {}

  private get fetch(): typeof fetch {
    return this.options.fetchFn ?? globalThis.fetch;
  }

  async getSessionToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (this.activeTokenPromise) {
      return this.activeTokenPromise;
    }

    this.activeTokenPromise = (async () => {
      try {
        const requestId = randomUUID();
        const timestamp = new Date().toISOString();

        const res = await this.fetch(this.options.sessionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'REQUEST-ID': requestId,
            TIMESTAMP: timestamp,
            'X-CM-ID': this.options.cmId,
          },
          body: JSON.stringify({
            clientId: this.options.clientId,
            clientSecret: this.options.clientSecret,
            grantType: 'client_credentials',
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`abdm_auth_failed: HTTP ${res.status} - ${text}`);
        }

        const data = (await res.json()) as { accessToken?: string; expiresIn?: number };
        if (!data.accessToken) {
          throw new Error('abdm_auth_failed: missing accessToken in response');
        }

        this.cachedToken = data.accessToken;
        const ttlMs = ((data.expiresIn ?? 900) - 60) * 1000;
        this.tokenExpiresAt = Date.now() + Math.max(ttlMs, 60_000);
        return this.cachedToken;
      } finally {
        this.activeTokenPromise = null;
      }
    })();

    return this.activeTokenPromise;
  }

  clearTokenCache(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  private async postGateway(
    path: string,
    body: Record<string, unknown>,
    role: 'HIP' | 'HIU' | 'NONE',
    customHeaders?: Record<string, string>,
    retryOnAuth = true,
  ): Promise<AbdmGatewayResponse> {
    const token = await this.getSessionToken();
    const requestId = (body['requestId'] as string) || randomUUID();
    const timestamp = (body['timestamp'] as string) || new Date().toISOString();

    const url = path.startsWith('http') ? path : `${this.options.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'REQUEST-ID': requestId,
      TIMESTAMP: timestamp,
      'X-CM-ID': this.options.cmId,
      ...customHeaders,
    };

    if (role === 'HIP') {
      headers['X-HIP-ID'] = this.options.hipId;
    } else if (role === 'HIU') {
      headers['X-HIU-ID'] = this.options.hiuId;
    }

    const res = await this.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 401 && retryOnAuth) {
      this.clearTokenCache();
      return this.postGateway(path, body, role, customHeaders, false);
    }

    if (res.status === 200 || res.status === 202) {
      return {
        requestId,
        status: res.status === 200 ? 'acknowledged' : 'accepted',
      };
    }

    const errorBody = (await res.json().catch(() => ({}))) as {
      error?: { code?: string | number; message?: string };
    };
    return {
      requestId,
      status: 'failed',
      error: {
        code: errorBody?.error?.code ?? res.status,
        message: errorBody?.error?.message ?? res.statusText,
      },
    };
  }

  async registerBridgeUrl(bridgeUrl: string): Promise<boolean> {
    const token = await this.getSessionToken();
    const requestId = randomUUID();
    const timestamp = new Date().toISOString();

    const res = await this.fetch(`${this.options.baseUrl.replace(/\/$/, '')}/gateway/v3/bridge/url`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'REQUEST-ID': requestId,
        TIMESTAMP: timestamp,
        'X-CM-ID': this.options.cmId,
      },
      body: JSON.stringify({ url: bridgeUrl }),
    });

    return res.ok;
  }

  // --- M2 HIP -----------------------------------------------------------------

  async generateLinkToken(input: GenerateLinkTokenInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/v3/token/generate-token',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        abhaAddress: input.abhaAddress,
        ...(input.abhaNumber ? { abhaNumber: input.abhaNumber } : {}),
        name: input.name,
        gender: input.gender,
        yearOfBirth: input.yearOfBirth,
      },
      'HIP',
    );
  }

  async linkCareContext(input: LinkCareContextInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/hip/v3/link/carecontext',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        abhaAddress: input.abhaAddress,
        ...(input.abhaNumber ? { abhaNumber: input.abhaNumber } : {}),
        patient: [
          {
            referenceNumber: input.patientReference,
            display: input.patientDisplay,
            hiType: 'OPConsultation',
            count: input.careContexts.length,
            careContexts: input.careContexts,
          },
        ],
      },
      'HIP',
      { 'X-LINK-TOKEN': input.linkToken },
    );
  }

  async onDiscoverPatient(input: OnDiscoverPatientInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/user-initiated-linking/v3/patient/care-context/on-discover',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        transactionId: input.transactionId,
        ...(input.patient
          ? {
              patient: [
                {
                  referenceNumber: input.patient.referenceNumber,
                  display: input.patient.display,
                  hiType: 'OPConsultation',
                  count: input.patient.careContexts.length,
                  careContexts: input.patient.careContexts,
                  matchedBy: input.patient.matchedBy ?? ['MR'],
                },
              ],
            }
          : {}),
        ...(input.error ? { error: input.error } : {}),
        response: { requestId: input.inboundRequestId },
      },
      'HIP',
    );
  }

  async onInitUserLink(input: OnInitUserLinkInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/user-initiated-linking/v3/link/care-context/on-init',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        transactionId: input.transactionId,
        link: {
          referenceNumber: input.linkReferenceNumber,
          authenticationType: 'DIRECT',
          meta: {
            communicationMedium: input.medium,
            communicationHint: input.hint,
            communicationExpiry: input.expiry,
          },
        },
        response: { requestId: input.inboundRequestId },
      },
      'HIP',
    );
  }

  async onConfirmUserLink(input: OnConfirmUserLinkInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/user-initiated-linking/v3/link/care-context/on-confirm',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        ...(input.patient
          ? {
              patient: [
                {
                  referenceNumber: input.patient.referenceNumber,
                  display: input.patient.display,
                  hiType: 'OPConsultation',
                  count: input.patient.careContexts.length,
                  careContexts: input.patient.careContexts,
                },
              ],
            }
          : {}),
        ...(input.error ? { error: input.error } : {}),
        response: { requestId: input.inboundRequestId },
      },
      'HIP',
    );
  }

  async onHipConsentNotify(input: OnHipConsentNotifyInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/consent/v3/request/hip/on-notify',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        acknowledgement: {
          status: input.status,
          consentId: input.consentId,
        },
        response: { requestId: input.inboundRequestId },
      },
      'HIP',
    );
  }

  async onHealthInfoRequest(input: OnHealthInfoRequestInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/data-flow/v3/health-information/hip/on-request',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        hiRequest: {
          transactionId: input.transactionId,
          sessionStatus: input.sessionStatus,
        },
        ...(input.error ? { error: input.error } : {}),
        response: { requestId: input.inboundRequestId },
      },
      'HIP',
    );
  }

  async pushHealthInformation(
    dataPushUrl: string,
    payload: AbdmDataPushPayload,
    bearerToken?: string,
  ): Promise<{ status: number; ok: boolean }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const res = await this.fetch(dataPushUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return { status: res.status, ok: res.ok };
  }

  async notifyHealthInfoTransferred(input: TransferNotifyInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/data-flow/v3/health-information/notify',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        notifier: input.notifier,
        statusNotification: input.statusNotification,
      },
      input.notifier.type,
    );
  }

  // --- M3 HIU -----------------------------------------------------------------

  async initiateConsentRequest(input: InitiateConsentRequestInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/consent/v3/request/init',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        consent: {
          purpose: {
            text: input.purposeText,
            code: input.purposeCode,
            refUri: 'http://terminology.hl7.org/ValueSet/v3-PurposeOfUse',
          },
          patient: {
            id: input.patientAbhaAddress,
          },
          hiu: {
            id: this.options.hiuId,
          },
          requester: {
            name: input.requester.name,
            identifier: {
              type: 'REGNO',
              value: input.requester.hprId ?? 'HPR-DEMO-1001',
              system: 'https://doctor.ndhm.gov.in',
            },
          },
          hiTypes: input.hiTypes,
          permission: {
            accessMode: 'VIEW',
            dateRange: input.dateRange,
            dataEraseAt: input.dataEraseAt,
            frequency: {
              unit: 'HOUR',
              value: 1,
              repeats: 0,
            },
          },
          ...(input.hipId ? { hip: { id: input.hipId } } : {}),
        },
      },
      'HIU',
    );
  }

  async onHiuConsentNotify(input: OnHiuConsentNotifyInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/consent/v3/request/hiu/on-notify',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        acknowledgement: input.acknowledgement,
        response: { requestId: input.inboundRequestId },
      },
      'HIU',
    );
  }

  async fetchConsentArtifact(input: FetchConsentArtifactInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/consent/v3/fetch',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        consentId: input.consentId,
      },
      'HIU',
    );
  }

  async requestHealthInformation(input: RequestHealthInformationInput): Promise<AbdmGatewayResponse> {
    return this.postGateway(
      '/data-flow/v3/health-information/request',
      {
        requestId: input.requestId,
        timestamp: input.timestamp,
        hiRequest: {
          consent: { id: input.consentId },
          dateRange: input.dateRange,
          dataPushUrl: input.dataPushUrl,
          keyMaterial: input.keyMaterial,
        },
      },
      'HIU',
    );
  }

  async notifyHiuHealthInfoReceived(input: TransferNotifyInput): Promise<AbdmGatewayResponse> {
    return this.notifyHealthInfoTransferred(input);
  }
}
