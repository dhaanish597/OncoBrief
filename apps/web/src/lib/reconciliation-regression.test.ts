import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@oncobrief/domain';
import type { Querier, ValidatedSession } from '@oncobrief/db';

const { mockDb, getSessionState, setSessionState } = vi.hoisted(() => {
  let session: ValidatedSession | null = null;
  const mockRedirect = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });

  return {
    getSessionState: () => session,
    setSessionState: (s: ValidatedSession | null) => {
      session = s;
    },
    mockDb: {
      withTenant: vi.fn(async (_ctx: unknown, fn: (q: Querier) => Promise<unknown>) => fn({} as Querier)),
      verifyEvidence: vi.fn(),
      correctEvidence: vi.fn(),
      supersedeEvidence: vi.fn(),
      rejectEvidence: vi.fn(),
      reinstateEvidence: vi.fn(),
      resolveConflict: vi.fn(),
      computeAndPersistReadiness: vi.fn(),
      mockRedirect,
    },
  };
});

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockDb.mockRedirect(url),
  revalidatePath: vi.fn(),
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

vi.mock('@oncobrief/db', async () => {
  const actual = await vi.importActual<typeof import('@oncobrief/db')>('@oncobrief/db');
  return {
    ...actual,
    withTenant: mockDb.withTenant,
    verifyEvidence: mockDb.verifyEvidence,
    correctEvidence: mockDb.correctEvidence,
    supersedeEvidence: mockDb.supersedeEvidence,
    rejectEvidence: mockDb.rejectEvidence,
    reinstateEvidence: mockDb.reinstateEvidence,
    resolveConflict: mockDb.resolveConflict,
    computeAndPersistReadiness: mockDb.computeAndPersistReadiness,
  };
});

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
    if (!s) throw new Error('NEXT_REDIRECT:/login');
    const mockQuerier = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        let rows: unknown[] = [];
        // Mocking evidence_fact lookup for correctEvidence / supersedeEvidence
        if (typeof sql === 'string' && sql.includes('FROM evidence_fact WHERE id = $1')) {
          const id = params?.[0] as string;
          if (id === 'fact-cross-tenant') {
            rows = [
              {
                fact_type: 'biopsy.date',
                value_json: { kind: 'date', date: '2025-01-10' },
                verbatim_quote: 'Biopsy date: 10 Jan 2025',
                org_id: 'other-org',
                patient_id: 'other-patient',
              },
            ];
          } else if (id === 'fact-not-found') {
            rows = [];
          } else {
            rows = [
              {
                fact_type: 'biopsy.date',
                value_json: { kind: 'date', date: '2025-01-10' },
                verbatim_quote: 'Biopsy date: 10 Jan 2025',
                org_id: s.orgId,
                patient_id: 'pt-100',
              },
            ];
          }
        } else if (typeof sql === 'string' && sql.includes('FROM conflict_member cm')) {
          rows = [
            {
              fact_type: 'procedure.recorded',
              value_json: { kind: 'text', text: 'Mastectomy' },
              verbatim_quote: 'Left modified radical mastectomy',
              org_id: s.orgId,
              patient_id: 'pt-100',
            },
          ];
        }
        return {
          rows,
          command: 'SELECT',
          rowCount: rows.length,
          oid: 0,
          fields: [],
        };
      }),
    } as unknown as Querier;
    return fn(mockQuerier, s);
  }),
}));

import {
  correctEvidenceAction,
  supersedeEvidenceAction,
  resolveConflictAction,
} from './actions';


function authedAs(role: Role, orgId = 'org-1', userId = 'usr-1') {
  setSessionState({
    sessionId: 'sess-1',
    userId,
    orgId,
    role,
    expiresAt: new Date(Date.now() + 3600_000),
    tokenHash: Buffer.from('mock-token-hash'),
  });
}

