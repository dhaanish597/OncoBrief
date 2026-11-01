import {
  createDemo,
  createEmptyConnectedState,
  reduce,
  type State,
  type Action,
  type DocumentRecord,
  type Category,
  type Evidence,
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
    this.syncQueue = new OfflineSyncQueue();
    this.syncQueue.onSessionExpired = () => {
      this.error = 'unauthorized';
      this.isAuthenticated = false;
      this.sessionToken = null;
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

  private hydrateSnapshot(snapshot: PatientPortalSnapshotResponse) {
    const documents: DocumentRecord[] = (snapshot.documents ?? []).map((d) => ({
      id: d.id,
      name: d.filename,
      category: (d.mimeType?.includes('pdf') ? 'pathology' : 'laboratory') as Category,
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

    this.state = {
      ...this.state,
      mode: 'connected',
      patientName: snapshot.patient.displayName,
      patientNameTa: snapshot.patient.displayName,
      mrn: snapshot.patient.mrn,
      diagnosis: snapshot.summary?.diagnosis ?? '',
      diagnosisTa: snapshot.summary?.diagnosis ?? '',
      journeyStage: snapshot.summary?.journeyStage ?? '',
      journeyStageTa: snapshot.summary?.journeyStage ?? '',
      documents,
      ledger,
      questions: snapshot.preparation?.questions ?? [],
      notes: snapshot.preparation?.symptomNotes ?? '',
      packSelected: snapshot.preparation?.packSelectedDocumentIds ?? [],
      appointments: snapshot.appointments ?? [],
      continuityMessages: snapshot.continuityMessages ?? [],
      lastSyncedAt: snapshot.lastSyncedAt ?? new Date().toISOString(),
      pendingSyncCount: this.syncQueue.size(),
    };
    this.onChange();
  }

  apply(action: Action) {
    // 1. Optimistic local state update
    if (action.type === 'review') {
      const doc = this.state.documents.find((d) => d.id === action.id);
      if (doc) doc.patientReviewed = true;
    } else if (action.type === 'flag') {
      this.state.flags.push({
        id: `flag-${Date.now()}`,
        documentId: action.id,
        reason: action.reason,
        at: new Date().toISOString(),
      });
    }

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
