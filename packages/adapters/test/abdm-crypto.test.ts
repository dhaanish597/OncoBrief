import { describe, expect, it } from 'vitest';
import {
  CURVE_PARAMS,
  computeSharedSecret,
  decodePublicKey,
  decryptPayload,
  deriveAesKeyAndIv,
  encryptPayload,
  generateEphemeralKeyPair,
  isPointOnCurve,
  mod,
  wipeBuffer,
} from '../src/abdm-crypto';

describe('ABDM Fidelius Curve25519 Cryptographic Engine', () => {
  it('verifies that generator point G satisfies the short Weierstrass curve equation', () => {
    const left = mod(CURVE_PARAMS.Gy * CURVE_PARAMS.Gy);
    const right = mod(
      CURVE_PARAMS.Gx * CURVE_PARAMS.Gx * CURVE_PARAMS.Gx +
        CURVE_PARAMS.a * CURVE_PARAMS.Gx +
        CURVE_PARAMS.b,
    );
    expect(left).toBe(right);
    expect(isPointOnCurve([CURVE_PARAMS.Gx, CURVE_PARAMS.Gy])).toBe(true);
  });

  it('passes the official mgrmtech/fidelius-cli test vector for decryption', () => {
    const receiverPriv = Buffer.from(
      'DMxHPri8d7IT23KgLk281zZenMfVHSdeamq0RhwlIBk=',
      'base64',
    );
    const senderNonce = 'lmXgblZwotx+DfBgKJF0lZXtAXgBEYr5khh79Zytr2Y=';
    const receiverNonce = '6uj1RdDUbcpI3lVMZvijkMC8Te20O4Bcyz0SyivX8Eg=';
    const senderPub =
      'BABVt+mpRLMXiQpIfEq6bj8hlXsdtXIxLsspmMgLNI1SR5mHgDVbjHO2A+U4QlMddGzqyEidzm1AkhtSxSO2Ahg=';
    const expectedPlaintext =
      "Wormtail should never have been Potter cottage's secret keeper.";
    const ciphertextB64 =
      'pzMvVZNNVtJzqPkkxcCbBUWgDEBy/mBXIeT2dJWI16ZAQnnXUb9lI+S4k8XK6mgZSKKSRIHkcNvJpllnBg548wUgavBa0vCRRwdL6kY6Yw==';

    const decrypted = decryptPayload(
      ciphertextB64,
      receiverPriv,
      receiverNonce,
      senderPub,
      senderNonce,
    );
    expect(decrypted).toBe(expectedPlaintext);
  });

  it('passes the official mgrmtech/fidelius-cli test vector for encryption', () => {
    const receiverPriv = Buffer.from(
      'DMxHPri8d7IT23KgLk281zZenMfVHSdeamq0RhwlIBk=',
      'base64',
    );
    const senderNonce = 'lmXgblZwotx+DfBgKJF0lZXtAXgBEYr5khh79Zytr2Y=';
    const receiverNonce = '6uj1RdDUbcpI3lVMZvijkMC8Te20O4Bcyz0SyivX8Eg=';
    const senderPub =
      'BABVt+mpRLMXiQpIfEq6bj8hlXsdtXIxLsspmMgLNI1SR5mHgDVbjHO2A+U4QlMddGzqyEidzm1AkhtSxSO2Ahg=';

    // Shared secret is symmetric: peerPoint * myPriv
    const sharedSecret = computeSharedSecret(receiverPriv, senderPub);
    const { aesKey, iv } = deriveAesKeyAndIv(sharedSecret, senderNonce, receiverNonce);

    expect(aesKey.toString('hex')).toBe('c1e1aa56e80509ac195d4baa4d8df060b639f6b1b8b560af6a4e80b884810d97');
    expect(iv.length).toBe(12);
  });

  it('performs an independent HIP encrypt -> HIU decrypt round trip on synthetic FHIR JSON', () => {
    // HIP generates keypair
    const hipKeys = generateEphemeralKeyPair();
    // HIU generates keypair
    const hiuKeys = generateEphemeralKeyPair();

    const syntheticFhirBundle = JSON.stringify({
      resourceType: 'Bundle',
      id: 'demo-bundle-12345',
      type: 'document',
      entry: [
        {
          fullUrl: 'urn:uuid:patient-01',
          resource: {
            resourceType: 'Patient',
            id: 'patient-01',
            name: [{ text: 'Synthetic Patient Meenakshi' }],
          },
        },
      ],
    });

    // HIP encrypts with hipKeys.privateKey + hiuKeys.publicKeyBase64
    const encrypted = encryptPayload(
      syntheticFhirBundle,
      hipKeys.privateKey,
      hipKeys.nonceBase64,
      hiuKeys.publicKeyBase64,
      hiuKeys.nonceBase64,
    );

    expect(encrypted.content).toBeDefined();
    expect(encrypted.checksum).toBeDefined();

    // HIU decrypts with hiuKeys.privateKey + hipKeys.publicKeyBase64
    const decrypted = decryptPayload(
      encrypted.content,
      hiuKeys.privateKey,
      hiuKeys.nonceBase64,
      hipKeys.publicKeyBase64,
      hipKeys.nonceBase64,
      encrypted.checksum,
    );

    expect(decrypted).toBe(syntheticFhirBundle);
    const parsed = JSON.parse(decrypted);
    expect(parsed.id).toBe('demo-bundle-12345');
  });

  it('rejects an off-curve public key', () => {
    // 65 bytes starting with 0x04, but x and y do not satisfy y^2 = x^3 + ax + b
    const bogusPoint = Buffer.alloc(65, 0x01);
    bogusPoint[0] = 0x04;
    const bogusB64 = bogusPoint.toString('base64');

    expect(() => decodePublicKey(bogusB64)).toThrow(/does not lie on Curve25519/);
  });

  it('rejects malformed public key encoding', () => {
    const invalidB64 = Buffer.from([0x01, 0x02, 0x03]).toString('base64');
    expect(() => decodePublicKey(invalidB64)).toThrow(/malformed or unsupported/);
  });

  it('fails decryption if ciphertext is tampered', () => {
    const hipKeys = generateEphemeralKeyPair();
    const hiuKeys = generateEphemeralKeyPair();

    const encrypted = encryptPayload(
      'sensitive oncology data',
      hipKeys.privateKey,
      hipKeys.nonceBase64,
      hiuKeys.publicKeyBase64,
      hiuKeys.nonceBase64,
    );

    const rawBytes = Buffer.from(encrypted.content, 'base64');
    rawBytes[5] = (rawBytes[5]! ^ 0xff); // tamper byte
    const tamperedContent = rawBytes.toString('base64');

    expect(() =>
      decryptPayload(
        tamperedContent,
        hiuKeys.privateKey,
        hiuKeys.nonceBase64,
        hipKeys.publicKeyBase64,
        hipKeys.nonceBase64,
      ),
    ).toThrow(/abdm_decryption_failed/);
  });

  it('fails decryption if checksum does not match', () => {
    const hipKeys = generateEphemeralKeyPair();
    const hiuKeys = generateEphemeralKeyPair();

    const encrypted = encryptPayload(
      'sensitive data',
      hipKeys.privateKey,
      hipKeys.nonceBase64,
      hiuKeys.publicKeyBase64,
      hiuKeys.nonceBase64,
    );

    expect(() =>
      decryptPayload(
        encrypted.content,
        hiuKeys.privateKey,
        hiuKeys.nonceBase64,
        hipKeys.publicKeyBase64,
        hipKeys.nonceBase64,
        'deadbeef000000000000000000000000',
      ),
    ).toThrow(/checksum mismatch/);
  });

  it('wipes sensitive memory buffer when requested', () => {
    const secret = Buffer.from('super-secret-key-material');
    wipeBuffer(secret);
    expect(secret.every((b) => b === 0)).toBe(true);
  });
});
