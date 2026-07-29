import type { FastifyInstance } from 'fastify';
import { UpsertPersonalitySchema } from '@onepct/shared';
import { badRequest, notFound } from '../../lib/errors';
import {
  createPersonality,
  deletePersonality,
  getPersonality,
  listPersonalities,
  toPersonalityDto,
  updatePersonality,
} from './repo';

export async function personalitiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    const rows = await listPersonalities();
    return { items: rows.map(toPersonalityDto) };
  });

  app.post('/', async (req, reply) => {
    const body = UpsertPersonalitySchema.parse(req.body);
    const row = await createPersonality(body);
    reply.code(201);
    return { personality: toPersonalityDto(row) };
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = await getPersonality(id);
    if (!row) throw notFound('Personality');
    return { personality: toPersonalityDto(row) };
  });

  app.put('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = UpsertPersonalitySchema.parse(req.body);
    const row = await updatePersonality(id, body);
    if (!row) throw notFound('Personality');
    return { personality: toPersonalityDto(row) };
  });

  app.delete('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const result = await deletePersonality(id);
    if (result === 'missing') throw notFound('Personality');
    if (result === 'builtin') throw badRequest('Built-in personalities cannot be deleted');
    return { ok: true };
  });
}
