import { describe, expect, it } from 'vitest';
import { resolvePoolOptions, resolveTrustedCa } from '../src/client';

describe('PostgreSQL TLS verification configuration (Phase 1 / Workstream D1)', () => {
  it('local development connection strings without sslmode do not configure ssl', () => {
    const connStr = 'postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief';
    const opts = resolvePoolOptions(connStr);
    expect(opts.connectionString).toBe(connStr);
    expect(opts.ssl).toBeUndefined();
  });

  it('explicit sslmode=disable strips the parameter and does not configure ssl', () => {
    const connStr = 'postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief?sslmode=disable';
    const opts = resolvePoolOptions(connStr);
    expect(opts.connectionString).toBe('postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief');
    expect(opts.ssl).toBeUndefined();
  });

  it('sslmode=require uses verified TLS with rejectUnauthorized: true and the bundled RDS CA', () => {
    const connStr =
      'postgres://oncobrief_app:secret@oncobrief-dev-db.c1234567890.ap-south-1.rds.amazonaws.com:5432/oncobrief?sslmode=require';
    const opts = resolvePoolOptions(connStr);

    expect(opts.ssl).toBeDefined();
    expect(opts.ssl?.rejectUnauthorized).toBe(true);
    expect(opts.ssl?.ca).toContain('-----BEGIN CERTIFICATE-----');
    expect(opts.ssl?.servername).toBe('oncobrief-dev-db.c1234567890.ap-south-1.rds.amazonaws.com');
    expect(opts.connectionString).not.toContain('sslmode=require');
  });

  it('sslmode=verify-full uses verified TLS with SNI servername matching host', () => {
    const connStr =
      'postgres://oncobrief_app:secret@db.oncobrief.internal:5432/oncobrief?sslmode=verify-full&uselibpqcompat=true';
    const opts = resolvePoolOptions(connStr);

    expect(opts.ssl).toBeDefined();
    expect(opts.ssl?.rejectUnauthorized).toBe(true);
    expect(opts.ssl?.servername).toBe('db.oncobrief.internal');
    expect(opts.connectionString).not.toContain('sslmode=');
    expect(opts.connectionString).not.toContain('uselibpqcompat=');
  });

  it('accepts custom inline CA certificate override', () => {
    const customCa = '-----BEGIN CERTIFICATE-----\nMIIFakeTestCert...\n-----END CERTIFICATE-----';
    const connStr = 'postgres://app:pwd@remote-db.example.com:5432/db?sslmode=require';
    const opts = resolvePoolOptions(connStr, { ca: customCa });

    expect(opts.ssl).toBeDefined();
    expect(opts.ssl?.rejectUnauthorized).toBe(true);
    expect(opts.ssl?.ca).toBe(customCa);
    expect(opts.ssl?.servername).toBe('remote-db.example.com');
  });

  it('fails closed when SSL is requested but no CA certificate can be found', () => {
    const connStr = 'postgres://app:pwd@remote-db.example.com:5432/db?sslmode=require';
    // Provide a non-existent caPath and empty inline CA, in an environment where no CA exists
    expect(() =>
      resolvePoolOptions(connStr, { ca: '   ', caPath: '/tmp/nonexistent-ca-path-12345.pem' }),
    ).toThrow(/Database TLS verification failed/);
  });

  it('resolveTrustedCa decodes base64-encoded PEM certificates', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nTESTDATA\n-----END CERTIFICATE-----';
    const b64 = Buffer.from(pem).toString('base64');
    const resolved = resolveTrustedCa(b64);
    expect(resolved).toBe(pem);
  });
});
