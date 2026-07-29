import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getEmotionTrends,
  getOverview,
  getQualityTrends,
  getRelationshipGrowth,
  getTimeseries,
} from './repo';

const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/overview', async () => getOverview());

  app.get('/timeseries', async (req) => {
    const { days } = DaysQuery.parse(req.query);
    return { items: await getTimeseries(days) };
  });

  app.get('/emotions', async (req) => {
    const { days } = DaysQuery.parse(req.query);
    return { items: await getEmotionTrends(days) };
  });

  app.get('/quality', async (req) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(90) })
      .parse(req.query);
    return { items: await getQualityTrends(days) };
  });

  app.get('/relationships', async () => {
    return { items: await getRelationshipGrowth() };
  });
}
