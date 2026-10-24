import { afterAll, beforeAll, expect, it } from 'vitest';
import { getMigratorPool, closePools } from '../src/client';
import { seed } from '../src/seed';
import { setupFixtures } from './helpers';
beforeAll(setupFixtures,120_000);
afterAll(closePools);
it('refuses reseeding a mixed PostgreSQL database without losing any rows', async()=>{
  const pool=getMigratorPool();
  const before=(await pool.query('SELECT count(*)::int n FROM patient')).rows[0].n;
  const mixed=(await pool.query(`INSERT INTO organization(slug,name,is_demo_fixture) VALUES('review-non-demo-guard','Synthetic guard sentinel',false) RETURNING id`)).rows[0].id;
  try {
    await expect(seed()).rejects.toThrow('demo_reset_non_synthetic_data');
    expect((await pool.query('SELECT count(*)::int n FROM patient')).rows[0].n).toBe(before);
    expect((await pool.query('SELECT id FROM organization WHERE id=$1',[mixed])).rowCount).toBe(1);
  }finally{await pool.query('DELETE FROM organization WHERE id=$1',[mixed]);}
});
