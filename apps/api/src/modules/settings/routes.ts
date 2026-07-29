import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SECRET_KEYS, SecretPutSchema, SettingsPatchSchema } from '@onepct/shared';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { query, queryOne } from '../../db/pool';
import { getSettings, listSecretStatuses, patchSettings, setSecret } from './service';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    return { settings: await getSettings() };
  });

  app.put('/', async (req) => {
    const patch = SettingsPatchSchema.parse(req.body);
    const settings = await patchSettings(patch);
    audit(req, 'settings.update', 'settings', null, { sections: Object.keys(patch) });
    return { settings };
  });

  app.get('/secrets', async () => {
    return { items: await listSecretStatuses() };
  });

  app.put('/secrets', async (req) => {
    const { key, value } = SecretPutSchema.parse(req.body);
    if (!(SECRET_KEYS as readonly string[]).includes(key)) {
      throw badRequest(`Unknown secret key: ${key}`);
    }
    await setSecret(key, value);
    audit(req, value ? 'secret.set' : 'secret.delete', 'secret', key);
    return { items: await listSecretStatuses() };
  });

  app.get('/audit', async (req) => {
    const { limit, offset } = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const totalRow = await queryOne<{ count: number }>(
      'SELECT count(*)::int AS count FROM audit_logs',
    );
    const rows = await query<any>(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        action: r.action,
        resource: r.resource,
        resourceId: r.resource_id,
        ip: r.ip,
        userAgent: r.user_agent,
        detail: r.detail,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      total: totalRow?.count ?? 0,
      limit,
      offset,
    };
  });
}
