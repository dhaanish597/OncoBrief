import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireFixtureDatabaseUrl } from '../e2e/fixture-database';

test('destructive mobile E2E setup requires an explicit isolated migrator database', () => {
  const accepted = 'postgresql://owner:secret@127.0.0.1:55432/oncobrief_mobile_e2e';
  assert.equal(requireFixtureDatabaseUrl({ DATABASE_MIGRATOR_URL: accepted }), accepted);
  for (const value of [undefined, 'invalid',
    'postgresql://owner:secret@127.0.0.1/oncobrief_mobile_e2e',
    'postgresql://owner:secret@db.example:55432/oncobrief_mobile_e2e',
    'postgresql://owner:secret@127.0.0.1:55432/oncobrief',
    `${accepted}?host=db.example`, `${accepted}?port=5432`, `${accepted}?dbname=oncobrief`, `${accepted}?service=prod`,
  ]) {
    assert.throws(() => requireFixtureDatabaseUrl({ DATABASE_URL: accepted, DATABASE_MIGRATOR_URL: value }), /requires DATABASE_MIGRATOR_URL/);
  }
  assert.throws(() => requireFixtureDatabaseUrl({ DATABASE_MIGRATOR_URL: accepted, NODE_ENV: 'production' }), /requires DATABASE_MIGRATOR_URL/);
});
