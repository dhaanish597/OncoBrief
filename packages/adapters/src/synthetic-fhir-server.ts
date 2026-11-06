import { randomUUID } from 'node:crypto';
import type {
  FhirCapabilityStatement,
  FhirOperationOutcome,
  FhirSearchSet,
  FhirTransactionResponse,
} from '@oncobrief/ports';

interface SyntheticResource extends Record<string, unknown> {
  resourceType?: string;
  id?: string;
  meta?: { versionId?: string; lastUpdated?: string; [key: string]: unknown };
  subject?: { reference?: string };
  patient?: { reference?: string };
  code?: { coding?: Array<{ code?: string; system?: string; display?: string }> };
  effectiveDateTime?: string;
  performedDateTime?: string;
  recordedDate?: string;
  period?: { start?: string };
}

interface SyntheticBundle extends SyntheticResource {
  entry?: Array<{
    resource?: SyntheticResource;
    request?: { method?: string; url?: string };
  }>;
}

interface StoredResource {
  resource: SyntheticResource;
  version: number;
  lastUpdated: string;
}

export interface SyntheticFhirServerOptions {
  baseUrl?: string;
  defaultLatencyMs?: number;
}

export interface SimulatedStatusOverride {
  pathPrefix?: string;
  method?: string;
  status: number;
  outcome?: FhirOperationOutcome;
  count?: number; // Times this override fires before auto-clearing
}

export class SyntheticFhirServer {
  private readonly baseUrl: string;
  private readonly defaultLatencyMs: number;
  private readonly resources = new Map<string, Map<string, StoredResource>>();
  private statusOverrides: SimulatedStatusOverride[] = [];

  constructor(options: SyntheticFhirServerOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://synthetic-emr.oncobrief.local/fhir/r4';
    this.defaultLatencyMs = options.defaultLatencyMs ?? 0;
  }

  public simulateStatus(override: SimulatedStatusOverride): void {
    this.statusOverrides.push(override);
  }

  public clearOverrides(): void {
    this.statusOverrides = [];
  }

  public clearAll(): void {
    this.resources.clear();
    this.statusOverrides = [];
  }

  public seedResource(resource: SyntheticResource): void {
    const resourceType = resource.resourceType;
    if (!resourceType || !resource.id) {
      throw new Error('Seed resource must contain resourceType and id');
    }
    let typeMap = this.resources.get(resourceType);
    if (!typeMap) {
      typeMap = new Map();
      this.resources.set(resourceType, typeMap);
    }
    const version = 1;
    const now = new Date().toISOString();
    const stored: SyntheticResource = {
      ...resource,
      meta: {
        ...(resource.meta ?? {}),
        versionId: String(version),
        lastUpdated: now,
      },
    };
    typeMap.set(resource.id, {
      resource: stored,
      version,
      lastUpdated: now,
    });
  }

  public getResource(resourceType: string, id: string): SyntheticResource | undefined {
    return this.resources.get(resourceType)?.get(id)?.resource;
  }

  public getAllResources(resourceType?: string): SyntheticResource[] {
    const results: SyntheticResource[] = [];
    if (resourceType) {
      const typeMap = this.resources.get(resourceType);
      if (typeMap) {
        for (const item of typeMap.values()) {
          results.push(item.resource);
        }
      }
    } else {
      for (const typeMap of this.resources.values()) {
        for (const item of typeMap.values()) {
          results.push(item.resource);
        }
      }
    }
    return results;
  }

