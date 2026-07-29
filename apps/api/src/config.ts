import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from app dir, then repo root (first value wins; real env always wins).
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgres://onepct:onepct@localhost:5432/onepct'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  MASTER_KEY: z.string().default(''),
  STORAGE_DIR: z.string().default('./storage'),
  TWILIO_SKIP_SIGNATURE_VALIDATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Open access (no login). Defaults: ON in development, OFF in production.
  AUTH_DISABLED: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.string().default('info'),
});

const env = EnvSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
  if (env.SESSION_SECRET === 'dev-only-session-secret-change-me') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  if (!env.MASTER_KEY) {
    throw new Error('MASTER_KEY must be set in production (base64 of 32 random bytes)');
  }
}

const publicUrl = new URL(env.PUBLIC_BASE_URL);

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ''),
  /** ws(s) base for telephony media streams, derived from PUBLIC_BASE_URL */
  publicWsBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, '').replace(/^http/, 'ws'),
  webOrigin: env.WEB_ORIGIN.replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  sessionSecret: env.SESSION_SECRET,
  masterKey: env.MASTER_KEY,
  storageDir: path.resolve(process.cwd(), env.STORAGE_DIR),
  secureCookies: publicUrl.protocol === 'https:',
  authDisabled:
    env.AUTH_DISABLED !== undefined
      ? env.AUTH_DISABLED === 'true'
      : env.NODE_ENV === 'development',
  twilioSkipSignatureValidation: env.TWILIO_SKIP_SIGNATURE_VALIDATION,
  logLevel: env.LOG_LEVEL,
  sessionTtlSeconds: 30 * 24 * 3600,
  version: '1.0.0',
} as const;

export type AppConfig = typeof config;
