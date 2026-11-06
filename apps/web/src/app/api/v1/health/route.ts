import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { getAppPool, repoRootPath } from '@oncobrief/db';

export const dynamic = 'force-dynamic';

/** Minimal readiness response: no patient records, SQL details, or credentials. */
export async function GET(): Promise<NextResponse> {
  let ready = false;
  try {
    const expected = readdirSync(resolve(repoRootPath, 'packages/db/migrations')).filter(n => n.endsWith('.sql'));
    const queryConfig = {
      text: 'SELECT id FROM schema_migration', query_timeout: 1500,
    };
    const applied = await getAppPool().query<{ id: string }>(queryConfig);
    const ids = new Set(applied.rows.map(row => row.id));
    ready = expected.length > 0 && expected.every(id => ids.has(id));
  } catch { /* Readiness deliberately fails closed without serializing the exception. */ }
  return NextResponse.json({ status: ready ? 'ok' : 'unavailable' }, {
    status: ready ? 200 : 503,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
