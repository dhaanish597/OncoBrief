import { describe, expect, it } from 'vitest';
import { protectTransferKey, unprotectTransferKey } from '../src/services/abdm-key';

describe('ABDM ephemeral key protection', () => {
  it('round trips encrypted keys and rejects plaintext and tampering', () => {
    const key = Buffer.alloc(32, 7);
    const sealed = protectTransferKey(key);
    expect(sealed).not.toContain(key.toString('base64'));
    expect(unprotectTransferKey(sealed)).toEqual(key);
    expect(() => unprotectTransferKey(key.toString('base64'))).toThrow();
    const parts = sealed.split('.');
    parts[2] = Buffer.alloc(16).toString('base64');
    expect(() => unprotectTransferKey(parts.join('.'))).toThrow();
  });
});
