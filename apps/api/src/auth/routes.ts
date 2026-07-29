import type { FastifyInstance } from 'fastify';
import { LoginRequestSchema, SetupRequestSchema } from '@onepct/shared';
import { config } from '../config';
import { audit } from '../lib/audit';
import { conflict, unauthorized } from '../lib/errors';
import {
  authenticate,
  createOwner,
  createSession,
  destroySession,
  ensureOwner,
  getOwner,
  getSessionOwnerId,
  mintWsTicket,
  toOwnerDto,
} from './service';
import { requireAuth, SESSION_COOKIE } from './guard';

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.secureCookies,
  signed: true,
  maxAge: config.sessionTtlSeconds,
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async (req) => {
    if (config.authDisabled) {
      await ensureOwner();
      return { needsSetup: false, authenticated: true, authDisabled: true };
    }
    const owner = await getOwner();
    let authenticated = false;
    const raw = req.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        authenticated = (await getSessionOwnerId(unsigned.value)) !== null;
      }
    }
    return { needsSetup: !owner, authenticated, authDisabled: false };
  });

  app.post('/setup', async (req, reply) => {
    const body = SetupRequestSchema.parse(req.body);
    if (await getOwner()) throw conflict('Owner account already exists');
    const owner = await createOwner(body);
    const sid = await createSession(owner.id, req.ip, req.headers['user-agent'] as string);
    reply.setCookie(SESSION_COOKIE, sid, cookieOpts);
    audit(req, 'auth.setup', 'owner', owner.id);
    return { owner: toOwnerDto(owner) };
  });

  app.post(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = LoginRequestSchema.parse(req.body);
      const owner = await authenticate(body.username, body.password);
      if (!owner) {
        audit(req, 'auth.login_failed', 'owner', null, { username: body.username });
        throw unauthorized('Invalid username or password');
      }
      const sid = await createSession(owner.id, req.ip, req.headers['user-agent'] as string);
      reply.setCookie(SESSION_COOKIE, sid, cookieOpts);
      audit(req, 'auth.login', 'owner', owner.id);
      return { owner: toOwnerDto(owner) };
    },
  );

  app.post('/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) await destroySession(unsigned.value);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    audit(req, 'auth.logout');
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async () => {
    const owner = await getOwner();
    if (!owner) throw unauthorized();
    return { owner: toOwnerDto(owner), authDisabled: config.authDisabled };
  });

  app.post('/ws-ticket', { preHandler: requireAuth }, async (req) => {
    const ticket = await mintWsTicket(req.ownerId!);
    return { ticket };
  });
}
