import { describe, expect, it } from 'vitest';
import { FhirHttpError, HttpFhirClientAdapter } from '../src/fhir-client';
import { SyntheticFhirServer } from '../src/synthetic-fhir-server';

describe('HttpFhirClientAdapter and SyntheticFhirServer', () => {
  const baseUrl = 'https://synthetic-his.hospital.local/fhir/r4';

  function createHarness(options: { allowedHostnames?: string[]; maxRetries?: number; backoffInitialMs?: number } = {}) {
    const server = new SyntheticFhirServer({ baseUrl });
    const client = new HttpFhirClientAdapter({
      baseUrl,
      allowedHostnames: options.allowedHostnames ?? ['synthetic-his.hospital.local'],
      fetchFn: server.createFetchHandler(),
      maxRetries: options.maxRetries ?? 2,
      backoffInitialMs: options.backoffInitialMs ?? 5,
    });
    return { server, client };
  }

  describe('CapabilityStatement metadata', () => {
    it('retrieves server capability statement', async () => {
      const { client } = createHarness();
      const capability = await client.getCapabilityStatement();

      expect(capability.resourceType).toBe('CapabilityStatement');
      expect(capability.fhirVersion).toBe('4.0.1');
      expect(capability.status).toBe('active');
      expect(capability.rest[0]?.resource?.some((r) => r.type === 'Observation')).toBe(true);
    });
  });

  describe('CRUD and Versioning', () => {
    it('creates and reads a Patient resource with versioning ETag', async () => {
      const { client } = createHarness();
      const patient = {
        resourceType: 'Patient',
        name: [{ family: 'Sharma', given: ['Aarav'] }],
        gender: 'male',
        birthDate: '1985-05-12',
      };

      const created = await client.createResource('Patient', patient);
      expect(created.id).toBeDefined();
      expect(created.versionId).toBe('1');
      expect(created.etag).toBe('W/"1"');

      const readBack = await client.readResource<typeof patient>('Patient', created.id);
      expect(readBack.resource.name?.[0]?.family).toBe('Sharma');
      expect(readBack.etag).toBe('W/"1"');
    });

    it('updates a resource and enforces optimistic locking with If-Match', async () => {
      const { client } = createHarness();
      const obs = {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '2160-0', display: 'Creatinine' }] },
        valueQuantity: { value: 1.1, unit: 'mg/dL' },
      };

      const created = await client.createResource('Observation', obs);
      expect(created.versionId).toBe('1');

      // Update with matching If-Match succeeds
      const updated = await client.updateResource(
        'Observation',
        created.id,
        {
          ...created.resource,
          valueQuantity: { value: 1.2, unit: 'mg/dL' },
        },
        '1'
      );
      expect(updated.versionId).toBe('2');
      expect(updated.resource.valueQuantity.value).toBe(1.2);

      // Update with mismatched If-Match fails with 412 Precondition Failed
      await expect(
        client.updateResource(
          'Observation',
          created.id,
          {
            ...updated.resource,
            valueQuantity: { value: 1.3, unit: 'mg/dL' },
          },
          '1' // Outdated version
        )
      ).rejects.toThrow(FhirHttpError);
    });
  });

  describe('Search Interactions', () => {
    it('searches resources by patient reference and code', async () => {
      const { client, server } = createHarness();

      server.seedResource({
        resourceType: 'Observation',
        id: 'obs-001',
        subject: { reference: 'Patient/pat-001' },
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
        valueQuantity: { value: 13.5, unit: 'g/dL' },
      });

      server.seedResource({
        resourceType: 'Observation',
        id: 'obs-002',
        subject: { reference: 'Patient/pat-002' },
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
        valueQuantity: { value: 11.2, unit: 'g/dL' },
      });

      const searchResult = await client.searchResources('Observation', {
        patient: 'pat-001',
        code: '718-7',
      });

      expect(searchResult.resourceType).toBe('Bundle');
      expect(searchResult.type).toBe('searchset');
      expect(searchResult.total).toBe(1);
      expect((searchResult.entry?.[0]?.resource as Record<string, unknown> | undefined)?.['id']).toBe('obs-001');
    });
  });

  describe('Transaction Bundle Execution', () => {
    it('submits a transaction bundle containing multiple resource creations', async () => {
      const { client } = createHarness();

      const transactionBundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'tx-pat-01',
              name: [{ family: 'Deshmukh', given: ['Priya'] }],
            },
            request: { method: 'POST', url: 'Patient' },
          },
          {
            resource: {
              resourceType: 'Observation',
              id: 'tx-obs-01',
              subject: { reference: 'Patient/tx-pat-01' },
              code: { coding: [{ system: 'http://loinc.org', code: '1975-2', display: 'Total Bilirubin' }] },
              valueQuantity: { value: 0.9, unit: 'mg/dL' },
            },
            request: { method: 'POST', url: 'Observation' },
          },
        ],
      };

      const response = await client.submitBundle(transactionBundle);
      expect(response.resourceType).toBe('Bundle');
      expect(response.type).toBe('transaction-response');
      expect(response.entry.length).toBe(2);
      expect(response.entry[0]?.response.status).toBe('201 Created');
      expect(response.entry[1]?.response.status).toBe('201 Created');

      // Verify resources can be read
      const readPat = await client.readResource('Patient', 'tx-pat-01');
      expect(readPat.resource.id).toBe('tx-pat-01');
    });
  });

  describe('Error Handling and Retries', () => {
    it('parses OperationOutcome when resource is not found (404)', async () => {
      const { client } = createHarness();

      try {
        await client.readResource('Observation', 'non-existent-id');
        expect.unreachable('Should have thrown 404');
      } catch (err: any) {
        expect(err).toBeInstanceOf(FhirHttpError);
        expect(err.statusCode).toBe(404);
        expect(err.operationOutcome?.resourceType).toBe('OperationOutcome');
        expect(err.message).toContain('not found');
      }
    });

    it('retries transient 503 and recovers when server becomes available', async () => {
      const { client, server } = createHarness();

      // Simulate 503 for first 2 requests, then succeed
      server.simulateStatus({
        status: 503,
        pathPrefix: '/metadata',
        count: 2,
      });

      const capability = await client.getCapabilityStatement();
      expect(capability.resourceType).toBe('CapabilityStatement');
    });

    it('throws FhirHttpError when transient 503 retries are exhausted', async () => {
      const { client, server } = createHarness({ maxRetries: 1 });

      server.simulateStatus({
        status: 503,
        count: 5,
      });

      await expect(client.getCapabilityStatement()).rejects.toThrow(FhirHttpError);
    });
  });

  describe('SSRF Protection Gate', () => {
    it('blocks loopback IP addresses unless explicitly allowlisted', () => {
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://127.0.0.1:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to local loopback host: 127\.0\.0\.1/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://localhost:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to local loopback host: localhost/);
    });

    it('blocks AWS/GCP cloud metadata endpoints', () => {
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://169.254.169.254/latest/meta-data' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to cloud metadata service/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://metadata.google.internal/computeMetadata/v1' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to cloud metadata service/);
    });

    it('blocks private RFC1918 subnets', () => {
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://10.200.1.5:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to private IPv4 network: 10\.200\.1\.5/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://192.168.1.100/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to private IPv4 network: 192\.168\.1\.100/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://172.25.0.10:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to private IPv4 network: 172\.25\.0\.10/);
    });

    it('permits loopback or private host if explicitly allowlisted', () => {
      expect(() => {
        new HttpFhirClientAdapter({
          baseUrl: 'http://127.0.0.1:8080/fhir',
          allowedHostnames: ['127.0.0.1'],
        });
      }).not.toThrow();
    });

    it('blocks dangerous protocol schemes like file:, gopher:, ftp:', () => {
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'file:///etc/passwd' });
      }).toThrow(/\[SSRF_PROTECTED\] Unsupported or dangerous protocol scheme: file:/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'gopher://127.0.0.1:70/' });
      }).toThrow(/\[SSRF_PROTECTED\] Unsupported or dangerous protocol scheme: gopher:/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'ftp://ftp.example.org/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Unsupported or dangerous protocol scheme: ftp:/);
    });

    it('blocks embedded URL credentials', () => {
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'https://admin:secret@fhir.hospital.org/r4' });
      }).toThrow(/\[SSRF_PROTECTED\] Embedded credentials in URL prohibited/);
    });

    it('blocks integer and hex numeric IP aliases', () => {
      // 2130706433 is 127.0.0.1
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://2130706433:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to local loopback host: 127\.0\.0\.1/);

      // 0x7f000001 is 127.0.0.1
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://0x7f000001:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to local loopback host: 127\.0\.0\.1/);

      // 0177.0.0.1 is 127.0.0.1 in octal
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://0177.0.0.1:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to local loopback host: 127\.0\.0\.1/);
    });

    it('blocks IPv4-mapped IPv6 loopback and metadata', () => {
      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://[::ffff:127.0.0.1]:8080/fhir' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to local loopback host: 127\.0\.0\.1/);

      expect(() => {
        new HttpFhirClientAdapter({ baseUrl: 'http://[::ffff:169.254.169.254]/latest' });
      }).toThrow(/\[SSRF_PROTECTED\] Blocked request to cloud metadata service: 169\.254\.169\.254/);
    });

    it('blocks HTTP redirects to cloud metadata and internal subnets', async () => {
      const client = new HttpFhirClientAdapter({
        baseUrl: 'https://allowed.hospital.org/fhir/r4',
        allowedHostnames: ['allowed.hospital.org'],
        fetchFn: async (input) => {
          const urlStr = typeof input === 'string' ? input : (input as any).url;
          if (urlStr.includes('/metadata')) {
            // Malicious 302 redirect pointing to AWS IMDS
            return new Response(null, {
              status: 302,
              headers: { Location: 'http://169.254.169.254/latest/meta-data' },
            });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      });

      await expect(client.getCapabilityStatement()).rejects.toThrow(
        /\[SSRF_PROTECTED\] Blocked request to cloud metadata service: 169\.254\.169\.254/
      );
    });

    it('blocks cross-origin HTTP redirects to untrusted domains', async () => {
      const client = new HttpFhirClientAdapter({
        baseUrl: 'https://allowed.hospital.org/fhir/r4',
        allowedHostnames: ['allowed.hospital.org'],
        fetchFn: async (input) => {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://evil-hacker.com/fhir/metadata' },
          });
        },
      });

      await expect(client.getCapabilityStatement()).rejects.toThrow(
        /\[SSRF_PROTECTED\] Blocked untrusted cross-origin redirect to: https:\/\/evil-hacker\.com\/fhir\/metadata/
      );
    });
  });

  describe('Authentication Protocol', () => {
    it('sends Bearer token header when configured', async () => {
      let interceptedAuth: string | null = null;
      const client = new HttpFhirClientAdapter({
        baseUrl: 'https://fhir.hospital.org/r4',
        allowedHostnames: ['fhir.hospital.org'],
        authKind: 'bearer',
        authToken: 'smart-token-secret-123',
        fetchFn: async (_input, init) => {
          interceptedAuth = (init?.headers as Record<string, string>)?.['Authorization'] || null;
          return new Response(JSON.stringify({ resourceType: 'CapabilityStatement', status: 'active', fhirVersion: '4.0.1', format: [], rest: [] }));
        },
      });

      await client.getCapabilityStatement();
      expect(interceptedAuth).toBe('Bearer smart-token-secret-123');
    });

    it('sends Basic auth header when configured', async () => {
      let interceptedAuth: string | null = null;
      const client = new HttpFhirClientAdapter({
        baseUrl: 'https://fhir.hospital.org/r4',
        allowedHostnames: ['fhir.hospital.org'],
        authKind: 'basic',
        username: 'emr_user',
        password: 'emr_password',
        fetchFn: async (_input, init) => {
          interceptedAuth = (init?.headers as Record<string, string>)?.['Authorization'] || null;
          return new Response(JSON.stringify({ resourceType: 'CapabilityStatement', status: 'active', fhirVersion: '4.0.1', format: [], rest: [] }));
        },
      });

      await client.getCapabilityStatement();
      const expectedEncoded = Buffer.from('emr_user:emr_password').toString('base64');
      expect(interceptedAuth).toBe(`Basic ${expectedEncoded}`);
    });
  });
});
