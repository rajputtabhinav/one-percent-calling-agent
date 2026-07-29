import type { OwnerDto } from '@onepct/shared';
import { query, queryOne } from '../db/pool';
import { redis } from '../redis';
import { config } from '../config';
import { hashPassword, randomToken, verifyPassword } from '../lib/crypto';

interface OwnerRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  agent_name: string;
}

export function toOwnerDto(row: OwnerRow): OwnerDto {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    agentName: row.agent_name,
  };
}

export async function getOwner(): Promise<OwnerRow | null> {
  return queryOne<OwnerRow>('SELECT * FROM owner LIMIT 1');
}

/**
 * Open-access mode: guarantee an owner row exists without the /setup flow.
 * The generated password is random and unknown — enabling auth later requires
 * the owner-reset procedure in docs/DEPLOYMENT.md.
 */
let ensuredOwnerId: string | null = null;
export async function ensureOwner(): Promise<OwnerRow> {
  const existing = await getOwner();
  if (existing) {
    ensuredOwnerId = existing.id;
    return existing;
  }
  const owner = await createOwner({
    username: 'owner',
    password: randomToken(32),
    displayName: 'Owner',
    agentName: 'Aarav',
  });
  ensuredOwnerId = owner.id;
  return owner;
}

export async function ensuredOwnerIdCached(): Promise<string> {
  if (ensuredOwnerId) return ensuredOwnerId;
  return (await ensureOwner()).id;
}

export async function createOwner(input: {
  username: string;
  password: string;
  displayName?: string;
  agentName?: string;
}): Promise<OwnerRow> {
  const passwordHash = await hashPassword(input.password);
  const rows = await query<OwnerRow>(
    `INSERT INTO owner (username, password_hash, display_name, agent_name)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      input.username.toLowerCase(),
      passwordHash,
      input.displayName ?? 'Owner',
      input.agentName ?? 'Aarav',
    ],
  );
  return rows[0];
}

export async function authenticate(username: string, password: string): Promise<OwnerRow | null> {
  const owner = await getOwner();
  if (!owner || owner.username !== username.toLowerCase()) return null;
  const ok = await verifyPassword(owner.password_hash, password);
  return ok ? owner : null;
}

// ── Sessions (Redis, sliding 30-day TTL) ─────────────────────────────────────

const sessKey = (sid: string) => `sess:${sid}`;

export async function createSession(ownerId: string, ip?: string, ua?: string): Promise<string> {
  const sid = randomToken(32);
  await redis.set(
    sessKey(sid),
    JSON.stringify({ ownerId, createdAt: new Date().toISOString(), ip, ua }),
    'EX',
    config.sessionTtlSeconds,
  );
  return sid;
}

export async function getSessionOwnerId(sid: string): Promise<string | null> {
  const raw = await redis.get(sessKey(sid));
  if (!raw) return null;
  // Sliding expiry — cheap, keeps the owner logged in while active.
  redis.expire(sessKey(sid), config.sessionTtlSeconds).catch(() => {});
  try {
    return (JSON.parse(raw) as { ownerId: string }).ownerId;
  } catch {
    return null;
  }
}

export async function destroySession(sid: string): Promise<void> {
  await redis.del(sessKey(sid));
}

// ── One-shot WebSocket tickets (60 s) ────────────────────────────────────────

export async function mintWsTicket(ownerId: string): Promise<string> {
  const ticket = randomToken(24);
  await redis.set(`wsticket:${ticket}`, ownerId, 'EX', 60);
  return ticket;
}

export async function consumeWsTicket(ticket: string): Promise<string | null> {
  const key = `wsticket:${ticket}`;
  const ownerId = await redis.get(key);
  if (ownerId) await redis.del(key);
  return ownerId;
}
