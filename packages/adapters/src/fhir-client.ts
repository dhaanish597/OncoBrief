import type {
  FhirCapabilityStatement,
  FhirClientOptions,
  FhirClientPort,
  FhirOperationOutcome,
  FhirSearchSet,
  FhirTransactionResponse,
} from '@oncobrief/ports';

export class FhirHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly operationOutcome?: FhirOperationOutcome,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'FhirHttpError';
  }
}

export interface HttpFhirClientOptions extends FhirClientOptions {
  fetchFn?: typeof fetch;
  backoffInitialMs?: number;
}

export class HttpFhirClientAdapter implements FhirClientPort {
  readonly name = 'http-fhir-client';

  private readonly baseUrl: string;
  private readonly authKind: string;
  private readonly authToken?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly allowedHostnames: string[];
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffInitialMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: HttpFhirClientOptions) {
    if (!options.baseUrl) {
      throw new Error('baseUrl is required for HttpFhirClientAdapter');
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authKind = options.authKind ?? 'none';
    this.authToken = options.authToken;
    this.username = options.username;
    this.password = options.password;
    this.allowedHostnames = options.allowedHostnames ?? [];
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxRetries = options.maxRetries ?? 3;
    this.backoffInitialMs = options.backoffInitialMs ?? 50;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;

    this.validateUrlSsrf(this.baseUrl);
  }

  private validateUrlSsrf(rawUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid FHIR server URL: ${rawUrl}`);
    }

    // 1. Enforce safe protocol scheme
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`[SSRF_PROTECTED] Unsupported or dangerous protocol scheme: ${parsed.protocol}`);
    }

    // 2. Reject embedded URL credentials
    if (parsed.username || parsed.password) {
      throw new Error('[SSRF_PROTECTED] Embedded credentials in URL prohibited');
    }

    let host = parsed.hostname.toLowerCase().trim();

    // Strip IPv6 brackets if present
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }

    // 3. Reject malformed hostnames
    if (!host || host.includes(' ') || host.includes('\\') || host.includes('\t')) {
      throw new Error(`[SSRF_PROTECTED] Malformed hostname: ${host}`);
    }

    // If explicit wildcard or host match in allowedHostnames, allow
    if (this.allowedHostnames.includes('*') || this.allowedHostnames.includes(host)) {
      return;
    }

    // 4. Decode integer/dword numeric IP aliases (e.g. 2130706433 -> 127.0.0.1)
    if (/^\d+$/.test(host)) {
      const num = parseInt(host, 10);
      if (num >= 0 && num <= 4294967295) {
        host = `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;
      }
    }

    // 5. Decode hex or octal IP aliases
    if (/^0x[0-9a-f]+$/i.test(host)) {
      const num = parseInt(host, 16);
      if (num >= 0 && num <= 4294967295) {
        host = `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;
      }
    } else if (/^0\d+(\.0\d+)*$/.test(host)) {
      const parts = host.split('.').map((p) => parseInt(p, 8));
      if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
        host = parts.join('.');
      }
    }

    // 6. Handle IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (host.startsWith('::ffff:')) {
      const remainder = host.slice(7);
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(remainder)) {
        host = remainder;
      } else {
        const hexParts = remainder.split(':');
        if (hexParts.length === 2) {
          const p1 = parseInt(hexParts[0]!, 16);
          const p2 = parseInt(hexParts[1]!, 16);
          if (!isNaN(p1) && !isNaN(p2)) {
            host = `${(p1 >>> 8) & 255}.${p1 & 255}.${(p2 >>> 8) & 255}.${p2 & 255}`;
          }
        }
      }
    }

    // 7. Loopback checks
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      throw new Error(`[SSRF_PROTECTED] Blocked request to local loopback host: ${host}`);
    }

    // 8. Cloud metadata checks (AWS, GCP, Azure, Alibaba)
    if (
      host === '169.254.169.254' ||
      host === '100.100.100.200' ||
      host === 'metadata.google.internal' ||
      host === 'instance-data' ||
      host === 'fd00:ec2::254' ||
      host.endsWith('.metadata.google.internal')
    ) {
      throw new Error(`[SSRF_PROTECTED] Blocked request to cloud metadata service: ${host}`);
    }

    // 9. IPv4 private and link-local ranges
    // 10.0.0.0/8
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      throw new Error(`[SSRF_PROTECTED] Blocked request to private IPv4 network: ${host}`);
    }
    // 192.168.0.0/16
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
      throw new Error(`[SSRF_PROTECTED] Blocked request to private IPv4 network: ${host}`);
    }
    // 172.16.0.0/12 (172.16 - 172.31)
    const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (match172 && match172[1]) {
      const secondOctet = parseInt(match172[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        throw new Error(`[SSRF_PROTECTED] Blocked request to private IPv4 network: ${host}`);
      }
    }
    // 169.254.0.0/16 (link-local)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) {
      throw new Error(`[SSRF_PROTECTED] Blocked request to link-local address: ${host}`);
    }
    // 127.0.0.0/8
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      throw new Error(`[SSRF_PROTECTED] Blocked request to loopback address: ${host}`);
    }

    // 10. IPv6 private ranges (fc00::/7, fe80::/10, fd00::/8)
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      throw new Error(`[SSRF_PROTECTED] Blocked request to private IPv6 address: ${host}`);
    }
  }

  private buildHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/fhir+json, application/json',
      'Content-Type': 'application/fhir+json',
      ...extraHeaders,
    };

    if (this.authKind === 'bearer' && this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else if (this.authKind === 'basic' && (this.username || this.password)) {
      const credentials = Buffer.from(`${this.username ?? ''}:${this.password ?? ''}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  private async executeWithRetry<T>(fn: () => Promise<Response>): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fn();
        // Check for retryable HTTP status codes
        if ([429, 502, 503, 504].includes(response.status) && attempt < this.maxRetries) {
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000 || this.backoffInitialMs * Math.pow(2, attempt)
            : this.backoffInitialMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        return response;
      } catch (err: any) {
        lastError = err;
        // Don't retry aborts, SSRF errors, or non-transient network breaks if maxed
        if (err?.message?.includes('[SSRF_PROTECTED]')) {
          throw err;
        }
        if (attempt < this.maxRetries) {
          const delayMs = this.backoffInitialMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async dispatchRequest(url: string, init: RequestInit, maxRedirects = 3): Promise<Response> {
    this.validateUrlSsrf(url);
    const initialUrl = new URL(url);

    let currentUrl = url;
    let redirectsCount = 0;

    while (true) {
      const response = await this.executeWithRetry(() =>
        this.fetchFn(currentUrl, {
          ...init,
          redirect: 'manual',
        })
      );

      // Check for HTTP redirect status codes
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location') || response.headers.get('location');
        if (!location) {
          return response;
        }

        redirectsCount++;
        if (redirectsCount > maxRedirects) {
          throw new Error(`[SSRF_PROTECTED] Exceeded maximum allowed redirects (${maxRedirects})`);
        }

        const targetUrl = new URL(location, currentUrl).toString();
        // Validate target URL against SSRF policy
        this.validateUrlSsrf(targetUrl);

        const targetParsed = new URL(targetUrl);
        // Verify cross-origin redirect
        if (
          targetParsed.origin !== initialUrl.origin &&
          !this.allowedHostnames.includes('*') &&
          !this.allowedHostnames.includes(targetParsed.hostname.toLowerCase())
        ) {
          throw new Error(`[SSRF_PROTECTED] Blocked untrusted cross-origin redirect to: ${targetUrl}`);
        }

        currentUrl = targetUrl;
        continue;
      }

      return response;
    }
  }

  private parseEtagVersion(etag?: string | null): string | undefined {
    if (!etag) return undefined;
    const match = /W\/"?([^"]+)"?/i.exec(etag) || /"?([^"]+)"?/.exec(etag);
    return match ? match[1] : undefined;
  }

  private async handleResponse<T = Record<string, unknown>>(
    res: Response
  ): Promise<{ data: T; etag?: string; status: number; location?: string }> {
    const text = await res.text();
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // Raw text response
      }
    }

    if (!res.ok) {
      let operationOutcome: FhirOperationOutcome | undefined;
      let diagMessage = `FHIR HTTP ${res.status} ${res.statusText}`;

      if (json && json.resourceType === 'OperationOutcome') {
        operationOutcome = json as FhirOperationOutcome;
        const firstIssue = operationOutcome.issue?.[0];
        if (firstIssue?.diagnostics) {
          diagMessage = `${diagMessage}: ${firstIssue.diagnostics}`;
        }
      }

      throw new FhirHttpError(diagMessage, res.status, operationOutcome, text);
    }

    return {
      data: json as T,
      etag: res.headers.get('ETag') || undefined,
      status: res.status,
      location: res.headers.get('Location') || undefined,
    };
  }

  async getCapabilityStatement(): Promise<FhirCapabilityStatement> {
    const url = `${this.baseUrl}/metadata`;
    const res = await this.dispatchRequest(url, {
      method: 'GET',
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = await this.handleResponse<FhirCapabilityStatement>(res);
    return result.data;
  }

  async readResource<T = Record<string, unknown>>(
    resourceType: string,
    id: string
  ): Promise<{ resource: T; etag?: string }> {
    const url = `${this.baseUrl}/${encodeURIComponent(resourceType)}/${encodeURIComponent(id)}`;
    const res = await this.dispatchRequest(url, {
      method: 'GET',
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = await this.handleResponse<T>(res);
    return {
      resource: result.data,
      etag: result.etag,
    };
  }

  async searchResources<T = Record<string, unknown>>(
    resourceType: string,
    params: Record<string, string>
  ): Promise<FhirSearchSet<T>> {
    const searchParams = new URLSearchParams(params);
    const url = `${this.baseUrl}/${encodeURIComponent(resourceType)}?${searchParams.toString()}`;
    const res = await this.dispatchRequest(url, {
      method: 'GET',
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = await this.handleResponse<FhirSearchSet<T>>(res);
    return result.data;
  }

  async createResource<T = Record<string, unknown>>(
    resourceType: string,
    resource: T
  ): Promise<{ id: string; versionId?: string; etag?: string; resource: T }> {
    const url = `${this.baseUrl}/${encodeURIComponent(resourceType)}`;
    const res = await this.dispatchRequest(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(resource),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = await this.handleResponse<T>(res);
    const dataAny = result.data as any;
    const versionId = this.parseEtagVersion(result.etag) || dataAny?.meta?.versionId;
    return {
      id: dataAny?.id || '',
      versionId,
      etag: result.etag,
      resource: result.data,
    };
  }

  async updateResource<T = Record<string, unknown>>(
    resourceType: string,
    id: string,
    resource: T,
    ifMatchVersion?: string
  ): Promise<{ id: string; versionId?: string; etag?: string; resource: T }> {
    const url = `${this.baseUrl}/${encodeURIComponent(resourceType)}/${encodeURIComponent(id)}`;
    const extraHeaders: Record<string, string> = {};
    if (ifMatchVersion) {
      extraHeaders['If-Match'] = ifMatchVersion.startsWith('W/') ? ifMatchVersion : `W/"${ifMatchVersion}"`;
    }

    const res = await this.dispatchRequest(url, {
      method: 'PUT',
      headers: this.buildHeaders(extraHeaders),
      body: JSON.stringify(resource),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = await this.handleResponse<T>(res);
    const dataAny = result.data as any;
    const versionId = this.parseEtagVersion(result.etag) || dataAny?.meta?.versionId;
    return {
      id: dataAny?.id || id,
      versionId,
      etag: result.etag,
      resource: result.data,
    };
  }

  async submitBundle(bundle: Record<string, unknown>): Promise<FhirTransactionResponse> {
    const url = `${this.baseUrl}/`;
    const res = await this.dispatchRequest(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(bundle),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = await this.handleResponse<FhirTransactionResponse>(res);
    return result.data;
  }
}