  public createFetchHandler(): typeof fetch {
    return (async (input: string | URL | { url: string }, init?: RequestInit): Promise<Response> => {
      if (this.defaultLatencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.defaultLatencyMs));
      }

      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsedUrl = new URL(urlStr);
      const pathname = parsedUrl.pathname.replace(/^\/fhir\/r4/, '').replace(/\/$/, '') || '/';
      const method = (init?.method ?? 'GET').toUpperCase();

      // Check simulated status overrides
      const overrideIdx = this.statusOverrides.findIndex((o) => {
        const matchesMethod = !o.method || o.method.toUpperCase() === method;
        const matchesPath = !o.pathPrefix || pathname.startsWith(o.pathPrefix);
        return matchesMethod && matchesPath;
      });

      if (overrideIdx !== -1) {
        const override = this.statusOverrides[overrideIdx];
        if (override) {
          if (override.count !== undefined) {
            override.count -= 1;
            if (override.count <= 0) {
              this.statusOverrides.splice(overrideIdx, 1);
            }
          }
          const outcome: FhirOperationOutcome = override.outcome ?? {
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: override.status >= 500 ? 'fatal' : 'error',
                code: override.status === 404 ? 'not-found' : override.status === 429 ? 'throttled' : 'processing',
                diagnostics: `Simulated HTTP ${override.status} error`,
              },
            ],
          };
          return new Response(JSON.stringify(outcome), {
            status: override.status,
            headers: {
              'Content-Type': 'application/fhir+json',
              ...(override.status === 429 ? { 'Retry-After': '1' } : {}),
            },
          });
        }
      }

      // Route handling
      try {
        if (pathname === '/metadata' && method === 'GET') {
          return this.handleMetadata();
        }

        if (pathname === '' || pathname === '/') {
          if (method === 'POST') {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            return this.handleBundleTransaction(body);
          }
        }

        const segments = pathname.split('/').filter(Boolean);

        // GET /{resourceType} or POST /{resourceType}
        if (segments.length === 1 && segments[0]) {
          const resourceType = segments[0];
          if (method === 'GET') {
            return this.handleSearch(resourceType, parsedUrl.searchParams);
          }
          if (method === 'POST') {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            return this.handleCreate(resourceType, body);
          }
        }

        // GET /{resourceType}/{id} or PUT /{resourceType}/{id}
        if (segments.length === 2 && segments[0] && segments[1]) {
          const [resourceType, id] = segments;
          if (method === 'GET') {
            return this.handleRead(resourceType, id);
          }
          if (method === 'PUT') {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            const ifMatch = init?.headers ? new Headers(init.headers).get('If-Match') : null;
            return this.handleUpdate(resourceType, id, body, ifMatch);
          }
        }

        return this.notFoundResponse(`Route ${method} ${pathname} not found on synthetic server`);
      } catch (err: unknown) {
        return new Response(
          JSON.stringify({
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'fatal', code: 'exception', diagnostics: err instanceof Error ? err.message : String(err) }],
          }),
          { status: 500, headers: { 'Content-Type': 'application/fhir+json' } }
        );
      }
    }) as typeof fetch;
  }

  private handleMetadata(): Response {
    const capability: FhirCapabilityStatement = {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      fhirVersion: '4.0.1',
      format: ['application/fhir+json', 'json'],
      rest: [
        {
          mode: 'server',
          resource: [
            { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }, { code: 'update' }] },
            { type: 'Observation', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'DiagnosticReport', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'Condition', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'Procedure', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'MedicationStatement', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'Encounter', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'DocumentReference', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'Composition', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }] },
            { type: 'Provenance', interaction: [{ code: 'read' }, { code: 'create' }] },
          ],
        },
      ],
    };
    return new Response(JSON.stringify(capability), {
      status: 200,
      headers: { 'Content-Type': 'application/fhir+json' },
    });
  }

  private handleRead(resourceType: string, id: string): Response {
    const typeMap = this.resources.get(resourceType);
    const item = typeMap?.get(id);
    if (!item) {
      return this.notFoundResponse(`${resourceType}/${id} not found`);
    }
    return new Response(JSON.stringify(item.resource), {
      status: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        ETag: `W/"${item.version}"`,
        'Last-Modified': item.lastUpdated,
      },
    });
  }

  private handleSearch(resourceType: string, params: URLSearchParams): Response {
    const typeMap = this.resources.get(resourceType);
    const all = typeMap ? Array.from(typeMap.values()).map((v) => v.resource) : [];

    const filtered = all.filter((res) => {
      // _id param
      const idParam = params.get('_id');
      if (idParam && res.id !== idParam) return false;

      // patient or subject param
      const patParam = params.get('patient') || params.get('subject');
      if (patParam) {
        const ref = res.subject?.reference || res.patient?.reference || '';
        const bareRef = ref.replace(/^(Patient\/)/, '');
        const bareParam = patParam.replace(/^(Patient\/)/, '');
        if (bareRef !== bareParam && ref !== patParam) return false;
      }

      // code param
      const codeParam = params.get('code');
      if (codeParam) {
        const codings = res.code?.coding || [];
        const hasCode = codings.some((c) => c.code === codeParam || `${c.system}|${c.code}` === codeParam);
        if (!hasCode) return false;
      }

      // date param prefix
      const dateParam = params.get('date');
      if (dateParam) {
        const eff = res.effectiveDateTime || res.performedDateTime || res.recordedDate || res.period?.start || '';
        if (!eff.startsWith(dateParam)) return false;
      }

      return true;
    });

    const bundle: FhirSearchSet = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: filtered.length,
      entry: filtered.map((r) => ({
        fullUrl: `${this.baseUrl}/${resourceType}/${r.id}`,
        resource: r,
      })),
    };

    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: { 'Content-Type': 'application/fhir+json' },
    });
  }

  private handleCreate(resourceType: string, body: SyntheticResource): Response {
    const id = body.id || randomUUID();
    let typeMap = this.resources.get(resourceType);
    if (!typeMap) {
      typeMap = new Map();
      this.resources.set(resourceType, typeMap);
    }
    const version = 1;
    const now = new Date().toISOString();
    const stored: SyntheticResource = {
      ...body,
      resourceType,
      id,
      meta: {
        ...(body.meta ?? {}),
        versionId: String(version),
        lastUpdated: now,
      },
    };
    typeMap.set(id, { resource: stored, version, lastUpdated: now });

    return new Response(JSON.stringify(stored), {
      status: 201,
      headers: {
        'Content-Type': 'application/fhir+json',
        Location: `${this.baseUrl}/${resourceType}/${id}/_history/1`,
        ETag: `W/"1"`,
      },
    });
  }

  private handleUpdate(resourceType: string, id: string, body: SyntheticResource, ifMatch: string | null): Response {
    let typeMap = this.resources.get(resourceType);
    if (!typeMap) {
      typeMap = new Map();
      this.resources.set(resourceType, typeMap);
    }
    const existing = typeMap.get(id);

    if (ifMatch && existing) {
      const matchVersion = ifMatch.replace(/^W\/"|"$/g, '');
      if (matchVersion !== '*' && matchVersion !== String(existing.version)) {
        const outcome: FhirOperationOutcome = {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'conflict',
              diagnostics: `Version mismatch: server has version ${existing.version}, If-Match requested ${matchVersion}`,
            },
          ],
        };
        return new Response(JSON.stringify(outcome), {
          status: 412,
          headers: { 'Content-Type': 'application/fhir+json' },
        });
      }
    }

    const version = (existing?.version ?? 0) + 1;
    const now = new Date().toISOString();
    const stored: SyntheticResource = {
      ...body,
      resourceType,
      id,
      meta: {
        ...(body.meta ?? {}),
        versionId: String(version),
        lastUpdated: now,
      },
    };
    typeMap.set(id, { resource: stored, version, lastUpdated: now });

    return new Response(JSON.stringify(stored), {
      status: existing ? 200 : 201,
      headers: {
        'Content-Type': 'application/fhir+json',
        Location: `${this.baseUrl}/${resourceType}/${id}/_history/${version}`,
        ETag: `W/"${version}"`,
      },
    });
  }

  private handleBundleTransaction(bundle: SyntheticBundle): Response {
    if (!bundle || bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
      return new Response(
        JSON.stringify({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Expected Bundle with entry array' }],
        }),
        { status: 400, headers: { 'Content-Type': 'application/fhir+json' } }
      );
    }

    const responseEntries: Array<{
      response: {
        status: string;
        location?: string;
        etag?: string;
        outcome?: FhirOperationOutcome;
      };
      resource?: SyntheticResource;
    }> = [];

    for (const entry of bundle.entry) {
      const resource = entry.resource;
      const request = entry.request || {};
      const method = (request.method || (resource ? 'POST' : 'GET')).toUpperCase();
      const url = request.url || (resource ? resource.resourceType : '');

      if (!url) {
        responseEntries.push({
          response: {
            status: '400 Bad Request',
            outcome: {
              resourceType: 'OperationOutcome',
              issue: [{ severity: 'error', code: 'required', diagnostics: 'Missing entry request url' }],
            },
          },
        });
        continue;
      }

      const parts = url.split('/').filter(Boolean);
      const resType = parts[0]!;
      const resId = parts[1] || (resource ? resource.id : undefined);

      if (method === 'POST') {
        const id = resId || randomUUID();
        let typeMap = this.resources.get(resType);
        if (!typeMap) {
          typeMap = new Map();
          this.resources.set(resType, typeMap);
        }
        const now = new Date().toISOString();
        const stored = {
          ...resource,
          resourceType: resType,
          id,
          meta: { ...(resource?.meta ?? {}), versionId: '1', lastUpdated: now },
        };
        typeMap.set(id, { resource: stored, version: 1, lastUpdated: now });
        responseEntries.push({
          response: {
            status: '201 Created',
            location: `${this.baseUrl}/${resType}/${id}/_history/1`,
            etag: 'W/"1"',
          },
          resource: stored,
        });
      } else if (method === 'PUT') {
        if (!resId) {
          responseEntries.push({
            response: {
              status: '400 Bad Request',
              outcome: {
                resourceType: 'OperationOutcome',
                issue: [{ severity: 'error', code: 'required', diagnostics: 'PUT requires an ID' }],
              },
            },
          });
          continue;
        }
        let typeMap = this.resources.get(resType);
        if (!typeMap) {
          typeMap = new Map();
          this.resources.set(resType, typeMap);
        }
        const existing = typeMap.get(resId);
        const ver = (existing?.version ?? 0) + 1;
        const now = new Date().toISOString();
        const stored = {
          ...resource,
          resourceType: resType,
          id: resId,
          meta: { ...(resource?.meta ?? {}), versionId: String(ver), lastUpdated: now },
        };
        typeMap.set(resId, { resource: stored, version: ver, lastUpdated: now });
        responseEntries.push({
          response: {
            status: existing ? '200 OK' : '201 Created',
            location: `${this.baseUrl}/${resType}/${resId}/_history/${ver}`,
            etag: `W/"${ver}"`,
          },
          resource: stored,
        });
      } else {
        responseEntries.push({
          response: {
            status: '200 OK',
          },
        });
      }
    }

    const txResponse: FhirTransactionResponse = {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: responseEntries,
    };

    return new Response(JSON.stringify(txResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/fhir+json' },
    });
  }

  private notFoundResponse(message: string): Response {
    const outcome: FhirOperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics: message }],
    };
    return new Response(JSON.stringify(outcome), {
      status: 404,
      headers: { 'Content-Type': 'application/fhir+json' },
    });
  }
}
