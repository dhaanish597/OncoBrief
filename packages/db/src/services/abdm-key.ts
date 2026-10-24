import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../env';

function wrappingKey(): Buffer {
  return createHash('sha256').update('oncobrief-abdm-transfer-key-v1\0').update(env.sessionSecret).digest();
}

export function protectTransferKey(key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', wrappingKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function unprotectTransferKey(value: string): Buffer {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('invalid_encrypted_transfer_key');
  const decipher = createDecipheriv('aes-256-gcm', wrappingKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
}
