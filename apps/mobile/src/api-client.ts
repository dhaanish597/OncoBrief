/**
 * PatientPortalApiClient
 *
 * Typed client for all /api/v1/patient-portal/* endpoints implemented in M2.
 * Communicates with the OncoBrief Next.js backend with Bearer authentication.
 */

export interface PatientPortalSessionResponse {
  token: string;
  patient: {
    id: string;
    displayName: string;
    mrn: string;
    dateOfBirth?: string;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
  };
  actorRole: 'patient' | 'caregiver';
  caregiverContactId?: string | null;
  grantedScopes: string[];
  expiresAt?: string;
}

export interface PatientPortalSnapshotResponse {
  patient: {
    id: string;
    displayName: string;
    mrn: string;
    dateOfBirth?: string;
    gender?: string;
    primaryPhone?: string;
  };
  summary: {
    diagnosis: string;
    journeyStage: string;
    readinessScore: { done: number; total: number };
  };
  documents: {
    id: string;
    filename: string;
    documentDate: string | null;
    issuingFacility: string | null;
    mimeType: string;
    byteSize: number;
    sha256Hex: string;
    clinicianStatus: 'verified' | 'pending_clinician_review' | 'processing';
    patientReviewStatus: 'unreviewed' | 'confirmed_by_patient' | 'discrepancy_flagged';
    recordOrigin: string;
  }[];
  timeline: {
    id: string;
    title: string;
    date: string;
    category: string;
    sourceDocumentId: string;
    quote: string;
  }[];
  appointments: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
    clinicianName: string;
    department: string;
    tokenNumber?: string;
    estimatedWaitMinutes?: number;
    canConfirmAttendance: boolean;
  }[];
  continuityMessages: {
    id: string;
    locale: string;
    body: string;
    approvedAt: string;
  }[];
  preparation: {
    questions: { id: string; text: string; answered: boolean; at: string }[];
    symptomNotes: string;
    companionName: string;
    packSelectedDocumentIds: string[];
  };
  caregivers: {
    id: string;
    fullName: string;
    relationship: string;
    phoneNumber: string;
    isActive: boolean;
    scopes: string[];
  }[];
  shareGrants: {
    id: string;
    recipientLabel: string;
    expiresAt: string;
    sharedDocumentIds: string[];
    isRevoked: boolean;
  }[];
  tasks?: {
    id: string;
    title: string;
    category: string;
    status: string;
    dueDate?: string;
    description?: string;
  }[];
  lastSyncedAt?: string;
}

export interface ApiClientOptions {
  baseUrl?: string;
  token?: string | null;
}

