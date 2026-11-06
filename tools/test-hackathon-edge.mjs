import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const authorization = 'Basic synthetic-test-credential';
const code = readFileSync(new URL('../infra/environments/hackathon/evaluator.js.tftpl', import.meta.url), 'utf8')
  .replace('${auth_hash}', createHash('sha256').update(authorization).digest('hex'));
const handler = runInNewContext(`${code}; handler`, { require: (name) => {
  assert.equal(name, 'crypto');
  return { createHash };
} });

test('rejects unauthenticated and incorrect credentials on pages, APIs and static assets', () => {
  for (const uri of ['/', '/login', '/api/v1/health', '/_next/static/app.js']) {
    for (const headers of [{}, { authorization: { value: 'Basic incorrect' } }]) {
      const response = handler({ request: { uri, headers } });
      assert.equal(response.statusCode, 401);
      assert.equal(response.headers['cache-control'].value, 'private, no-store');
    }
  }
});

test('permits correct credentials and removes the edge password before the application', () => {
  const request = { uri: '/workspace', headers: { authorization: { value: authorization } } };
  assert.equal(handler({ request }), request);
  assert.equal(request.headers.authorization, undefined);
});
