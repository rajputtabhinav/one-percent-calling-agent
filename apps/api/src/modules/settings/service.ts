import {
  DEFAULT_SETTINGS,
  SECRET_KEYS,
  type SecretStatusDto,
  type Settings,
  type SettingsPatch,
} from '@onepct/shared';
import { query, queryOne } from '../../db/pool';
import { decryptSecret, encryptSecret, maskSecret } from '../../lib/crypto';

const ENV_FALLBACK: Record<string, string> = {
  'openai.apiKey': 'OPENAI_API_KEY',
  'twilio.accountSid': 'TWILIO_ACCOUNT_SID',
  'twilio.authToken': 'TWILIO_AUTH_TOKEN',
  'exotel.sid': 'EXOTEL_SID',
  'exotel.apiKey': 'EXOTEL_API_KEY',
  'exotel.apiToken': 'EXOTEL_API_TOKEN',
  'exotel.subdomain': 'EXOTEL_SUBDOMAIN',
  'exotel.flowId': 'EXOTEL_FLOW_ID',
};

// ── Settings (defaults ⊕ DB overrides, 5 s cache) ────────────────────────────

let cache: { value: Settings; at: number } | null = null;
const CACHE_MS = 5000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await query<{ key: string; value: Record<string, unknown> }>(
    'SELECT key, value FROM settings',
  );
  const overrides = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = {} as Record<string, unknown>;
  for (const [section, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    merged[section] = { ...(defaults as object), ...((overrides[section] as object) ?? {}) };
  }
  const value = merged as unknown as Settings;
  cache = { value, at: Date.now() };
  return value;
}

export async function patchSettings(patch: SettingsPatch): Promise<Settings> {
  for (const [section, partial] of Object.entries(patch)) {
    if (!partial || Object.keys(partial).length === 0) continue;
    const existing = await queryOne<{ value: Record<string, unknown> }>(
      'SELECT value FROM settings WHERE key = $1',
      [section],
    );
    const next = { ...(existing?.value ?? {}), ...partial };
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [section, JSON.stringify(next)],
    );
  }
  cache = null;
  return getSettings();
}

// ── Secrets (DB-encrypted, env fallback) ─────────────────────────────────────

export async function getSecret(key: string): Promise<string | null> {
  const row = await queryOne<{ iv: string; tag: string; data: string }>(
    'SELECT iv, tag, data FROM secrets WHERE key = $1',
    [key],
  );
  if (row) {
    try {
      return decryptSecret(row);
    } catch {
      // MASTER_KEY changed since this secret was written — treat as unset.
      return null;
    }
  }
  const envName = ENV_FALLBACK[key];
  const envVal = envName ? process.env[envName] : undefined;
  return envVal && envVal.length > 0 ? envVal : null;
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (!value) {
    await query('DELETE FROM secrets WHERE key = $1', [key]);
    return;
  }
  const enc = encryptSecret(value);
  await query(
    `INSERT INTO secrets (key, iv, tag, data, updated_at) VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (key) DO UPDATE SET iv = $2, tag = $3, data = $4, updated_at = now()`,
    [key, enc.iv, enc.tag, enc.data],
  );
}

export async function listSecretStatuses(): Promise<SecretStatusDto[]> {
  const rows = await query<{ key: string; iv: string; tag: string; data: string }>(
    'SELECT key, iv, tag, data FROM secrets',
  );
  const dbKeys = new Map(rows.map((r) => [r.key, r]));
  return SECRET_KEYS.map((key) => {
    const row = dbKeys.get(key);
    if (row) {
      let preview: string | null = null;
      try {
        preview = maskSecret(decryptSecret(row));
      } catch {
        preview = '⚠ undecryptable (MASTER_KEY changed)';
      }
      return { key, configured: true, preview, source: 'db' as const };
    }
    const envName = ENV_FALLBACK[key];
    const envVal = envName ? process.env[envName] : undefined;
    if (envVal) {
      return { key, configured: true, preview: maskSecret(envVal), source: 'env' as const };
    }
    return { key, configured: false, preview: null, source: null };
  });
}
