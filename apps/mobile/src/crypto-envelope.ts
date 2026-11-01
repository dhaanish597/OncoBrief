/**
 * OncoBrief Patient Mobile - Cryptographic Envelope
 *
 * Implements authenticated encryption at rest using AES-256-GCM with:
 * - 256-bit CSPRNG key generation
 * - 96-bit (12-byte) random initialization vector (IV) per encryption
 * - 128-bit (16-byte) GCM authentication tag
 * - Pure-TypeScript synchronous SHA-256 for audit hash chaining across Hermes, Web, and Node
 *
 * Strict non-diagnostic clinical boundary: Only encrypts local patient metadata,
 * session tokens, and draft preferences. Never synthesizes or validates clinical data.
 */

export interface EncryptedEnvelopeV2 {
  v: 2;
  alg: 'AES-256-GCM';
  iv: string; // base64 12-byte IV
  tag: string; // base64 16-byte auth tag
  ciphertext: string; // base64 ciphertext
}

function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Cryptographic primitive unavailable: globalThis.crypto is required');
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return globalThis.btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = globalThis.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateEncryptionKey(): Uint8Array {
  const crypto = getCrypto();
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
}

export async function encryptEnvelope(
  plaintext: string,
  key: Uint8Array
): Promise<EncryptedEnvelopeV2> {
  if (key.length !== 32) {
    throw new Error('Invalid key length: AES-256 requires exactly 32 bytes (256 bits)');
  }
  const crypto = getCrypto();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
    cryptoKey,
    encoded
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const ciphertextBytes = encryptedBytes.slice(0, -16);
  const tagBytes = encryptedBytes.slice(-16);

  return {
    v: 2,
    alg: 'AES-256-GCM',
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tagBytes),
    ciphertext: bytesToBase64(ciphertextBytes),
  };
}

export async function decryptEnvelope(
  envelope: EncryptedEnvelopeV2,
  key: Uint8Array
): Promise<string> {
  if (envelope.v !== 2 || envelope.alg !== 'AES-256-GCM') {
    throw new Error(`Unsupported envelope version or algorithm: ${envelope.v}/${envelope.alg}`);
  }
  if (key.length !== 32) {
    throw new Error('Invalid key length: AES-256 requires exactly 32 bytes (256 bits)');
  }

  const crypto = getCrypto();
  const iv = base64ToBytes(envelope.iv);
  const tagBytes = base64ToBytes(envelope.tag);
  const ciphertextBytes = base64ToBytes(envelope.ciphertext);

  const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
  combined.set(ciphertextBytes, 0);
  combined.set(tagBytes, ciphertextBytes.length);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
      cryptoKey,
      combined as unknown as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error('Decryption failed: authentication tag mismatch or corrupted ciphertext (tamper detected)');
  }
}

export function sha256Hex(ascii: string): string {
  const utf8 = new TextEncoder().encode(ascii);
  const words: number[] = new Array<number>(Math.ceil((utf8.length + 9) / 64) * 16).fill(0);
  for (let i = 0; i < utf8.length; i++) {
    const wordIdx = i >>> 2;
    words[wordIdx] = (words[wordIdx] ?? 0) | ((utf8[i] ?? 0) << (24 - (i % 4) * 8));
  }

  const bitLen = utf8.length * 8;
  const bitIdx = bitLen >>> 5;
  words[bitIdx] = (words[bitIdx] ?? 0) | (0x80 << (24 - (bitLen % 32)));
  words[(((bitLen + 64) >>> 9) << 4) + 15] = bitLen;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const w = new Array<number>(64).fill(0);
  const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] ?? 0;
      } else {
        const wj15 = w[j - 15] ?? 0;
        const wj2 = w[j - 2] ?? 0;
        const wj16 = w[j - 16] ?? 0;
        const wj7 = w[j - 7] ?? 0;
        const s0 = ror(wj15, 7) ^ ror(wj15, 18) ^ (wj15 >>> 3);
        const s1 = ror(wj2, 17) ^ ror(wj2, 19) ^ (wj2 >>> 10);
        w[j] = (wj16 + s0 + wj7 + s1) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const kj = k[j] ?? 0;
      const wj = w[j] ?? 0;
      const temp1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ch + kj + wj) | 0;
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h0)}${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}${hex(h5)}${hex(h6)}${hex(h7)}`;
}
