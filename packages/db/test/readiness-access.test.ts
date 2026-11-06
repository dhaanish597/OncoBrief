import { afterAll, beforeAll, expect, it } from 'vitest';
import { closePools, getAppPool } from '../src/client';
import { setupFixtures } from './helpers';

beforeAll(setupFixtures, 120_000);
afterAll(closePools);
it('allows the non-owner runtime role to read migration identities for readiness', async () => {
  const result = await getAppPool().query<{ id: string }>('SELECT id FROM schema_migration');
  expect(result.rows.some(row => row.id === '0023_fhir_interoperability.sql')).toBe(true);
});
