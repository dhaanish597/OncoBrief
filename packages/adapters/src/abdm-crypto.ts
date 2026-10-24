import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import type { AbdmKeyMaterial } from '@oncobrief/ports';

/**
 * ABDM Fidelius Cryptographic Engine
 *
 * Implements BouncyCastle short Weierstrass Curve25519 ECDH + HKDF-SHA256 + AES-256-GCM
 * compliant with NHA ABDM HIE-CM V3 specifications and mgrmtech/fidelius-cli.
 *
 * Short Weierstrass Curve Equation: y^2 = x^3 + ax + b (mod p)
 */

export const CURVE_PARAMS = {
  p: BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed'),
  a: BigInt('0x2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA984914A144'),
  b: BigInt('0x7B425ED097B425ED097B425ED097B425ED097B425ED097B4260B5E9C7710C864'),
  n: BigInt('0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed'),
  Gx: BigInt('0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245a'),
  Gy: BigInt('0x20ae19a1b8a086b4e01edd2c7748d14c923d4d7e6d7c61b229e9c5a27eced3d9'),
};

export type ECPoint = [bigint, bigint] | null;

export function mod(x: bigint, m: bigint = CURVE_PARAMS.p): bigint {
  const r = x % m;
  return r >= 0n ? r : r + m;
}

export function modPow(base: bigint, exp: bigint, m: bigint = CURVE_PARAMS.p): bigint {
  let res = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) res = mod(res * b, m);
    b = mod(b * b, m);
    e >>= 1n;
  }
  return res;
}

export function modInverse(k: bigint, m: bigint = CURVE_PARAMS.p): bigint {
  if (k === 0n) throw new Error('abdm_crypto_error: division by zero in field inversion');
  return modPow(k, m - 2n, m);
}

export function isPointOnCurve(point: ECPoint): boolean {
  if (!point) return false;
  const [x, y] = point;
  const left = mod(y * y);
  const right = mod(x * x * x + CURVE_PARAMS.a * x + CURVE_PARAMS.b);
  return left === right;
}

export function pointAdd(p1: ECPoint, p2: ECPoint): ECPoint {
  if (!p1) return p2;
  if (!p2) return p1;
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  if (x1 === x2) {
    if (y1 === y2) {
      if (y1 === 0n) return null;
      const lambda = mod(mod(3n * x1 * x1 + CURVE_PARAMS.a) * modInverse(2n * y1));
      const x3 = mod(lambda * lambda - 2n * x1);
      const y3 = mod(lambda * (x1 - x3) - y1);
      return [x3, y3];
    }
    return null; // Point at infinity
  }

  const lambda = mod(mod(y2 - y1) * modInverse(x2 - x1));
  const x3 = mod(lambda * lambda - x1 - x2);
  const y3 = mod(lambda * (x1 - x3) - y1);
  return [x3, y3];
}

export function scalarMult(k: bigint, point: ECPoint): ECPoint {
  if (!point || k === 0n) return null;
  let r: ECPoint = null;
  let q: ECPoint = point;
  let e = k;
  while (e > 0n) {
    if (e & 1n) {
      r = pointAdd(r, q);
    }
    q = pointAdd(q, q);
    e >>= 1n;
  }
  return r;
}

/**
 * Standard X.509 SubjectPublicKeyInfo prefix for BouncyCastle Curve25519 short Weierstrass.
 */
const X509_HEADER_HEX =
  '3059301306072a8648ce3d020106082a8648ce3d030107034200'; // 27 bytes ASN.1 SPKI header

export function encodePublicKeyDer(point: [bigint, bigint], useX509Wrapper = true): string {
  const xHex = point[0].toString(16).padStart(64, '0');
  const yHex = point[1].toString(16).padStart(64, '0');
  const rawPoint = Buffer.concat([Buffer.from([0x04]), Buffer.from(xHex, 'hex'), Buffer.from(yHex, 'hex')]);

  if (!useX509Wrapper) {
    return rawPoint.toString('base64');
  }

  const header = Buffer.from(X509_HEADER_HEX, 'hex');
  const fullDer = Buffer.concat([header.subarray(0, 26), Buffer.from([0x00]), rawPoint]);
  return fullDer.toString('base64');
}

export function decodePublicKey(b64OrDer: string): [bigint, bigint] {
  const buf = Buffer.from(b64OrDer, 'base64');

  let raw65: Buffer | null = null;
  if (buf.length === 65 && buf[0] === 0x04) {
    raw65 = buf;
  } else if (buf.length > 65) {
    // Locate uncompressed point indicator 0x04 with 64 following bytes
    const idx = buf.lastIndexOf(0x04);
    if (idx !== -1 && buf.length - idx === 65) {
      raw65 = buf.subarray(idx, idx + 65);
    } else {
      // Check if last 65 bytes are the uncompressed point
      const candidate = buf.subarray(buf.length - 65);
      if (candidate[0] === 0x04) raw65 = candidate;
    }
  }

  if (!raw65 || raw65.length !== 65 || raw65[0] !== 0x04) {
    throw new Error('abdm_crypto_error: malformed or unsupported public key encoding');
  }

  const x = BigInt('0x' + raw65.subarray(1, 33).toString('hex'));
  const y = BigInt('0x' + raw65.subarray(33, 65).toString('hex'));

  const point: [bigint, bigint] = [x, y];
  if (!isPointOnCurve(point)) {
    throw new Error('abdm_crypto_error: public key point does not lie on Curve25519');
  }

  return point;
}