describe('Reconciliation Room & Evidence Mutation Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionState(null);
  });

  describe('1. Evidence Correction (correctEvidenceAction)', () => {
    it('successfully corrects evidence for authorized clinician and recomputes readiness', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-1');
      fd.append('valueText', '2025-01-15');
      fd.append('verbatimQuote', 'Biopsy date: 10 Jan 2025');
      fd.append('reason', 'Corrected date after pathology review');

      await correctEvidenceAction(fd);

      expect(mockDb.correctEvidence).toHaveBeenCalledTimes(1);
      expect(mockDb.correctEvidence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          factId: 'fact-1',
          value: { kind: 'date', date: '2025-01-15' },
          reason: 'Corrected date after pathology review',
        }),
      );
      expect(mockDb.computeAndPersistReadiness).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orgId: 'org-1', patientId: 'pt-100' }),
      );
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/evidence');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/conflicts');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/record-map');
    });

    it('successfully corrects evidence for records_officer', async () => {
      authedAs('records_officer');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-1');
      fd.append('valueText', '2025-01-15');
      fd.append('verbatimQuote', 'Biopsy date: 10 Jan 2025');
      fd.append('reason', 'Records audit found clerical error');

      await correctEvidenceAction(fd);
      expect(mockDb.correctEvidence).toHaveBeenCalledTimes(1);
    });

    it('rejects empty or missing valueText', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-1');
      fd.append('valueText', '   ');
      fd.append('verbatimQuote', 'quote');
      fd.append('reason', 'Some reason here');

      await expect(correctEvidenceAction(fd)).rejects.toThrow('value_required');
      expect(mockDb.correctEvidence).not.toHaveBeenCalled();
    });

    it('rejects correction reason under 3 characters', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-1');
      fd.append('valueText', '2025-01-15');
      fd.append('verbatimQuote', 'quote');
      fd.append('reason', 'no');

      await expect(correctEvidenceAction(fd)).rejects.toThrow('reason_required');
      expect(mockDb.correctEvidence).not.toHaveBeenCalled();
    });

    it('rejects unauthorized roles (coordinator, org_admin, auditor)', async () => {
      const unauthorizedRoles: Role[] = ['coordinator', 'org_admin', 'auditor'];
      for (const role of unauthorizedRoles) {
        authedAs(role);
        const fd = new FormData();
        fd.append('patientId', 'pt-100');
        fd.append('factId', 'fact-1');
        fd.append('valueText', '2025-01-15');
        fd.append('verbatimQuote', 'quote');
        fd.append('reason', 'Valid reason here');

        await expect(correctEvidenceAction(fd)).rejects.toThrow(/forbidden|permission_denied/);
        expect(mockDb.correctEvidence).not.toHaveBeenCalled();
      }
    });

    it('rejects cross-tenant evidence identifier without mutating state', async () => {
      authedAs('clinician', 'org-1');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-cross-tenant');
      fd.append('valueText', '2025-01-15');
      fd.append('verbatimQuote', 'quote');
      fd.append('reason', 'Trying cross-tenant update');

      await expect(correctEvidenceAction(fd)).rejects.toThrow('fact_not_found');
      expect(mockDb.correctEvidence).not.toHaveBeenCalled();
    });

    it('rejects nonexistent evidence identifier', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-not-found');
      fd.append('valueText', '2025-01-15');
      fd.append('verbatimQuote', 'quote');
      fd.append('reason', 'Valid reason');

      await expect(correctEvidenceAction(fd)).rejects.toThrow('fact_not_found');
      expect(mockDb.correctEvidence).not.toHaveBeenCalled();
    });
  });

  describe('2. Superseding Evidence (supersedeEvidenceAction)', () => {
    it('successfully supersedes evidence with authorized role and reason', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-1');
      fd.append('reason', 'Superseded by follow-up surgical operative note');
      fd.append('supersedingFactId', 'fact-new-2');

      await supersedeEvidenceAction(fd);

      expect(mockDb.supersedeEvidence).toHaveBeenCalledTimes(1);
      expect(mockDb.supersedeEvidence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          factId: 'fact-1',
          reason: 'Superseded by follow-up surgical operative note',
          supersedingFactId: 'fact-new-2',
        }),
      );
      expect(mockDb.computeAndPersistReadiness).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orgId: 'org-1', patientId: 'pt-100' }),
      );
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/evidence');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/conflicts');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/record-map');
    });

    it('rejects superseding reason under 3 characters', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-1');
      fd.append('reason', 'ok');

      await expect(supersedeEvidenceAction(fd)).rejects.toThrow('reason_required');
      expect(mockDb.supersedeEvidence).not.toHaveBeenCalled();
    });

    it('rejects unauthorized roles from superseding evidence', async () => {
      const unauthorizedRoles: Role[] = ['coordinator', 'org_admin', 'auditor'];
      for (const role of unauthorizedRoles) {
        authedAs(role);
        const fd = new FormData();
        fd.append('patientId', 'pt-100');
        fd.append('factId', 'fact-1');
        fd.append('reason', 'Valid superseding reason');

        await expect(supersedeEvidenceAction(fd)).rejects.toThrow(/forbidden|permission_denied/);
        expect(mockDb.supersedeEvidence).not.toHaveBeenCalled();
      }
    });

    it('rejects cross-tenant fact for superseding', async () => {
      authedAs('clinician', 'org-1');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('factId', 'fact-cross-tenant');
      fd.append('reason', 'Superseded reason');

      await expect(supersedeEvidenceAction(fd)).rejects.toThrow('fact_not_found');
      expect(mockDb.supersedeEvidence).not.toHaveBeenCalled();
    });
  });

  describe('3. Conflict Reconciliation (resolveConflictAction)', () => {
    it('successfully resolves conflict as mark_superseded with winner fact', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('conflictId', 'conf-1');
      fd.append('resolutionKind', 'mark_superseded');
      fd.append('winnerFactId', 'fact-member-a');
      fd.append('reason', 'Operative report dated July supersedes preliminary referral estimate');

      await expect(resolveConflictAction(fd)).rejects.toThrow('NEXT_REDIRECT:/patients/pt-100/conflicts');

      expect(mockDb.resolveConflict).toHaveBeenCalledTimes(1);
      expect(mockDb.resolveConflict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          conflictSetId: 'conf-1',
          resolutionKind: 'mark_superseded',
          winnerFactId: 'fact-member-a',
          reason: 'Operative report dated July supersedes preliminary referral estimate',
        }),
      );
      expect(mockDb.computeAndPersistReadiness).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orgId: 'org-1', patientId: 'pt-100' }),
      );
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/conflicts');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/conflicts/conf-1');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/evidence');
      expect(revalidatePathMock).toHaveBeenCalledWith('/patients/pt-100/record-map');
    });

    it('rejects mark_superseded without a winnerFactId', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('conflictId', 'conf-1');
      fd.append('resolutionKind', 'mark_superseded');
      fd.append('reason', 'Some valid reason');

      await expect(resolveConflictAction(fd)).rejects.toThrow('winner_required');
      expect(mockDb.resolveConflict).not.toHaveBeenCalled();
    });

    it('successfully resolves conflict as corrected with human-authored replacement value', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('conflictId', 'conf-1');
      fd.append('resolutionKind', 'corrected');
      fd.append('winnerFactId', 'fact-member-a');
      fd.append('valueText', 'Bilateral modified radical mastectomy');
      fd.append('reason', 'Both documents had incomplete wording; final pathology confirms bilateral');

      await expect(resolveConflictAction(fd)).rejects.toThrow('NEXT_REDIRECT:/patients/pt-100/conflicts');

      expect(mockDb.resolveConflict).toHaveBeenCalledTimes(1);
      expect(mockDb.resolveConflict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          conflictSetId: 'conf-1',
          resolutionKind: 'corrected',
          winnerFactId: 'fact-member-a',
          replacement: expect.objectContaining({
            value: { kind: 'date', date: 'Bilateral modified radical mastectomy' },
            verbatimQuote: 'Biopsy date: 10 Jan 2025',
          }),
        }),
      );
      expect(mockDb.computeAndPersistReadiness).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orgId: 'org-1', patientId: 'pt-100' }),
      );
    });

    it('rejects corrected resolution without replacement valueText', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('conflictId', 'conf-1');
      fd.append('resolutionKind', 'corrected');
      fd.append('winnerFactId', 'fact-member-a');
      fd.append('reason', 'Valid reason');
      // No valueText supplied

      await expect(resolveConflictAction(fd)).rejects.toThrow('value_required');
      expect(mockDb.resolveConflict).not.toHaveBeenCalled();
    });

    it('successfully resolves conflict as retain_both', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('conflictId', 'conf-1');
      fd.append('resolutionKind', 'retain_both');
      fd.append('reason', 'Both procedures were performed at different stages; retaining both');

      await expect(resolveConflictAction(fd)).rejects.toThrow('NEXT_REDIRECT:/patients/pt-100/conflicts');

      expect(mockDb.resolveConflict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          conflictSetId: 'conf-1',
          resolutionKind: 'retain_both',
        }),
      );
    });

    it('rejects unauthorized roles from resolving conflicts', async () => {
      const unauthorizedRoles: Role[] = ['coordinator', 'org_admin', 'auditor'];
      for (const role of unauthorizedRoles) {
        authedAs(role);
        const fd = new FormData();
        fd.append('patientId', 'pt-100');
        fd.append('conflictId', 'conf-1');
        fd.append('resolutionKind', 'retain_both');
        fd.append('reason', 'Valid reason');

        await expect(resolveConflictAction(fd)).rejects.toThrow(/forbidden|permission_denied/);
        expect(mockDb.resolveConflict).not.toHaveBeenCalled();
      }
    });

    it('rejects conflict resolution reason under 3 characters', async () => {
      authedAs('clinician');
      const fd = new FormData();
      fd.append('patientId', 'pt-100');
      fd.append('conflictId', 'conf-1');
      fd.append('resolutionKind', 'retain_both');
      fd.append('reason', 'no');

      await expect(resolveConflictAction(fd)).rejects.toThrow('reason_required');
      expect(mockDb.resolveConflict).not.toHaveBeenCalled();
    });
  });
});
