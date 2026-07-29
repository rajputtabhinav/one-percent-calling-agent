import type { FastifyRequest } from 'fastify';
import { query } from '../db/pool';
import { logger } from './logger';

export function audit(
  req: FastifyRequest | null,
  action: string,
  resource = '',
  resourceId: string | null = null,
  detail: Record<string, unknown> | null = null,
): void {
  const ownerId = (req as any)?.ownerId ?? null;
  const ip = req?.ip ?? null;
  const userAgent = (req?.headers['user-agent'] as string | undefined)?.slice(0, 400) ?? null;
  // Fire-and-forget: auditing must never block or fail a request.
  query(
    `INSERT INTO audit_logs (owner_id, action, resource, resource_id, ip, user_agent, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ownerId, action, resource, resourceId, ip, userAgent, detail ? JSON.stringify(detail) : null],
  ).catch((err) => logger.warn({ err, action }, 'audit insert failed'));
}
