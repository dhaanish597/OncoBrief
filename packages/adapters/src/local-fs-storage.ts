import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import type { StoragePort } from '@oncobrief/ports';

/**
 * Local filesystem storage adapter (ADR 0013).
 *
 * Presigned GETs are HMAC-signed application tokens rather than S3 signatures.
 * The same rules apply: private access only, short TTL, and the issuer must
 * assert the tenant prefix before signing.
 */
export class LocalFsStorageAdapter implements StoragePort {
  constructor(
    private readonly root: string,
    private readonly secret: string,
  ) {}

  private absolute(key: string): string {
    const safe = normalize(key).replace(/^(\.\.[/\\])+/, '');
    const abs = resolve(join(this.root, safe));
    if (!abs.startsWith(resolve(this.root))) {
      throw new Error('storage_key_escape');
    }
    return abs;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<{ sha256: string }> {
    const abs = this.absolute(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
    return { sha256: createHash('sha256').update(body).digest('hex') };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.absolute(key));
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${key}\n${expires}`;
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    const params = new URLSearchParams({ key, expires: String(expires), sig });
    return `/api/v1/storage/local?${params.toString()}`;
  }

  /** Verify an HMAC token minted by presignGet. Returns the key or null. */
  verifyPresign(key: string, expires: string, sig: string): { key: string } | null {
    const exp = Number(expires);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
    const expected = createHmac('sha256', this.secret)
      .update(`${key}\n${exp}`)
      .digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { key };
  }

  async delete(key: string): Promise<void> {
    await rm(this.absolute(key), { force: true });
  }
}
