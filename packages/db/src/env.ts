import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Load the repository-root `.env` regardless of which workspace script runs.
 * `.env` is git-ignored; `.env.example` documents every key.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const repoRoot = findRepoRoot(process.cwd());
const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) loadDotenv({ path: envPath });
else if (existsSync(resolve(repoRoot, '.env.example'))) loadDotenv({ path: resolve(repoRoot, '.env.example') });

export const repoRootPath = repoRoot;

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

export const env = {
  get databaseUrl(): string {
    return required(
      'DATABASE_URL',
      'postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief',
    );
  },
  get migratorUrl(): string {
    return required('DATABASE_MIGRATOR_URL', 'postgres://postgres:postgres@localhost:5432/oncobrief');
  },
  get databaseSslCa(): string | undefined {
    return process.env.DATABASE_SSL_CA;
  },
  get databaseSslCaPath(): string | undefined {
    return process.env.DATABASE_SSL_CA_PATH;
  },
  get sessionSecret(): string {
    return required('SESSION_COOKIE_SECRET', 'dev-only-insecure-secret-replace-me');
  },
  get storageDriver(): 'fs' | 's3' {
    return (process.env.STORAGE_DRIVER ?? 'fs') as 'fs' | 's3';
  },
  get storageFsRoot(): string {
    return resolve(repoRoot, process.env.STORAGE_FS_ROOT ?? '.var/storage');
  },
  get s3(): {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    forcePathStyle: boolean;
  } {
    const endpoint = process.env.STORAGE_S3_ENDPOINT || process.env.AWS_ENDPOINT_URL;
    return {
      ...(endpoint ? { endpoint } : {}),
      region: process.env.STORAGE_S3_REGION ?? process.env.AWS_REGION ?? 'ap-south-1',
      bucket: process.env.STORAGE_S3_BUCKET ?? 'oncobrief-documents',
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
      ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
      forcePathStyle: (process.env.STORAGE_S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    };
  },
  get authMode(): 'session' | 'cognito' {
    return (process.env.AUTH_MODE ?? 'session') as 'session' | 'cognito';
  },
  get cognito(): {
    region: string;
    userPoolId: string;
    clientId: string;
    issuer?: string;
  } {
    const region = process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'ap-south-1';
    const userPoolId = process.env.COGNITO_USER_POOL_ID ?? '';
    const issuer =
      process.env.COGNITO_ISSUER ??
      (userPoolId ? `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` : undefined);
    return {
      region,
      userPoolId,
      clientId: process.env.COGNITO_CLIENT_ID ?? '',
      ...(issuer ? { issuer } : {}),
    };
  },
  get demoMode(): boolean {
    return (process.env.ONCOBRIEF_DEMO_MODE ?? 'true') === 'true';
  },
  get ocrDriver(): 'auto' | 'sarvam' | 'textract' | 'local-pdf' | 'fixture' {
    return (process.env.OCR_DRIVER ?? 'auto') as 'auto' | 'sarvam' | 'textract' | 'local-pdf' | 'fixture';
  },
  get sarvamApiKey(): string | undefined {
    return process.env.SARVAM_API_KEY;
  },
  get abdm(): {
    driver: 'simulated' | 'sandbox';
    cmId: string;
    baseUrl: string;
    sessionUrl: string;
    abhaBaseUrl: string;
    clientId: string;
    clientSecret: string;
    hipId: string;
    hiuId: string;
    hfrFacilityId: string;
    callbackBaseUrl: string;
  } {
    const driver = (process.env.ABDM_DRIVER ?? 'simulated') as 'simulated' | 'sandbox';
    const clientId = process.env.ABDM_CLIENT_ID ?? '';
    const clientSecret = process.env.ABDM_CLIENT_SECRET ?? '';

    if (driver === 'sandbox' && (!clientId || !clientSecret)) {
      throw new Error(
        'missing_abdm_credentials: ABDM_DRIVER is set to "sandbox" but ABDM_CLIENT_ID and ABDM_CLIENT_SECRET are not configured.',
      );
    }

    return {
      driver,
      cmId: process.env.ABDM_CM_ID ?? 'sbx',
      baseUrl: process.env.ABDM_BASE_URL ?? 'https://dev.abdm.gov.in/api/hiecm',
      sessionUrl:
        process.env.ABDM_SESSION_URL ?? 'https://dev.abdm.gov.in/api/hiecm/gateway/v3/sessions',
      abhaBaseUrl:
        process.env.ABDM_ABHA_BASE_URL ?? 'https://abhasbx.abdm.gov.in/abha/api/v3',
      clientId,
      clientSecret,
      hipId: process.env.ABDM_HIP_ID ?? 'ONCOBRIEF-HIP-SBX',
      hiuId: process.env.ABDM_HIU_ID ?? 'ONCOBRIEF-HIU-SBX',
      hfrFacilityId: process.env.ABDM_HFR_FACILITY_ID ?? 'IN-HOSP-001',
      callbackBaseUrl: process.env.ABDM_CALLBACK_BASE_URL ?? 'http://localhost:3000',
    };
  },
  isTest(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  },
};
