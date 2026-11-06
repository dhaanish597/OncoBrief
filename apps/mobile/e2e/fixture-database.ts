/** Validate the isolated database before the E2E harness can construct a destructive setup pool. */
export function requireFixtureDatabaseUrl(env: Record<string, string | undefined>): string {
  const connectionString = env.DATABASE_MIGRATOR_URL;
  const error = 'Mobile E2E setup requires DATABASE_MIGRATOR_URL targeting an explicit loopback port and dedicated test/e2e/verify database';
  if (!connectionString) throw new Error(error);
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(error);
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (env.NODE_ENV === 'production' || !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.port ||
      !/^[a-z0-9_-]+$/i.test(database) || !/(?:^|[_-])(?:test|e2e|verify)(?:[_-]|$)/i.test(database) ||
      url.search !== '') {
    throw new Error(error);
  }
  return connectionString;
}
