import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors';
import {
  createDocument,
  deleteDocument,
  detectMime,
  listDocuments,
  searchKnowledge,
  toDocumentDto,
} from './service';

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    const rows = await listDocuments();
    return { items: rows.map(toDocumentDto) };
  });

  app.post('/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded');
    const mime = detectMime(file.filename);
    if (!mime) {
      throw badRequest('Unsupported file type — upload PDF, DOCX, TXT, or Markdown');
    }
    const buffer = await file.toBuffer();
    if (buffer.length === 0) throw badRequest('File is empty');
    const doc = await createDocument({
      filename: file.filename,
      mime,
      sizeBytes: buffer.length,
      buffer,
    });
    reply.code(201);
    return { document: toDocumentDto(doc) };
  });

  app.delete('/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ok = await deleteDocument(id);
    if (!ok) throw notFound('Document');
    return { ok: true };
  });

  app.get('/search', async (req) => {
    const { q, limit } = z
      .object({
        q: z.string().min(1).max(500),
        limit: z.coerce.number().int().min(1).max(20).default(6),
      })
      .parse(req.query);
    return { items: await searchKnowledge(q, limit) };
  });
}