export class PatientPortalApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    this.token = options.token ?? null;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...((init.headers as Record<string, string>) || {}),
    };

    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const err = new Error(
        (body as { error?: { message?: string } })?.error?.message ??
          `API request failed with status ${res.status}`,
      );
      (err as { status?: number }).status = res.status;
      (err as { body?: unknown }).body = body;
      throw err;
    }

    return (await res.json()) as T;
  }

  // 1. Session API
  async createSession(params: {
    hospitalSlug: string;
    identifier: string;
    otp: string;
    actorRole?: 'patient' | 'caregiver';
  }): Promise<PatientPortalSessionResponse> {
    const res = await this.request<PatientPortalSessionResponse>('/api/v1/patient-portal/session', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.token = res.token;
    return res;
  }

  async getSession(): Promise<PatientPortalSessionResponse> {
    return this.request<PatientPortalSessionResponse>('/api/v1/patient-portal/session', {
      method: 'GET',
    });
  }

  async revokeSession(): Promise<{ ok: boolean }> {
    try {
      const res = await this.request<{ ok: boolean }>('/api/v1/patient-portal/session', {
        method: 'DELETE',
      });
      return res;
    } finally {
      this.token = null;
    }
  }

  // 2. Snapshot API
  async getSnapshot(): Promise<PatientPortalSnapshotResponse> {
    return this.request<PatientPortalSnapshotResponse>('/api/v1/patient-portal/snapshot', {
      method: 'GET',
    });
  }

  // 3. Document APIs
  async getDocumentPage(
    documentId: string,
    pageNumber: number,
  ): Promise<{ pageNumber: number; text: string; hasAttachment: boolean }> {
    const res = await this.request<any>(`/api/v1/patient-portal/documents/${documentId}/pages/${pageNumber}`, {
      method: 'GET',
    });
    return {
      pageNumber: res.page?.pageNumber ?? res.pageNumber ?? pageNumber,
      text: res.page?.plainText ?? res.text ?? '',
      hasAttachment: !!res.documentUrl,
    };
  }

  async uploadDocument(params: {
    filename: string;
    contentBase64: string;
    documentDate?: string;
    issuingFacility?: string;
    fulfillsTaskId?: string;
  }): Promise<{
    documentId: string;
    filename: string;
    clinicianStatus: string;
    mimeType: string;
  }> {
    return this.request('/api/v1/patient-portal/documents', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async reviewDocument(documentId: string): Promise<{ documentId: string; reviewStatus: string }> {
    return this.request(`/api/v1/patient-portal/documents/${documentId}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewStatus: 'confirmed_by_patient' }),
    });
  }

  async flagDiscrepancy(params: {
    documentId: string;
    fieldName?: string;
    patientReason: string;
  }): Promise<{ flagId: string; documentId: string; taskId: string; status: string }> {
    return this.request('/api/v1/patient-portal/flags', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 4. Preparation API
  async syncPreparation(params: {
    questions: { id: string; text: string; answered: boolean; at: string }[];
    symptomNotes: string;
    companionName: string;
    packSelectedDocumentIds: string[];
  }): Promise<{ updated: boolean }> {
    return this.request('/api/v1/patient-portal/preparation', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  async updatePreparation(params: {
    questions: { id: string; text: string; answered: boolean; at: string }[];
    symptomNotes: string;
    companionName: string;
    packSelectedDocumentIds: string[];
  }): Promise<{ updated: boolean }> {
    return this.syncPreparation(params);
  }

  // 5. Attendance API
  async confirmAttendance(params: {
    appointmentId: string;
    action: 'confirm' | 'request_reschedule';
    note?: string;
    preferredDateWindow?: string;
  }): Promise<{ appointmentId: string; status?: string; taskId?: string; action: string }> {
    return this.request('/api/v1/patient-portal/attendance', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 6. Caregivers API
  async getCaregivers(): Promise<{
    caregivers: {
      id: string;
      fullName: string;
      relationship: string;
      phoneNumber: string;
      preferredLocale: string;
      syncReminders: boolean;
      scopes: string[];
    }[];
  }> {
    return this.request('/api/v1/patient-portal/caregivers', {
      method: 'GET',
    });
  }

  async addCaregiver(params: {
    fullName: string;
    relationship: string;
    phoneNumber: string;
    preferredLocale?: string;
    syncReminders?: boolean;
    scopes?: string[];
  }): Promise<{ caregiver: { id: string; fullName: string; relationship: string; scopes?: string[] } }> {
    return this.request('/api/v1/patient-portal/caregivers', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async revokeCaregiver(caregiverId: string): Promise<{ caregiverId: string; revoked: boolean }> {
    return this.request(`/api/v1/patient-portal/caregivers?id=${caregiverId}`, {
      method: 'DELETE',
    });
  }

  // 7. Scoped Voice TTS API
  async synthesizeVoiceTts(params: {
    messageId: string;
    language?: 'en' | 'ta' | 'en-IN' | 'ta-IN';
  }): Promise<{
    audioBase64?: string;
    mimeType?: string;
    language: string;
    durationEstimateMs?: number;
    transcript?: string;
    fallbackText?: string;
  }> {
    return this.request('/api/v1/patient-portal/voice-tts', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 8. Coordinator Requests API
  async getRequests(): Promise<{
    requests: { id: string; title: string; detail: string | null; status: string; createdAt: string }[];
  }> {
    return this.request('/api/v1/patient-portal/requests', {
      method: 'GET',
    });
  }

  async createRequest(params: {
    title: string;
    detail?: string;
    category?: string;
  }): Promise<{ requestId: string; title: string; status: string; createdAt: string }> {
    return this.request('/api/v1/patient-portal/requests', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async createCoordinatorRequest(params: {
    title: string;
    description?: string;
    detail?: string;
    category?: string;
  }): Promise<{ id: string; title: string; category?: string; status: string; createdAt: string }> {
    const res = await this.createRequest({
      title: params.title,
      detail: params.description ?? params.detail,
      category: params.category,
    });
    return {
      id: res.requestId,
      title: res.title,
      category: params.category,
      status: res.status,
      createdAt: res.createdAt,
    };
  }

  // 9. Revocable Share Grants API
  async createShareGrant(params: {
    recipientLabel: string;
    recipientRole?: 'caregiver' | 'second_opinion_clinician' | 'self_print';
    sharedDocumentIds: string[];
    includeQuestions?: boolean;
    expiresInHours?: number;
    durationHours?: number;
  }): Promise<{
    grantId: string;
    shareToken: string;
    expiresAt: string;
    shareUrl: string;
    grant: { id: string; recipientLabel: string; expiresAt: string; sharedDocumentIds: string[]; isRevoked: boolean };
  }> {
    const hours = params.expiresInHours ?? params.durationHours ?? 72;
    const res = await this.request<{ grantId: string; shareToken: string; expiresAt: string; shareUrl: string }>(
      '/api/v1/patient-portal/shares',
      {
        method: 'POST',
        body: JSON.stringify({
          recipientLabel: params.recipientLabel,
          recipientRole: params.recipientRole,
          sharedDocumentIds: params.sharedDocumentIds,
          includeQuestions: params.includeQuestions,
          expiresInHours: hours,
        }),
      },
    );
    return {
      ...res,
      grant: {
        id: res.grantId,
        recipientLabel: params.recipientLabel,
        expiresAt: res.expiresAt,
        sharedDocumentIds: params.sharedDocumentIds,
        isRevoked: false,
      },
    };
  }

  async revokeShareGrant(grantId: string): Promise<{ grantId: string; revoked: boolean }> {
    return this.request(`/api/v1/patient-portal/shares?id=${grantId}`, {
      method: 'DELETE',
    });
  }

  /** Generic mutation dispatcher for OfflineSyncQueue */
  async executeMutation(item: {
    action: {
      type: string;
      id?: string;
      reason?: string;
      params?: Record<string, unknown>;
    };
    idempotencyKey?: string;
  }): Promise<unknown> {
    const { action, idempotencyKey } = item;
    const headers = idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {};

    switch (action.type) {
      case 'review':
        return this.reviewDocument(action.id!);
      case 'flag':
        return this.flagDiscrepancy({
          documentId: action.id!,
          patientReason: action.reason ?? 'Flagged discrepancy',
        });
      case 'attendance':
        return this.confirmAttendance({
          appointmentId: action.id!,
          action: 'confirm',
        });
      default:
        return { ok: true };
    }
  }
}
