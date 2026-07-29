import crypto from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { config } from '../config';

// ── Password hashing (argon2id) ──────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(hashed, password);
  } catch {
    return false;
  }
}

// ── Secret encryption (AES-256-GCM under MASTER_KEY) ─────────────────────────

export interface EncryptedValue {
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

function masterKey(): Buffer {
  const raw = config.masterKey;
  if (!raw) {
    // Dev fallback: deterministic key derived from session secret so local
    // setups work out of the box. Production requires MASTER_KEY (enforced in config).
    return crypto.createHash('sha256').update(`dev:${config.sessionSecret}`).digest();
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('MASTER_KEY must be base64 of exactly 32 bytes');
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

export function decryptSecret(enc: EncryptedValue): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(enc.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  const out = Buffer.concat([
    decipher.update(Buffer.from(enc.data, 'base64')),
    decipher.final(),
  ]);
  return out.toString('utf8');
}

// ── Tokens & comparisons ─────────────────────────────────────────────────────

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hmacSha256(payload: string, key: string = config.sessionSecret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}
