import { signRequest, type AwsCredentials } from './aws-sigv4';

/**
 * Minimal AWS Secrets Manager reader (ADR 0015).
 *
 * Used by the admin Lambda to resolve the RDS-managed master credential so no
 * database password ever appears in source, Terraform, a payload, or a log.
 * Zero dependencies, consistent with the other AWS adapters.
 */

export interface SecretsManagerConfig {
  region: string;
  credentials: AwsCredentials;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface GetSecretValueResponse {
  SecretString?: string;
  SecretBinary?: string;
}

export async function getSecretString(
  secretArn: string,
  config: SecretsManagerConfig,
): Promise<string> {
  const endpoint = config.endpoint ?? `https://secretsmanager.${config.region}.amazonaws.com`;
  const parsed = new URL(endpoint);
  const body = JSON.stringify({ SecretId: secretArn });
  const headers = signRequest({
    url: `${parsed.origin}/`,
    path: '/',
    region: config.region,
    service: 'secretsmanager',
    method: 'POST',
    credentials: config.credentials,
    now: (config.now ?? (() => new Date()))(),
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'secretsmanager.GetSecretValue',
    },
    body,
  });
  const res = await (config.fetchImpl ?? fetch)(`${parsed.origin}/`, { method: 'POST', headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`secretsmanager_get_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as GetSecretValueResponse;
  if (data.SecretString) return data.SecretString;
  if (data.SecretBinary) return Buffer.from(data.SecretBinary, 'base64').toString('utf8');
  throw new Error('secretsmanager_empty_secret');
}

export async function getSecretJson(
  secretArn: string,
  config: SecretsManagerConfig,
): Promise<Record<string, unknown>> {
  return JSON.parse(await getSecretString(secretArn, config)) as Record<string, unknown>;
}