export interface EphemeralKeyPair {
  privateKey: Buffer;
  publicKeyBase64: string;
  nonceBase64: string;
  keyMaterial: AbdmKeyMaterial;
}

export function generateEphemeralKeyPair(expiryIso?: string): EphemeralKeyPair {
  // Generate random 32-byte scalar d in [1, n-1]
  let d = 0n;
  let privBuf: Buffer;
  do {
    privBuf = randomBytes(32);
    d = BigInt('0x' + privBuf.toString('hex'));
  } while (d <= 0n || d >= CURVE_PARAMS.n);

  const pubPoint = scalarMult(d, [CURVE_PARAMS.Gx, CURVE_PARAMS.Gy]);
  if (!pubPoint) throw new Error('abdm_crypto_error: failed to generate valid public key');

  const pubB64 = encodePublicKeyDer(pubPoint, true);
  const nonceBuf = randomBytes(32);
  const nonceB64 = nonceBuf.toString('base64');

  const expiry = expiryIso ?? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  return {
    privateKey: privBuf,
    publicKeyBase64: pubB64,
    nonceBase64: nonceB64,
    keyMaterial: {
      cryptoAlg: 'ECDH',
      curve: 'Curve25519',
      dhPublicKey: {
        expiry,
        parameters: 'Curve25519/32byte random key',
        keyValue: pubB64,
      },
      nonce: nonceB64,
    },
  };
}

export function computeSharedSecret(privateKey: Buffer, peerPublicKeyB64: string): Buffer {
  const privScalar = BigInt('0x' + privateKey.toString('hex'));
  const peerPoint = decodePublicKey(peerPublicKeyB64);
  const shared = scalarMult(privScalar, peerPoint);
  if (!shared) {
    throw new Error('abdm_crypto_error: shared secret computation resulted in point at infinity');
  }
  const xHex = shared[0].toString(16).padStart(64, '0');
  return Buffer.from(xHex, 'hex');
}

export function deriveAesKeyAndIv(
  sharedSecret: Buffer,
  senderNonceB64: string,
  receiverNonceB64: string,
): { aesKey: Buffer; iv: Buffer } {
  const senderNonce = Buffer.from(senderNonceB64, 'base64');
  const receiverNonce = Buffer.from(receiverNonceB64, 'base64');

  if (senderNonce.length !== 32 || receiverNonce.length !== 32) {
    throw new Error('abdm_crypto_error: nonces must be 32 bytes long');
  }

  const xorNonce = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    xorNonce[i] = senderNonce[i]! ^ receiverNonce[i]!;
  }

  const salt = xorNonce.subarray(0, 20);
  const iv = xorNonce.subarray(20, 32);

  const derivedKey = hkdfSync('sha256', sharedSecret, salt, Buffer.alloc(0), 32);
  return { aesKey: Buffer.from(derivedKey), iv };
}

export function encryptPayload(
  plaintext: string,
  senderPrivateKey: Buffer,
  senderNonceB64: string,
  receiverPublicKeyB64: string,
  receiverNonceB64: string,
): { content: string; checksum: string } {
  const sharedSecret = computeSharedSecret(senderPrivateKey, receiverPublicKeyB64);
  const { aesKey, iv } = deriveAesKeyAndIv(sharedSecret, senderNonceB64, receiverNonceB64);

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedContentBuf = Buffer.concat([enc, authTag]);
  const content = encryptedContentBuf.toString('base64');

  // ABDM MD5 checksum of encrypted content
  const checksum = createHash('md5').update(content).digest('hex');

  return { content, checksum };
}

export function decryptPayload(
  contentB64: string,
  receiverPrivateKey: Buffer,
  receiverNonceB64: string,
  senderPublicKeyB64: string,
  senderNonceB64: string,
  expectedChecksum?: string,
): string {
  if (expectedChecksum) {
    const md5 = createHash('md5').update(contentB64).digest('hex');
    const sha256 = createHash('sha256').update(contentB64).digest('hex');
    const matches =
      expectedChecksum.toLowerCase() === md5.toLowerCase() ||
      expectedChecksum.toLowerCase() === sha256.toLowerCase();
    if (!matches) {
      throw new Error('abdm_crypto_error: checksum mismatch');
    }
  }

  const rawBytes = Buffer.from(contentB64, 'base64');
  if (rawBytes.length < 16) {
    throw new Error('abdm_crypto_error: encrypted payload is too short');
  }

  const ciphertext = rawBytes.subarray(0, rawBytes.length - 16);
  const authTag = rawBytes.subarray(rawBytes.length - 16);

  const sharedSecret = computeSharedSecret(receiverPrivateKey, senderPublicKeyB64);
  const { aesKey, iv } = deriveAesKeyAndIv(sharedSecret, senderNonceB64, receiverNonceB64);

  try {
    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(
      `abdm_decryption_failed: ${err instanceof Error ? err.message : 'authentication failed'}`,
    );
  }
}

/**
 * Securely overwrites a sensitive Buffer in memory with zeros.
 */
export function wipeBuffer(buf?: Buffer | null): void {
  if (buf && Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}
