import type { FastifyInstance } from 'fastify';
import { CallListQuerySchema, CreateCallSchema } from '@onepct/shared';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { sessionManager } from '../../realtime/manager';
import { getReflectionByCall, toReflectionDto } from '../reflections/repo';
import { getTranscript, toSegmentDto } from '../transcripts/repo';
import { getCall, getCallEvents, getSummary, listCalls, toCallDto } from './repo';
import { hangupCall, initiateCall } from './service';

export async function callsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (req, reply) => {
    const body = CreateCallSchema.parse(req.body);
    const call = await initiateCall(body);
    audit(req, 'call.create', 'call', call.id, { to: call.to_number });
    reply.code(201);
    return { call: toCallDto(call) };
  });

  app.get('/', async (req) => {
    const q = CallListQuerySchema.parse(req.query);
    const { rows, total } = await listCalls(q);
    return { items: rows.map(toCallDto), total, limit: q.limit, offset: q.offset };
  });

  app.get('/active', async () => {
    return { items: sessionManager.activeSnapshots() };
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const call = await getCall(id);
    if (!call) throw notFound('Call');
    return { call: toCallDto(call) };
  });

  app.post('/:id/hangup', async (req) => {
    const { id } = req.params as { id: string };
    await hangupCall(id);
    audit(req, 'call.hangup', 'call', id);
    return { ok: true };
  });

  app.get('/:id/transcript', async (req) => {
    const { id } = req.params as { id: string };
    const segments = await getTranscript(id);
    return { items: segments.map(toSegmentDto) };
  });

  app.get('/:id/events', async (req) => {
    const { id } = req.params as { id: string };
    return { items: await getCallEvents(id) };
  });

  app.get('/:id/summary', async (req) => {
    const { id } = req.params as { id: string };
    const summary = await getSummary(id);
    if (!summary) throw notFound('Summary');
    return { summary };
  });

  app.get('/:id/reflection', async (req) => {
    const { id } = req.params as { id: string };
    const reflection = await getReflectionByCall(id);
    if (!reflection) throw notFound('Reflection');
    return { reflection: toReflectionDto(reflection) };
  });
}
