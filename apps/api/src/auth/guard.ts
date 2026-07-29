import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { unauthorized } from '../lib/errors';
import { ensuredOwnerIdCached, getSessionOwnerId } from './service';

export const SESSION_COOKIE = 'dh_session';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId?: string;
  }
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (config.authDisabled) {
    req.ownerId = await ensuredOwnerIdCached();
    return;
  }
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) throw unauthorized();
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) throw unauthorized();
  const ownerId = await getSessionOwnerId(unsigned.value);
  if (!ownerId) throw unauthorized('Session expired');
  req.ownerId = ownerId;
}
