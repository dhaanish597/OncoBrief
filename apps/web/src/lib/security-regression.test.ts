import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@oncobrief/domain';
import type { Querier, ValidatedSession } from '@oncobrief/db';

const { mockDb, getSessionState, setSessionState, mockNav } = vi.hoisted(() => {
  let session: ValidatedSession | null = null;
  const mockForbidden = vi.fn(() => {
    const err = new Error('NEXT_HTTP_ERROR_FALLBACK;403');
    (err as unknown as { digest: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;403';
    throw err;
  });
  const mockNotFound = vi.fn(() => {
    const err = new Error('NEXT_HTTP_ERROR_FALLBACK;404');
    (err as unknown as { digest: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
    throw err;
  });
  const mockRedirect = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });

  return {
    getSessionState: () => session,
    setSessionState: (s: ValidatedSession | null) => {
      session = s;
    },
    mockNav: {
      forbidden: mockForbidden,
      notFound: mockNotFound,
      redirect: mockRedirect,
    },
    mockDb: {
      getPatient: vi.fn(),
      listPatientAudit: vi.fn(),
      verifyLedgerChain: vi.fn(),
      getPacket: vi.fn(),
      assertPacketSourcesAccessible: vi.fn(async () => {}),
      appendAuditEvent: vi.fn(),
      packetExportJson: vi.fn(() => JSON.stringify({ packet_id: 'test', facts: [] })),
      withTenant: vi.fn(async (_ctx: unknown, fn: (q: Querier) => Promise<unknown>) => fn({} as Querier)),
      createTask: vi.fn(),
      assignTask: vi.fn(),
      changeTaskStatus: vi.fn(),
      commentTask: vi.fn(),
      computeAndPersistReadiness: vi.fn(),
      waiveGap: vi.fn(),
      verifyEvidence: vi.fn(),
      correctEvidence: vi.fn(),
      rejectEvidence: vi.fn(),
      reinstateEvidence: vi.fn(),
      resolveConflict: vi.fn(),
      createPacket: vi.fn(async () => ({ packetId: 'new-pkt-id' })),
      submitPacket: vi.fn(),
      approvePacket: vi.fn(),
      withdrawPacket: vi.fn(),
      composeMessage: vi.fn(),
      approveMessage: vi.fn(),
      deliverMessage: vi.fn(),
      updateCaregiverPreferences: vi.fn(),
      getDelivery: vi.fn(),
      getStorage: vi.fn(),
    },
  };
});

vi.mock('server-only', () => ({}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => getSessionState()),
  requireSession: vi.fn(async () => {
    const s = getSessionState();
    if (!s) {
      throw new Error('NEXT_REDIRECT:/login');
    }
    return s;
  }),
  withSession: vi.fn(async (fn: (q: Querier, s: ValidatedSession) => Promise<unknown>) => {
    const s = getSessionState();
    if (!s) {
      throw new Error('NEXT_REDIRECT:/login');
    }
    return fn({} as Querier, s);
  }),
  tenantCtx: vi.fn((s: ValidatedSession) => ({ orgId: s.orgId, userId: s.userId, role: s.role })),
}));

