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
      optional: false,
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
    const sess = await this.client.createSession(params);
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
    try {
      await this.client.revokeSession();
    } catch {
      // Best-effort server revocation
    }
    this.sessionToken = null;
    this.isAuthenticated = false;
    this.syncQueue.clear();
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
    const documents: DocumentRecord[] = (snapshot.documents ?? []).map((d: any) => ({
      id: d.id,
      name: d.filename ?? d.originalFilename ?? 'Document',
      category: ((d.mimeType?.includes('pdf') || d.documentType?.includes('pathology')) ? 'pathology' : 'laboratory') as Category,
      date: d.documentDate ?? '',
      facility: d.issuingFacility ?? '',
      mimeType: d.mimeType ?? 'application/pdf',
      size: d.byteSize ?? 0,
      version: '1',
      extraction: 'unavailable',
      patientReviewed: d.patientReviewStatus === 'confirmed_by_patient',
      clinicianVerified: d.clinicianStatus === 'verified',
      addedAt: d.documentDate ?? new Date().toISOString(),
    }));

    const ledger: Evidence[] = (snapshot.timeline ?? []).map((t) => ({
      id: t.id,
      kind: 'document',
      title: t.title,
      titleTa: t.title,
      date: t.date,
      status: 'clinician-confirmed',
      source: {
        documentId: t.sourceDocumentId,
        page: 1,
        quote: t.quote,
        version: '1',
        method: 'synthetic-fixture',
        confidence: 'not-applicable',
      },
    }));

    const continuityMessages = (snapshot.continuityMessages ?? []).map((m: any) => ({
      id: m.id,
      locale: m.locale,
      body: m.body ?? m.bodyRendered ?? '',
      approvedAt: m.approvedAt,
    }));

    const diagnosis = snapshot.summary?.diagnosis ?? (snapshot.patient as any)?.diagnosis ?? '';
    const journeyStage = snapshot.summary?.journeyStage ?? (snapshot.patient as any)?.stage ?? '';

    const checksFromJson = Array.isArray(snapshot.preparation?.checksJson)
      ? (snapshot.preparation.checksJson as any[]).map((c, i) => ({
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
      (snapshot.preparation?.questionsJson as any[]) ??
      (snapshot.preparation?.questions as any[]) ??
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
      mrn: snapshot.patient.mrn,
      diagnosis,
      diagnosisTa: diagnosis,
      journeyStage,
      journeyStageTa: journeyStage,
      documents,
      ledger,
      checks,
      questions,
      notes: snapshot.preparation?.symptomNotes ?? this.state.notes ?? '',
      packSelected: snapshot.preparation?.packSelectedDocumentIds ?? this.state.packSelected ?? [],
      appointments: snapshot.appointments ?? [],
      continuityMessages,
      tasks: (snapshot.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category ?? 'record_gap',
        status: t.status,
        dueDate: t.dueDate ?? t.dueOn,
        description: t.description ?? t.detail,
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

    // 2. Enqueue mutation
    this.syncQueue.enqueue(action);
    this.state.pendingSyncCount = this.syncQueue.size();
    this.onChange();

    // 3. Attempt async flush if online
    void this.syncQueue.flush(this.client).catch(() => {});
  }

  async flush() {
    await this.syncQueue.flush(this.client);
  }

  async retry() {
    await this.syncQueue.flush(this.client);
    if (this.isAuthenticated) {
      await this.refreshSnapshot();
    }
  }

  async reset() {
    await this.signOut();
  }
}
