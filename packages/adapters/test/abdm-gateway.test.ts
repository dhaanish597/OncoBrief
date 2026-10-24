import { describe, expect, it, vi } from 'vitest';
import { HttpAbdmGatewayAdapter } from '../src/abdm-gateway';
import { SimulatedAbdmGatewayAdapter } from '../src/simulated-abdm-gateway';

describe('ABDM Gateway Adapters', () => {
  describe('HttpAbdmGatewayAdapter (Sandbox)', () => {
    it('acquires token from session API and caches it', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/sessions')) {
          callCount += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({ accessToken: 'mock-token-xyz', expiresIn: 900 }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const adapter = new HttpAbdmGatewayAdapter({
        baseUrl: 'https://dev.abdm.gov.in/api/hiecm',
        sessionUrl: 'https://dev.abdm.gov.in/api/hiecm/gateway/v3/sessions',
        cmId: 'sbx',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        hipId: 'HIP-001',
        hiuId: 'HIU-001',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // Concurrent token acquisition calls
      const [t1, t2] = await Promise.all([adapter.getSessionToken(), adapter.getSessionToken()]);

      expect(t1).toBe('mock-token-xyz');
      expect(t2).toBe('mock-token-xyz');
      expect(callCount).toBe(1); // Deduplicated single-flight call
    });

    it('attaches X-HIP-ID only on HIP calls and X-HIU-ID only on HIU calls', async () => {
      const headersSeen: Array<Record<string, string>> = [];
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/sessions')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ accessToken: 'token-abc', expiresIn: 900 }),
          };
        }
        headersSeen.push((init?.headers ?? {}) as Record<string, string>);
        return { ok: true, status: 202, json: async () => ({}) };
      });

      const adapter = new HttpAbdmGatewayAdapter({
        baseUrl: 'https://dev.abdm.gov.in/api/hiecm',
        sessionUrl: 'https://dev.abdm.gov.in/api/hiecm/gateway/v3/sessions',
        cmId: 'sbx',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        hipId: 'FACILITY-HIP-123',
        hiuId: 'FACILITY-HIU-456',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // 1. HIP call: generateLinkToken
      await adapter.generateLinkToken({
        requestId: 'req-hip-1',
        timestamp: new Date().toISOString(),
        abhaAddress: 'patient@sbx',
        name: 'Patient Name',
        gender: 'F',
        yearOfBirth: 1985,
      });

      // 2. HIU call: initiateConsentRequest
      await adapter.initiateConsentRequest({
        requestId: 'req-hiu-1',
        timestamp: new Date().toISOString(),
        patientAbhaAddress: 'patient@sbx',
        purposeCode: 'CAREMGT',
        purposeText: 'Care Management',
        hiTypes: ['OPConsultation'],
        dateRange: { from: '2026-01-01', to: '2026-06-01' },
        dataEraseAt: '2026-12-31',
        requester: { name: 'Dr. Rao' },
      });

      expect(headersSeen.length).toBe(2);

      // Verify HIP headers: has X-HIP-ID, MUST NOT have X-HIU-ID
      const hipHeaders = headersSeen[0]!;
      expect(hipHeaders['X-HIP-ID']).toBe('FACILITY-HIP-123');
      expect(hipHeaders['X-HIU-ID']).toBeUndefined();
      expect(hipHeaders['Authorization']).toBe('Bearer token-abc');

      // Verify HIU headers: has X-HIU-ID, MUST NOT have X-HIP-ID
      const hiuHeaders = headersSeen[1]!;
      expect(hiuHeaders['X-HIU-ID']).toBe('FACILITY-HIU-456');
      expect(hipHeaders['X-HIU-ID']).toBeUndefined();
      expect(hiuHeaders['X-HIP-ID']).toBeUndefined();
    });

    it('retries once on 401 Unauthorized after evicting cached token', async () => {
      let sessionCalls = 0;
      let postCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/sessions')) {
          sessionCalls += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({ accessToken: `token-v${sessionCalls}`, expiresIn: 900 }),
          };
        }
        postCalls += 1;
        if (postCalls === 1) {
          // First attempt fails with 401
          return { ok: false, status: 401, json: async () => ({ error: { code: 401 } }) };
        }
        // Second attempt succeeds
        return { ok: true, status: 202, json: async () => ({}) };
      });

      const adapter = new HttpAbdmGatewayAdapter({
        baseUrl: 'https://dev.abdm.gov.in/api/hiecm',
        sessionUrl: 'https://dev.abdm.gov.in/api/hiecm/gateway/v3/sessions',
        cmId: 'sbx',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        hipId: 'HIP-001',
        hiuId: 'HIU-001',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await adapter.generateLinkToken({
        requestId: 'req-retry-1',
        timestamp: new Date().toISOString(),
        abhaAddress: 'patient@sbx',
        name: 'Patient Name',
        gender: 'M',
        yearOfBirth: 1990,
      });

      expect(res.status).toBe('accepted');
      expect(sessionCalls).toBe(2); // Initial token + refresh after 401
      expect(postCalls).toBe(2); // First failed + retry succeeded
    });
  });

  describe('SimulatedAbdmGatewayAdapter (Offline Loopback)', () => {
    it('executes without network calls and records invocation history', async () => {
      const sim = new SimulatedAbdmGatewayAdapter({
        callbackBaseUrl: 'http://localhost:3000',
        hipId: 'SIM-HIP',
        hiuId: 'SIM-HIU',
        dispatchDirectHttp: false,
      });

      expect(sim.driver).toBe('simulated');

      const token = await sim.getSessionToken();
      expect(token).toContain('simulated-abdm-session-token');

      const linkRes = await sim.generateLinkToken({
        requestId: 'sim-req-01',
        timestamp: new Date().toISOString(),
        abhaAddress: 'sim.patient@sbx',
        name: 'Meenakshi Sundaram',
        gender: 'F',
        yearOfBirth: 1974,
      });
      expect(linkRes.status).toBe('accepted');

      const consentRes = await sim.initiateConsentRequest({
        requestId: 'sim-req-02',
        timestamp: new Date().toISOString(),
        patientAbhaAddress: 'sim.patient@sbx',
        purposeCode: 'CAREMGT',
        purposeText: 'Care Management',
        hiTypes: ['OPConsultation'],
        dateRange: { from: '2026-01-01', to: '2026-06-01' },
        dataEraseAt: '2026-12-31',
        requester: { name: 'Dr. Rao' },
      });
      expect(consentRes.status).toBe('accepted');

      expect(sim.recordedCalls.length).toBe(2);
      expect(sim.recordedCalls[0]!.method).toBe('generateLinkToken');
      expect(sim.recordedCalls[1]!.method).toBe('initiateConsentRequest');
    });
  });
});
