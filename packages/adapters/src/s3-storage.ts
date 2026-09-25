import { createHash } from 'node:crypto';
import type { PresignPutPort, PresignPutResult, StoragePort } from '@oncobrief/ports';
import { presign, signRequest, type AwsCredentials } from './aws-sigv4';

/**
 * Amazon S3 (and any S3-compatible store) storage adapter (ADR 0007, 0015).
 *
 * Private bucket only. Reads are short-lived presigned GETs. Uploads may use a
 * presigned PUT (`PresignPutPort`) so large PDFs never transit the application
 * process; the worker re-reads the object and recomputes SHA-256 and the MIME
 * type before any evidence is derived, so the stored hash is always
 * server-computed.
 */

export interface S3Config {
  bucket: string;
  region: string;
  credentials: AwsCredentials;
  /** Custom endpoint for LocalStack/MinIO. Omit for real AWS S3. */
  endpoint?: string;
  /** Path-style addressing (`/bucket/key`); default true for compatibility. */
  forcePathStyle?: boolean;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for deterministic signature tests. */
  now?: () => Date;
}

export class S3StorageAdapter implements StoragePort, PresignPutPort {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: S3Config) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  private base(): string {
    if (this.config.endpoint) return this.config.endpoint.replace(/\/$/, '');
    return `https://s3.${this.config.region}.amazonaws.com`;
  }

  /**
   * Address a key, consistently for signing and for the actual request.
   *  - path-style:     origin = endpoint,                  path = /{bucket}/{key}
   *  - virtual-hosted: origin = https://{bucket}.{host},   path = /{key}
   */
  private endpointFor(key: string): { origin: string; path: string } {
    const base = this.base();
    const pathStyle = this.config.forcePathStyle ?? true;
    if (pathStyle) {
      return { origin: base, path: `/${this.config.bucket}/${key}` };
    }
    const parsed = new URL(base);
    return { origin: `${parsed.protocol}//${this.config.bucket}.${parsed.host}`, path: `/${key}` };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<{ sha256: string }> {
    const { origin, path } = this.endpointFor(key);
    const headers = signRequest({
      url: origin,
      path,
      region: this.config.region,
      service: 's3',
      method: 'PUT',
      credentials: this.config.credentials,
      now: this.now(),
      headers: { 'content-type': contentType },
      body,
    });
    const res = await this.fetchImpl(`${origin}${path}`, {
      method: 'PUT',
      headers: { ...headers, 'content-length': String(body.byteLength) },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`s3_put_failed:${res.status}:${await errorBody(res)}`);
    return { sha256: createHash('sha256').update(body).digest('hex') };
  }

  async get(key: string): Promise<Buffer> {
    const { origin, path } = this.endpointFor(key);
    const headers = signRequest({
      url: origin,
      path,
      region: this.config.region,
      service: 's3',
      method: 'GET',
      credentials: this.config.credentials,
      now: this.now(),
    });
    const res = await this.fetchImpl(`${origin}${path}`, { method: 'GET', headers });
    if (!res.ok) throw new Error(`s3_get_failed:${res.status}:${await errorBody(res)}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    const { origin, path } = this.endpointFor(key);
    return presign({
      url: origin,
      path,
      region: this.config.region,
      service: 's3',
      method: 'GET',
      expiresSeconds: ttlSeconds,
      credentials: this.config.credentials,
      now: this.now(),
    }).url;
  }

  async presignPut(
    key: string,
    contentType: string,
    ttlSeconds: number,
    contentLengthBytes?: number,
  ): Promise<PresignPutResult> {
    const { origin, path } = this.endpointFor(key);
    const result = presign({
      url: origin,
      path,
      region: this.config.region,
      service: 's3',
      method: 'PUT',
      expiresSeconds: ttlSeconds,
      credentials: this.config.credentials,
      now: this.now(),
      contentType,
    });
    const requiredHeaders: Record<string, string> = { ...result.requiredHeaders };
    if (contentLengthBytes !== undefined) requiredHeaders['content-length'] = String(contentLengthBytes);
    return { url: result.url, expiresAt: result.expiresAt.toISOString(), requiredHeaders };
  }

  async delete(key: string): Promise<void> {
    const { origin, path } = this.endpointFor(key);
    const headers = signRequest({
      url: origin,
      path,
      region: this.config.region,
      service: 's3',
      method: 'DELETE',
      credentials: this.config.credentials,
      now: this.now(),
    });
    const res = await this.fetchImpl(`${origin}${path}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw new Error(`s3_delete_failed:${res.status}:${await errorBody(res)}`);
  }
}

/** Read a short error body for diagnosis without leaking whole payloads. */
async function errorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.replace(/\s+/g, ' ').slice(0, 240);
  } catch {
    return '';
  }
}
