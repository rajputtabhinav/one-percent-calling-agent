import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocumentDto, KnowledgeSearchHit } from '@onepct/shared';
import { query, queryOne, toVectorLiteral } from '../../db/pool';
import { embedText, embedTexts } from '../../ai/openai';
import { chunkText } from '../../lib/chunk';
import { config } from '../../config';
import { logger } from '../../lib/logger';

export interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size_bytes: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  chunk_count: number;
  file_path: string | null;
  created_at: Date;
}

export function toDocumentDto(r: DocumentRow): DocumentDto {
  return {
    id: r.id,
    title: r.title,
    filename: r.filename,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    status: r.status,
    error: r.error,
    chunkCount: r.chunk_count,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const EXT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
};

export function detectMime(filename: string): string | null {
  return EXT_TYPES[path.extname(filename).toLowerCase()] ?? null;
}

export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  if (mime === 'application/pdf') {
    // pdf-parse's index.js runs debug code when imported at top level — import the lib directly.
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (
      b: Buffer,
    ) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf8');
}

export async function createDocument(input: {
  filename: string;
  mime: string;
  sizeBytes: number;
  buffer: Buffer;
}): Promise<DocumentRow> {
  const title = path.basename(input.filename, path.extname(input.filename));
  const rows = await query<DocumentRow>(
    `INSERT INTO documents (title, filename, mime, size_bytes, status)
     VALUES ($1,$2,$3,$4,'processing') RETURNING *`,
    [title, input.filename, input.mime, input.sizeBytes],
  );
  const doc = rows[0];

  // Keep the original on disk.
  const uploadsDir = path.join(config.storageDir, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, `${doc.id}${path.extname(input.filename)}`);
  await fs.writeFile(filePath, input.buffer);
  await query('UPDATE documents SET file_path = $2 WHERE id = $1', [doc.id, filePath]);

  // Process asynchronously — upload returns immediately.
  processDocument(doc.id, input.buffer, input.mime).catch((err) =>
    logger.error({ err, docId: doc.id }, 'document processing crashed'),
  );
  return doc;
}

export async function processDocument(docId: string, buffer: Buffer, mime: string): Promise<void> {
  try {
    const text = await extractText(buffer, mime);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('No extractable text found in document');

    const embeddings = await embedTexts(chunks.map((c) => c.content));
    for (let i = 0; i < chunks.length; i++) {
      await query(
        `INSERT INTO document_chunks (document_id, seq, content, token_count, embedding)
         VALUES ($1,$2,$3,$4,$5::vector)
         ON CONFLICT (document_id, seq) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
        [docId, i, chunks[i].content, chunks[i].tokenEstimate, toVectorLiteral(embeddings[i])],
      );
    }
    await query(
      `UPDATE documents SET status = 'ready', chunk_count = $2, error = NULL WHERE id = $1`,
      [docId, chunks.length],
    );
    logger.info({ docId, chunks: chunks.length }, 'document processed');
  } catch (err) {
    await query(`UPDATE documents SET status = 'failed', error = $2 WHERE id = $1`, [
      docId,
      (err as Error).message.slice(0, 500),
    ]);
  }
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return query<DocumentRow>('SELECT * FROM documents ORDER BY created_at DESC');
}

export async function deleteDocument(id: string): Promise<boolean> {
  const row = await queryOne<DocumentRow>('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
  if (!row) return false;
  if (row.file_path) await fs.unlink(row.file_path).catch(() => {});
  return true;
}

export async function searchKnowledge(q: string, limit = 6): Promise<KnowledgeSearchHit[]> {
  const vec = toVectorLiteral(await embedText(q));
  const rows = await query<any>(
    `SELECT dc.id AS chunk_id, dc.document_id, dc.seq, dc.content,
            d.title AS document_title,
            1 - (dc.embedding <=> $1::vector) AS score
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id AND d.status = 'ready'
     WHERE dc.embedding IS NOT NULL
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $2`,
    [vec, limit],
  );
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    seq: r.seq,
    content: r.content,
    score: Math.round(r.score * 1000) / 1000,
  }));
}

/** Titles of ready documents — listed in the system prompt so the model knows what it can look up. */
export async function readyDocumentTitles(): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `SELECT title FROM documents WHERE status = 'ready' ORDER BY created_at DESC LIMIT 30`,
  );
  return rows.map((r) => r.title);
}