vi.mock('next/navigation', () => ({
  forbidden: () => mockNav.forbidden(),
  notFound: () => mockNav.notFound(),
  redirect: (url: string) => mockNav.redirect(url),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@oncobrief/db', async () => {
  const actual = await vi.importActual<typeof import('@oncobrief/db')>('@oncobrief/db');
  return {
    ...actual,
    ...mockDb,
  };
});

import AuditPage from '@/app/(app)/patients/[id]/audit/page';
import { GET as packetExportRoute } from '@/app/api/v1/packets/[packetId]/export/route';
import {
  createTaskAction,
  taskStatusAction,
  commentTaskAction,
  refreshReadinessAction,
  assignTaskAction,
  waiveGapAction,
  approvePacketAction,
  approveMessageAction,
  verifyEvidenceAction,
  updateCaregiverPreferencesAction,
} from './actions';

function makeSession(role: Role, orgId = 'org-1'): ValidatedSession {
  return {
    sessionId: 'sess-123',
    userId: `user-${role}`,
    orgId,
    role,
    expiresAt: new Date(Date.now() + 3600_000),
    tokenHash: Buffer.from('test-hash'),
  };
}

describe('Phase 1 Security Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionState(null);
  });

  describe('1. Audit trail page authorization & tenant isolation (Workstream B1)', () => {
    it('allows org_admin to view patient audit events and ledger chain', async () => {
      setSessionState(makeSession('org_admin'));
      mockDb.getPatient.mockResolvedValueOnce({ id: 'p1', orgId: 'org-1', displayName: 'Patient 1' });
      mockDb.listPatientAudit.mockResolvedValueOnce([{ id: 'a1', action: 'evidence.verified', seq: 1 }]);
      mockDb.verifyLedgerChain.mockResolvedValueOnce({ ok: true, length: 10 });

      const page = await AuditPage({ params: Promise.resolve({ id: 'p1' }) });
      expect(page).toBeDefined();
      expect(mockDb.listPatientAudit).toHaveBeenCalledWith(expect.anything(), 'p1');
      expect(mockDb.verifyLedgerChain).toHaveBeenCalledWith(expect.anything(), 'org-1');
    });

    it('allows auditor to view patient audit events and ledger chain', async () => {
      setSessionState(makeSession('auditor'));
      mockDb.getPatient.mockResolvedValueOnce({ id: 'p1', orgId: 'org-1', displayName: 'Patient 1' });
      mockDb.listPatientAudit.mockResolvedValueOnce([]);
      mockDb.verifyLedgerChain.mockResolvedValueOnce({ ok: true, length: 5 });

      const page = await AuditPage({ params: Promise.resolve({ id: 'p1' }) });
      expect(page).toBeDefined();
      expect(mockDb.listPatientAudit).toHaveBeenCalled();
    });

    it('denies clinician with 403 forbidden and never queries audit data', async () => {
      setSessionState(makeSession('clinician'));

      await expect(AuditPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow(
        /NEXT_HTTP_ERROR_FALLBACK;403/,
      );
      expect(mockNav.forbidden).toHaveBeenCalled();
      expect(mockDb.listPatientAudit).not.toHaveBeenCalled();
      expect(mockDb.verifyLedgerChain).not.toHaveBeenCalled();
    });

    it('denies coordinator with 403 forbidden and never queries audit data', async () => {
      setSessionState(makeSession('coordinator'));

      await expect(AuditPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow(
        /NEXT_HTTP_ERROR_FALLBACK;403/,
      );
      expect(mockNav.forbidden).toHaveBeenCalled();
      expect(mockDb.listPatientAudit).not.toHaveBeenCalled();
    });

    it('denies records_officer with 403 forbidden and never queries audit data', async () => {
      setSessionState(makeSession('records_officer'));

      await expect(AuditPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow(
        /NEXT_HTTP_ERROR_FALLBACK;403/,
      );
      expect(mockNav.forbidden).toHaveBeenCalled();
      expect(mockDb.listPatientAudit).not.toHaveBeenCalled();
    });

    it('redirects unauthenticated user to /login', async () => {
      setSessionState(null);

      await expect(AuditPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow(
        /NEXT_REDIRECT:\/login/,
      );
      expect(mockDb.listPatientAudit).not.toHaveBeenCalled();
    });

    it('returns 404 when patient belongs to another tenant or does not exist', async () => {
      setSessionState(makeSession('auditor', 'org-1'));
      mockDb.getPatient.mockResolvedValueOnce(null); // Not found under tenant org-1

      await expect(AuditPage({ params: Promise.resolve({ id: 'p-foreign' }) })).rejects.toThrow(
        /NEXT_HTTP_ERROR_FALLBACK;404/,
      );
      expect(mockNav.notFound).toHaveBeenCalled();
      expect(mockDb.listPatientAudit).not.toHaveBeenCalled();
    });
  });

  describe('2-4. Packet export authorization & tenant isolation (Workstream B2)', () => {
    it('returns 401 when request is unauthenticated', async () => {
      setSessionState(null);
      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-1/export'), {
        params: Promise.resolve({ packetId: 'pkt-1' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe('unauthorized');
    });

    it('returns 403 when role lacks packet:export (records_officer)', async () => {
      setSessionState(makeSession('records_officer'));
      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-1/export'), {
        params: Promise.resolve({ packetId: 'pkt-1' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('forbidden');
      expect(mockDb.getPacket).not.toHaveBeenCalled();
    });

    it('returns 403 when role lacks packet:export (auditor)', async () => {
      setSessionState(makeSession('auditor'));
      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-1/export'), {
        params: Promise.resolve({ packetId: 'pkt-1' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('forbidden');
      expect(mockDb.getPacket).not.toHaveBeenCalled();
    });

    it('returns 404 when packet belongs to another tenant or is unknown', async () => {
      setSessionState(makeSession('clinician', 'org-1'));
      mockDb.getPacket.mockResolvedValueOnce(null);

      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-foreign/export'), {
        params: Promise.resolve({ packetId: 'pkt-foreign' }),
      });
      expect(res.status).toBe(404);
      expect(mockDb.getPacket).toHaveBeenCalledWith(expect.anything(), 'org-1', 'pkt-foreign');
    });

    it('returns 409 when packet is unapproved (draft/submitted) and does not export body', async () => {
      setSessionState(makeSession('clinician', 'org-1'));
      mockDb.getPacket.mockResolvedValueOnce({
        id: 'pkt-1',
        orgId: 'org-1',
        status: 'draft',
      });

      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-1/export'), {
        params: Promise.resolve({ packetId: 'pkt-1' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('packet_not_approved');
      expect(mockDb.appendAuditEvent).not.toHaveBeenCalled();
    });

    it('returns 409 and audits denial when a frozen packet source is hidden by RLS', async () => {
      setSessionState(makeSession('clinician', 'org-1'));
      mockDb.getPacket.mockResolvedValueOnce({ id: 'pkt-1', status: 'approved' });
      mockDb.assertPacketSourcesAccessible.mockRejectedValueOnce(new Error('packet_source_withdrawn'));
      const response = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-1/export'), {
        params: Promise.resolve({ packetId: 'pkt-1' }),
      });
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('packet_source_withdrawn');
      expect(mockDb.appendAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: 'denied' }));
      expect(mockDb.packetExportJson).not.toHaveBeenCalled();
    });

    it('allows clinician to export an approved packet and writes audit log', async () => {
      setSessionState(makeSession('clinician', 'org-1'));
      mockDb.getPacket.mockResolvedValueOnce({
        id: 'pkt-1',
        orgId: 'org-1',
        status: 'approved',
        snapshotSha256: 'sha-approved-packet',
      });

      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-1/export'), {
        params: Promise.resolve({ packetId: 'pkt-1' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('oncobrief-packet-pkt-1.json');
      expect(mockDb.appendAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'packet.exported',
          entityId: 'pkt-1',
          outcome: 'success',
        }),
      );
    });

    it('allows coordinator to export an approved packet', async () => {
      setSessionState(makeSession('coordinator', 'org-1'));
      mockDb.getPacket.mockResolvedValueOnce({
        id: 'pkt-2',
        orgId: 'org-1',
        status: 'approved',
        snapshotSha256: 'sha-2',
      });

      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-2/export'), {
        params: Promise.resolve({ packetId: 'pkt-2' }),
      });
      expect(res.status).toBe(200);
    });

    it('allows org_admin to export an approved packet', async () => {
      setSessionState(makeSession('org_admin', 'org-1'));
      mockDb.getPacket.mockResolvedValueOnce({
        id: 'pkt-3',
        orgId: 'org-1',
        status: 'approved',
        snapshotSha256: 'sha-3',
      });

      const res = await packetExportRoute(new Request('http://localhost/api/v1/packets/pkt-3/export'), {
        params: Promise.resolve({ packetId: 'pkt-3' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('5-8. Task status and comment action authorization & validation (Workstream B3)', () => {
    it('taskStatusAction rejects invalid status enum values', async () => {
      setSessionState(makeSession('coordinator'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('toStatus', 'destroyed');

      await expect(taskStatusAction(fd)).rejects.toThrow('invalid_task_status');
      expect(mockDb.changeTaskStatus).not.toHaveBeenCalled();
    });

    it('taskStatusAction rejects unauthorized roles (auditor)', async () => {
      setSessionState(makeSession('auditor'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('toStatus', 'in_progress');

      await expect(taskStatusAction(fd)).rejects.toThrow('forbidden:task:create');
      expect(mockDb.changeTaskStatus).not.toHaveBeenCalled();
    });

    it('taskStatusAction rejects unauthorized roles (org_admin)', async () => {
      setSessionState(makeSession('org_admin'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('toStatus', 'in_progress');

      await expect(taskStatusAction(fd)).rejects.toThrow('forbidden:task:create');
      expect(mockDb.changeTaskStatus).not.toHaveBeenCalled();
    });

    it('taskStatusAction rejects illegal state transitions through state machine', async () => {
      setSessionState(makeSession('coordinator'));
      mockDb.changeTaskStatus.mockRejectedValueOnce(
        new Error('invalid_task_transition:open->done:no_such_transition'),
      );
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('toStatus', 'done');

      await expect(taskStatusAction(fd)).rejects.toThrow(/invalid_task_transition/);
    });

    it('taskStatusAction succeeds for authorized roles with legal transition', async () => {
      setSessionState(makeSession('coordinator'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('toStatus', 'in_progress');
      fd.append('note', 'Started work');

      await taskStatusAction(fd);
      expect(mockDb.changeTaskStatus).toHaveBeenCalledWith(expect.anything(), {
        taskId: 't1',
        toStatus: 'in_progress',
        actorId: 'user-coordinator',
        note: 'Started work',
      });
    });

    it('commentTaskAction rejects unauthorized roles (auditor)', async () => {
      setSessionState(makeSession('auditor'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('note', 'Auditor note');

      await expect(commentTaskAction(fd)).rejects.toThrow('forbidden:task:create');
      expect(mockDb.commentTask).not.toHaveBeenCalled();
    });

    it('commentTaskAction rejects unauthorized roles (org_admin)', async () => {
      setSessionState(makeSession('org_admin'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('note', 'Admin note');

      await expect(commentTaskAction(fd)).rejects.toThrow('forbidden:task:create');
      expect(mockDb.commentTask).not.toHaveBeenCalled();
    });

    it('commentTaskAction rejects empty note', async () => {
      setSessionState(makeSession('coordinator'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('note', '   ');

      await expect(commentTaskAction(fd)).rejects.toThrow('empty_note');
      expect(mockDb.commentTask).not.toHaveBeenCalled();
    });

    it('commentTaskAction succeeds for authorized role with valid note', async () => {
      setSessionState(makeSession('records_officer'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('note', 'Called the hospital for record transfer.');

      await commentTaskAction(fd);
      expect(mockDb.commentTask).toHaveBeenCalledWith(expect.anything(), {
        taskId: 't1',
        actorId: 'user-records_officer',
        note: 'Called the hospital for record transfer.',
      });
    });
  });

  describe('9. Readiness recomputation authorization (Workstream B3)', () => {
    it('refreshReadinessAction rejects clinician with forbidden:checklist:author', async () => {
      setSessionState(makeSession('clinician'));
      const fd = new FormData();
      fd.append('patientId', 'p1');

      await expect(refreshReadinessAction(fd)).rejects.toThrow('forbidden:checklist:author');
      expect(mockDb.computeAndPersistReadiness).not.toHaveBeenCalled();
    });

    it('refreshReadinessAction rejects coordinator with forbidden:checklist:author', async () => {
      setSessionState(makeSession('coordinator'));
      const fd = new FormData();
      fd.append('patientId', 'p1');

      await expect(refreshReadinessAction(fd)).rejects.toThrow('forbidden:checklist:author');
      expect(mockDb.computeAndPersistReadiness).not.toHaveBeenCalled();
    });

    it('refreshReadinessAction rejects auditor with forbidden:checklist:author', async () => {
      setSessionState(makeSession('auditor'));
      const fd = new FormData();
      fd.append('patientId', 'p1');

      await expect(refreshReadinessAction(fd)).rejects.toThrow('forbidden:checklist:author');
      expect(mockDb.computeAndPersistReadiness).not.toHaveBeenCalled();
    });

    it('refreshReadinessAction allows records_officer and triggers recomputation', async () => {
      setSessionState(makeSession('records_officer'));
      const fd = new FormData();
      fd.append('patientId', 'p1');

      await refreshReadinessAction(fd);
      expect(mockDb.computeAndPersistReadiness).toHaveBeenCalledWith(expect.anything(), {
        orgId: 'org-1',
        patientId: 'p1',
        computedBy: 'user-records_officer',
      });
    });

    it('refreshReadinessAction allows org_admin and triggers recomputation', async () => {
      setSessionState(makeSession('org_admin'));
      const fd = new FormData();
      fd.append('patientId', 'p1');

      await refreshReadinessAction(fd);
      expect(mockDb.computeAndPersistReadiness).toHaveBeenCalledWith(expect.anything(), {
        orgId: 'org-1',
        patientId: 'p1',
        computedBy: 'user-org_admin',
      });
    });
  });

  describe('10-12. Direct invocation protection & existing authorized workflows', () => {
    it('createTaskAction validates originKind enum and rejects untrusted inputs', async () => {
      setSessionState(makeSession('coordinator'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('originKind', 'untrusted_origin');
      fd.append('taskKind', 'retrieve_document');

      await expect(createTaskAction(fd)).rejects.toThrow('unknown_origin_kind');
      expect(mockDb.createTask).not.toHaveBeenCalled();
    });

    it('createTaskAction rejects unauthorized roles (auditor)', async () => {
      setSessionState(makeSession('auditor'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('originKind', 'document');
      fd.append('taskKind', 'retrieve_document');
      fd.append('originId', 'doc-1');
      fd.append('title', 'Test task');

      await expect(createTaskAction(fd)).rejects.toThrow('forbidden:task:create');
      expect(mockDb.createTask).not.toHaveBeenCalled();
    });

    it('assignTaskAction allows coordinator, records_officer, and org_admin, but rejects clinician and auditor', async () => {
      // Clinician cannot assign
      setSessionState(makeSession('clinician'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('taskId', 't1');
      fd.append('assigneeId', 'u2');
      await expect(assignTaskAction(fd)).rejects.toThrow('forbidden:task:assign');

      // Auditor cannot assign
      setSessionState(makeSession('auditor'));
      await expect(assignTaskAction(fd)).rejects.toThrow('forbidden:task:assign');

      // Coordinator can assign
      setSessionState(makeSession('coordinator'));
      await assignTaskAction(fd);
      expect(mockDb.assignTask).toHaveBeenCalled();

      // Org admin can assign
      setSessionState(makeSession('org_admin'));
      await assignTaskAction(fd);
      expect(mockDb.assignTask).toHaveBeenCalledTimes(2);
    });

    it('waiveGapAction enforces checklist:author permission', async () => {
      setSessionState(makeSession('clinician'));
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('gapId', 'g1');
      fd.append('reason', 'Waived');

      await expect(waiveGapAction(fd)).rejects.toThrow('forbidden:checklist:author');
      expect(mockDb.waiveGap).not.toHaveBeenCalled();

      setSessionState(makeSession('records_officer'));
      await waiveGapAction(fd);
      expect(mockDb.waiveGap).toHaveBeenCalled();
    });

    it('approvePacketAction enforces clinician-only permission', async () => {
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('packetId', 'pkt-1');

      for (const role of ['coordinator', 'records_officer', 'org_admin', 'auditor'] as Role[]) {
        setSessionState(makeSession(role));
        await expect(approvePacketAction(fd)).rejects.toThrow('forbidden:packet:approve');
        expect(mockDb.approvePacket).not.toHaveBeenCalled();
      }

      setSessionState(makeSession('clinician'));
      await approvePacketAction(fd);
      expect(mockDb.approvePacket).toHaveBeenCalledWith(expect.anything(), {
        packetId: 'pkt-1',
        userId: 'user-clinician',
        approvalNote: null,
      });
    });

    it('approveMessageAction enforces clinician-only permission', async () => {
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('messageId', 'msg-1');

      setSessionState(makeSession('coordinator'));
      await expect(approveMessageAction(fd)).rejects.toThrow('forbidden:message:approve');
      expect(mockDb.approveMessage).not.toHaveBeenCalled();

      setSessionState(makeSession('clinician'));
      await approveMessageAction(fd);
      expect(mockDb.approveMessage).toHaveBeenCalledWith(expect.anything(), {
        messageId: 'msg-1',
        userId: 'user-clinician',
      });
    });

    it('verifyEvidenceAction enforces evidence:verify and allows clinician, coordinator, records_officer', async () => {
      const fd = new FormData();
      fd.append('patientId', 'p1');
      fd.append('factId', 'f1');

      // Denied for org_admin and auditor
      setSessionState(makeSession('org_admin'));
      await expect(verifyEvidenceAction(fd)).rejects.toThrow('forbidden:evidence:verify');

      setSessionState(makeSession('auditor'));
      await expect(verifyEvidenceAction(fd)).rejects.toThrow('forbidden:evidence:verify');

      // Allowed for clinician
      setSessionState(makeSession('clinician'));
      await verifyEvidenceAction(fd);
      expect(mockDb.verifyEvidence).toHaveBeenCalledTimes(1);

      // Allowed for coordinator
      setSessionState(makeSession('coordinator'));
      await verifyEvidenceAction(fd);
      expect(mockDb.verifyEvidence).toHaveBeenCalledTimes(2);

      // Allowed for records_officer
      setSessionState(makeSession('records_officer'));
      await verifyEvidenceAction(fd);
      expect(mockDb.verifyEvidence).toHaveBeenCalledTimes(3);
    });
  });
});


it('persists an unchecked caregiver sync checkbox as disabled', async () => {
  setSessionState(makeSession('coordinator'));
  const form = new FormData();
  form.set('patientId', 'p');
  form.set('caregiverId', 'cg');
  await updateCaregiverPreferencesAction(form);
  expect(mockDb.updateCaregiverPreferences).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ caregiverId: 'cg', syncReminders: false }));
});
