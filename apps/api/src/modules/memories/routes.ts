import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateMemorySchema, MEMORY_KINDS, UpdateMemorySchema } from '@onepct/shared';
import { notFound } from '../../lib/errors';
import {
  createMemory,
  deleteMemory,
  getMemory,
  listMemories,
  toMemoryDto,
  updateMemory,
} from './service';

const ListQuery = z.object({
  contactId: z.string().uuid().optional(),
  kind: z.enum(MEMORY_KINDS).optional(),
  q: z.string().max(300).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? true : v === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function memoriesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req) => {
    const q = ListQuery.parse(req.query);
    const { rows, total } = await listMemories(q);
    return { items: rows.map(toMemoryDto), total, limit: q.limit, offset: q.offset };
  });

  app.post('/', async (req, reply) => {
    const body = CreateMemorySchema.parse(req.body);
    const row = await createMemory({
      content: body.content,
      kind: body.kind,
      contactId: body.contactId ?? null,
      importance: body.importance,
    });
    reply.code(201);
    return { memory: toMemoryDto(row) };
  });

  app.patch('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = UpdateMemorySchema.parse(req.body);
    const row = await updateMemory(id, body);
    if (!row) throw notFound('Memory');
    return { memory: toMemoryDto(row) };
  });

  app.delete('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ok = await deleteMemory(id);
    if (!ok) throw notFound('Memory');
    return { ok: true };
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = await getMemory(id);
    if (!row) throw notFound('Memory');
    return { memory: toMemoryDto(row) };
  });
}
