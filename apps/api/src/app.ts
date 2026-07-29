import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { config } from './config';
import { logger } from './lib/logger';
import { AppError } from './lib/errors';
import { audit } from './lib/audit';
import { pool } from './db/pool';
import { redis } from './redis';
import { authRoutes } from './auth/routes';
import { requireAuth } from './auth/guard';
import { contactsRoutes } from './modules/contacts/routes';
import { personalitiesRoutes } from './modules/personalities/routes';
import { callsRoutes } from './modules/calls/routes';
import { recordingsRoutes } from './modules/recordings/routes';
import { transcriptsRoutes } from './modules/transcripts/routes';
import { memoriesRoutes } from './modules/memories/routes';
import { knowledgeRoutes } from './modules/knowledge/routes';
import { analyticsRoutes } from './modules/analytics/routes';
import { settingsRoutes } from './modules/settings/routes';
import { twilioWebhookRoutes } from './webhooks/twilio';
import { exotelWebhookRoutes } from './webhooks/exotel';
import { realtimeRoutes } from './realtime/media-routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 30 * 1024 * 1024,
  });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(cors, { origin: [config.webOrigin], credentials: true });
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  app.setErrorHandler((rawErr, req, reply) => {
    if (rawErr instanceof ZodError) {
      const message = rawErr.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      return reply.code(400).send({ error: { code: 'validation', message } });
    }
    if (rawErr instanceof AppError) {
      return reply
        .code(rawErr.statusCode)
        .send({ error: { code: rawErr.code, message: rawErr.message } });
    }
    const err = rawErr as Error & { statusCode?: number; code?: string };
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code ?? 'request_error', message: err.message } });
    }
    logger.error({ err, url: req.url }, 'unhandled error');
    return reply
      .code(500)
      .send({ error: { code: 'internal', message: 'Internal server error' } });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: 'not_found', message: `Route ${req.url} not found` } });
  });

  app.get('/api/v1/health', async () => {
    let db = false;
    let redisOk = false;
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch {
      /* degraded */
    }
    try {
      redisOk = (await redis.ping()) === 'PONG';
    } catch {
      /* degraded */
    }
    return { ok: db && redisOk, db, redis: redisOk, version: config.version };
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  // Everything else under /api/v1 requires the owner session.
  await app.register(
    async (priv) => {
      priv.addHook('preHandler', requireAuth);
      priv.addHook('onResponse', (req, reply, done) => {
        if (
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
          reply.statusCode < 400
        ) {
          const route = req.routeOptions?.url ?? req.url;
          const resource = route.split('/')[3] ?? '';
          audit(req, `${req.method} ${route}`, resource, null, {
            status: reply.statusCode,
          });
        }
        done();
      });
      await priv.register(contactsRoutes, { prefix: '/contacts' });
      await priv.register(personalitiesRoutes, { prefix: '/personalities' });
      await priv.register(callsRoutes, { prefix: '/calls' });
      await priv.register(recordingsRoutes, { prefix: '/recordings' });
      await priv.register(transcriptsRoutes, { prefix: '/transcripts' });
      await priv.register(memoriesRoutes, { prefix: '/memories' });
      await priv.register(knowledgeRoutes, { prefix: '/knowledge' });
      await priv.register(analyticsRoutes, { prefix: '/analytics' });
      await priv.register(settingsRoutes, { prefix: '/settings' });
    },
    { prefix: '/api/v1' },
  );

  await app.register(twilioWebhookRoutes, { prefix: '/webhooks/twilio' });
  await app.register(exotelWebhookRoutes, { prefix: '/webhooks/exotel' });
  await app.register(realtimeRoutes);

  return app;
}
