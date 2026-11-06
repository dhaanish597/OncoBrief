import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRandomBytes, generateEncryptionKey, encryptEnvelope } from '../src/crypto-envelope';

test('encryption fails closed when the runtime has no cryptographically secure random source', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    assert.throws(() => getRandomBytes(32), /secure random/i);
    assert.throws(() => generateEncryptionKey(), /secure random/i);
    await assert.rejects(encryptEnvelope('sensitive metadata', new Uint8Array(32)), /secure random/i);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});

test('encryption uses fresh IVs from the runtime CSPRNG', async () => {
  const key = generateEncryptionKey();
  const first = await encryptEnvelope('same plaintext', key);
  const second = await encryptEnvelope('same plaintext', key);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(Buffer.from(first.iv, 'base64').length, 12);
});
