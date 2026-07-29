import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchTranscripts } from './repo';

export async function transcriptsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', async (req) => {
    const { q, limit } = z
      .object({
        q: z.string().min(1).max(200),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(req.query);
    return { items: await searchTranscripts(q, limit) };
  });
}
