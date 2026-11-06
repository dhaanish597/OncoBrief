import {
  createDemo,
  createEmptyConnectedState,
  reduce,
  type State,
  type Action,
  type DocumentRecord,
  type Category,
  type Evidence,
  type Check,
} from './domain';
import { PatientPortalApiClient, type PatientPortalSnapshotResponse } from './api-client';
import { OfflineSyncQueue } from './sync-queue';

export interface DemoStorage {
  load(): Promise<State>;
  save(s: State): Promise<void>;
  erase(): Promise<void>;
}

export class DemoRepository {
  readonly mode = 'demo';
  state = createDemo();
  error: 'read' | 'write' | null = null;
  ready = false;
  private queue = Promise.resolve();
  onChange: () => void = () => {};

  constructor(private readonly storage: DemoStorage) {}

  async load() {
    try {
      this.state = await this.storage.load();
      this.error = null;
    } catch {
      this.error = 'read';
    }
    this.ready = true;
    this.onChange();
  }

  apply(action: Action) {
    if (!this.ready || this.error === 'read') throw new Error('storage_recovery_required');
    this.state = reduce(this.state, action);
    const snapshot = this.state;
    this.onChange();
    this.queue = this.queue.then(async () => {
      try {
        await this.storage.save(snapshot);
      } catch {
        this.error = 'write';
        this.onChange();
      }
    });
  }

  async flush() {
    await this.queue;
  }

  async retry() {
    await this.queue;
    if (this.error === 'read') return this.load();
    try {
      await this.storage.save(this.state);
      this.error = null;
    } catch {
      this.error = 'write';
    }
    this.onChange();
  }

  async reset() {
    await this.queue;
    await this.storage.erase();
    this.state = createDemo();
    this.error = null;
    this.onChange();
  }
}

export function defaultConnectedChecks(): Check[] {
  return [
    {
      id: 'conn-c1',
      label: 'Collect previous imaging films or reports (CT/PET/Mammogram)',
      labelTa: 'முந்தைய ஸ்கேன் படங்கள் அல்லது அறிக்கைகளை எடுத்து வாருங்கள்',
      done: false,
      enabled: true,
      optional: false,
    },
    {
      id: 'conn-c2',
      label: 'Carry government photo ID and hospital registration card',
      labelTa: 'அரசு புகைப்பட அடையாள அட்டை மற்றும் மருத்துவமனை அட்டையை எடுத்து வாருங்கள்',
      done: false,
      enabled: true,
      optional: false,
    },
    {
      id: 'conn-c3',
      label: 'List all current prescription and over-the-counter medications',
      labelTa: 'தற்போதைய மருந்துகள் மற்றும் மாத்திரைகளின் பட்டியலை கொண்டு வாருங்கள்',
      done: false,
      enabled: true,
      optional: false,
    },
    {
      id: 'conn-c4',
      label: 'Write down key questions and symptoms for your oncology team',
      labelTa: 'மருத்துவக் குழுவிடம் கேட்க வேண்டிய கேள்விகளை குறித்துக் கொள்ளுங்கள்',
      done: false,
      enabled: true,
      optional: true,
    },
  ];
}

export class ConnectedPatientRepository {
  readonly mode = 'connected';
  state: State = createEmptyConnectedState();
  isAuthenticated = false;
  sessionToken: string | null = null;
  client: PatientPortalApiClient;
  syncQueue: OfflineSyncQueue;
  error: 'read' | 'write' | 'network' | 'unauthorized' | null = null;
  ready = true;
  private preparationCompanionName = '';
  private sessionIdentity: string | null = null;
  onChange: () => void = () => {};

