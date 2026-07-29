import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  hashPassword,
  maskSecret,
  verifyPassword,
} from '../src/lib/crypto';

describe('secret encryption (AES-256-GCM)', () => {
  it('round-trips plaintext', () => {
    const enc = encryptSecret('sk-super-secret-key-12345');
    expect(decryptSecret(enc)).toBe('sk-super-secret-key-12345');
  });

  it('uses a fresh IV every time', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptSecret('payload');
    const tampered = { ...enc, data: Buffer.from('xxxx').toString('base64') };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('password hashing (argon2id)', () => {
  it('verifies correct password and rejects wrong one', async () => {
    const hash = await hashPassword('hunter2hunter2');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'hunter2hunter2')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });
});

describe('helpers', () => {
  it('constantTimeEqual compares safely', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });

  it('maskSecret never reveals the middle', () => {
    expect(maskSecret('sk-1234567890abcdef')).toBe('sk-…cdef');
    expect(maskSecret('tiny')).toBe('••••');
  });
});
