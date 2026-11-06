import type { AwsCredentials } from './aws-sigv4';

/** Short-lived credentials from the ECS task metadata endpoint. No arbitrary URL input. */
export function createEcsCredentialsProvider(
  relativeUri: string,
  options: { fetchImpl?: typeof fetch; now?: () => number } = {},
): () => Promise<AwsCredentials> {
  if (!/^\/v2\/credentials\/[A-Za-z0-9_-]+$/.test(relativeUri)) {
    throw new Error('invalid_ecs_credentials_path');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cached: { credentials: AwsCredentials; expires: number } | undefined;
  let pending: Promise<AwsCredentials> | undefined;
  return async () => {
    if (cached && cached.expires - now() > 120_000) return cached.credentials;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetchImpl(`http://169.254.170.2${relativeUri}`, {
        signal: AbortSignal.timeout(2000), redirect: 'error',
      });
      if (!response.ok) throw new Error('ecs_credentials_unavailable');
      const body = await response.json() as Record<string, unknown>;
      const expires = typeof body.Expiration === 'string' ? Date.parse(body.Expiration) : NaN;
      if (typeof body.AccessKeyId !== 'string' || !body.AccessKeyId ||
          typeof body.SecretAccessKey !== 'string' || !body.SecretAccessKey ||
          typeof body.Token !== 'string' || !body.Token || !Number.isFinite(expires) || expires <= now()) {
        throw new Error('invalid_ecs_credentials_response');
      }
      const credentials = { accessKeyId: body.AccessKeyId, secretAccessKey: body.SecretAccessKey, sessionToken: body.Token };
      cached = { credentials, expires };
      return credentials;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
