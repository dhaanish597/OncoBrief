/** Browser and Node CSPRNG. Refuse encryption when secure randomness is unavailable. */
export function getRandomBytes(length: number): Uint8Array {
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Cryptographically secure random generation is unavailable');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
