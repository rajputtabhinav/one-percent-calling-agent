import type { FastifyInstance } from 'fastify';
import { PageQuerySchema } from '@onepct/shared';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import {
  deleteRecording,
  getRecording,
  listRecordings,
  openRecordingStream,
  toRecordingDto,
} from './service';

export async function recordingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req) => {
    const { limit, offset } = PageQuerySchema.parse(req.query);
    const { rows, total } = await listRecordings(limit, offset);
    return { items: rows.map(toRecordingDto), total, limit, offset };
  });

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = await getRecording(id);
    if (!row) throw notFound('Recording');
    return { recording: toRecordingDto(row) };
  });

  app.get('/:id/audio', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getRecording(id);
    if (!row || row.status !== 'ready' || !row.file_path) throw notFound('Recording audio');

    let opened;
    try {
      opened = openRecordingStream(row.file_path, req.headers.range);
    } catch {
      throw notFound('Recording file');
    }
    if (!opened) {
      reply.code(416).header('Content-Range', `bytes */0`);
      return { error: { code: 'range_not_satisfiable', message: 'Invalid range' } };
    }
    audit(req, 'recording.play', 'recording', id);
    const { stream, start, end, size } = opened;
    reply
      .header('Accept-Ranges', 'bytes')
      .header('Content-Type', row.format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
      .header('Content-Length', end - start + 1);
    if (req.headers.range) {
      reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    return reply.send(stream);
  });

  app.delete('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ok = await deleteRecording(id);
    if (!ok) throw notFound('Recording');
    audit(req, 'recording.delete', 'recording', id);
    return { ok: true };
  });
}