  constructor(options: { client?: PatientPortalApiClient } = {}) {
    this.client = options.client ?? new PatientPortalApiClient();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const savedToken = window.sessionStorage.getItem('oncobrief_portal_token');
      if (savedToken) {
        this.sessionToken = savedToken;
        this.isAuthenticated = true;
        this.client.setToken(savedToken);
      }
    }
    this.syncQueue = new OfflineSyncQueue();
    this.syncQueue.onSessionExpired = () => {
      this.error = 'unauthorized';
      this.isAuthenticated = false;
      this.sessionToken = null;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('oncobrief_portal_token');
        window.sessionStorage.removeItem('oncobrief_portal_mode');
      }
      this.onChange();
    };
    this.syncQueue.onQueueChange = () => {
      this.state.pendingSyncCount = this.syncQueue.size();
      this.onChange();
    };
  }

  async signIn(params: {
    hospitalSlug: string;
    identifier: string;
    otp: string;
    actorRole?: 'patient' | 'caregiver';
  }): Promise<void> {
    // Finish an existing request before createSession can replace the client's bearer token.
    await this.syncQueue.waitForIdle();
    const previousToken = this.client.getToken();
    const sess = await this.client.createSession(params);
    const identity = JSON.stringify([sess.organization.id, sess.patient.id, sess.actorRole, sess.caregiverContactId ?? null]);
    if (this.syncQueue.size() > 0 && identity !== this.sessionIdentity) {
      try { await this.client.revokeSession(); } catch { /* Rejected replacement session cannot use the pending queue. */ }
      this.client.setToken(previousToken);
      this.isAuthenticated = false;
      this.error = 'unauthorized';
      this.onChange();
      throw new Error('Pending hospital changes belong to another patient. Explicitly discard them before switching accounts.');
    }
    if (this.sessionIdentity !== identity) this.state = createEmptyConnectedState();
    this.sessionIdentity = identity;
    this.sessionToken = sess.token;
    this.isAuthenticated = true;
    this.state.connectedHospital = sess.organization;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('oncobrief_portal_token', sess.token);
      window.sessionStorage.setItem('oncobrief_portal_mode', 'connected');
    }
    await this.refreshSnapshot();
  }

  async signOut(): Promise<void> {
    await this.syncQueue.waitForIdle();
    try {
      await this.client.revokeSession();
    } catch {
      // Best-effort server revocation
    }
    this.sessionToken = null;
    this.isAuthenticated = false;
    this.syncQueue.clear();
    this.sessionIdentity = null;
    this.client.setToken(null);
    this.state = createEmptyConnectedState();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('oncobrief_portal_token');
      window.sessionStorage.removeItem('oncobrief_portal_mode');
    }
    this.error = null;
    this.onChange();
  }

  async refreshSnapshot(): Promise<void> {
    try {
      const snap = await this.client.getSnapshot();
      this.hydrateSnapshot(snap);
      this.error = null;
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 401) {
        this.error = 'unauthorized';
        this.isAuthenticated = false;
        this.sessionToken = null;
      } else {
        this.error = 'network';
      }
      this.onChange();
      throw err;
    }
  }

  hydrateSnapshot(snapshot: PatientPortalSnapshotResponse) {
    const hasPendingPreparation = this.syncQueue.peekAll().some((item) => item.action.type === 'preparation');
    if (!hasPendingPreparation) this.preparationCompanionName = snapshot.preparation?.companionName ?? '';
    const documents: DocumentRecord[] = (snapshot.documents ?? []).map((d) => ({
      id: d.id,
      name: d.filename ?? d.originalFilename ?? 'Document',
      category: (d.documentType?.includes('pathology') ? 'pathology' : 'other') as Category,
      date: d.documentDate ?? '',
      facility: d.issuingFacility ?? '',
      mimeType: d.mimeType,
      size: d.byteSize,
      version: null,
      extraction: 'unavailable',
      patientReviewed: d.patientReviewStatus === 'confirmed_by_patient',
      clinicianVerified: d.clinicianStatus === 'verified',
      addedAt: null,
    }));

    const ledger: Evidence[] = (snapshot.timeline ?? []).filter((t) => t.state !== 'rejected' && t.state !== 'superseded').map((t) => ({
      id: t.id,
      kind: 'document',
      title: t.title,
      titleTa: t.title,
      date: t.date ?? '',
      status: t.state === 'verified' || t.state === 'corrected' ? 'clinician-confirmed' : t.state === 'conflicting' ? 'conflicting' : 'extracted',
      source: {
        documentId: t.sourceDocumentId,
        page: t.sourcePage ?? null,
        quote: t.quote ?? null,
        version: typeof t.documentVersion === 'number' ? String(t.documentVersion) : null,
        method: t.extractionMethod ?? null,
        confidence: null,
        evidenceFactId: t.evidenceFactId ?? null,
        spanId: t.sourceSpanId ?? null,
        extractorName: t.extractorName ?? null,
        extractorVersion: t.extractorVersion ?? null,
        extractedAt: t.extractedAt ?? null,
        reviewer: t.reviewerId ?? null,
        reviewedAt: t.reviewedAt ?? null,
        documentName: t.sourceDocumentName ?? null,
      },
    }));

    const continuityMessages = (snapshot.continuityMessages ?? []).map((m) => ({
      id: m.id,
      locale: m.locale,
      body: m.body ?? m.bodyRendered ?? '',
      approvedAt: m.approvedAt,
    }));

    const diagnosis = snapshot.summary?.diagnosis ?? snapshot.patient?.diagnosis ?? '';
    const journeyStage = snapshot.summary?.journeyStage ?? snapshot.patient?.stage ?? '';

    const checksFromJson = Array.isArray(snapshot.preparation?.checksJson)
      ? snapshot.preparation.checksJson.map((c, i) => ({
          id: c.id ?? `prep-c-${i}`,
          label: c.label ?? c.title ?? 'Preparation item',
          labelTa: c.labelTa,
          done: !!c.done,
          enabled: c.enabled !== false,
          optional: !!c.optional,
        }))
      : [];

    const checks: Check[] = checksFromJson.length > 0
      ? checksFromJson
      : this.state.checks && this.state.checks.length > 0
      ? this.state.checks
      : defaultConnectedChecks();

    const questions = (
      snapshot.preparation?.questionsJson ??
      snapshot.preparation?.questions ??
      this.state.questions ??
      []
    ).map((q, i) => ({
      id: q.id ?? `q-${i}`,
      text: q.text ?? '',
      answered: !!q.answered,
      at: q.at ?? new Date().toISOString(),
    }));

    this.state = {
      ...this.state,
      mode: 'connected',
      patientName: snapshot.patient.displayName,
      patientNameTa: snapshot.patient.displayName,
      mrn: snapshot.patient.mrn ?? '',
      diagnosis,
      diagnosisTa: diagnosis,
      journeyStage,
      journeyStageTa: journeyStage,
      documents,
      ledger,
      checks: hasPendingPreparation ? this.state.checks : checks,
      questions: hasPendingPreparation ? this.state.questions : questions,
      notes: hasPendingPreparation ? this.state.notes : snapshot.preparation?.symptomNotes ?? this.state.notes ?? '',
      packSelected: hasPendingPreparation ? this.state.packSelected : snapshot.preparation?.packSelectedDocumentIds ?? this.state.packSelected ?? [],
      appointments: snapshot.appointments ?? [],
      continuityMessages,
      tasks: (snapshot.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category ?? 'record_gap',
        status: t.status,
        dueDate: t.dueDate ?? t.dueOn ?? undefined,
        description: t.description ?? t.detail ?? undefined,
      })),
      caregivers: snapshot.caregivers ?? [],
      shareGrants: snapshot.shareGrants ?? [],
      lastSyncedAt: snapshot.lastSyncedAt ?? new Date().toISOString(),
      pendingSyncCount: this.syncQueue.size(),
    };
    this.onChange();
  }

  apply(action: Action) {
    // 1. Optimistic local state update via canonical domain reducer
    this.state = reduce(this.state, action);

    // Only explicit server saves enter the queue; local drafts and display preferences stay local.
    if (['question', 'editQuestion', 'removeQuestion', 'answer', 'notes', 'check', 'enableCheck', 'addCheck', 'selectPack'].includes(action.type)) {
      this.syncQueue.enqueue({ type: 'preparation', preparation: {
        questions: this.state.questions,
        symptomNotes: this.state.notes,
        companionName: this.preparationCompanionName,
        packSelectedDocumentIds: this.state.packSelected,
        checks: this.state.checks,
      } });
    } else if (action.type === 'review' || action.type === 'flag') {
      this.syncQueue.enqueue(action);
    } else {
      this.onChange();
      return;
    }
    this.state.pendingSyncCount = this.syncQueue.size();
    this.onChange();

    // 3. Attempt async flush if online
    void this.flush().catch(() => {});
  }

  async flush() {
    if (this.error === 'unauthorized') return;
    await this.syncQueue.flush(this.client);
  }

  async retry() {
    await this.flush();
    if (this.syncQueue.size() > 0) return;
    if (this.isAuthenticated) {
      await this.refreshSnapshot();
    }
  }

  async reset() {
    await this.signOut();
  }
}
