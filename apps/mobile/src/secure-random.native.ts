import { getRandomValues } from 'expo-crypto';

/** Native CSPRNG; deliberately avoids getRandomBytes and its development PRNG fallback. */
export function getRandomBytes(length: number): Uint8Array {
  // Expo throws if native secure randomness is unavailable; never substitute weak entropy.
  return getRandomValues(new Uint8Array(length));
}
