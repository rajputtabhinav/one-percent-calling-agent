import type { MemoryDto, MemoryKind, Settings } from '@onepct/shared';
import { query, queryOne, toVectorLiteral } from '../../db/pool';
import { embedText, tryEmbedText } from '../../ai/openai';

export interface MemoryRow {
  id: string;
  contact_id: string | null;
  contact_name?: string | null;
  kind: MemoryKind;
  content: string;
  importance: number;
  confidence: number;
  source_call_id: string | null;
  last_referenced_at: Date | null;
  reference_count: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  score?: number;
}

export function toMemoryDto(r: MemoryRow): MemoryDto {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name ?? null,
    kind: r.kind,
    content: r.content,
    importance: r.importance,
    confidence: r.confidence,
    sourceCallId: r.source_call_id,
    lastReferencedAt: r.last_referenced_at ? new Date(r.last_referenced_at).toISOString() : null,
    referenceCount: r.reference_count,
    isActive: r.is_active,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    ...(r.score !== undefined ? { score: Math.round(r.score * 1000) / 1000 } : {}),
  };
}

// Composite retrieval score: semantic relevance dominates, importance and
// freshness matter, repeated usefulness reinforces.
const SCORE_SQL = (vecParam: string, halfLifeParam: string) => `
  (0.55 * (1 - (m.embedding <=> ${vecParam}::vector))
   + 0.25 * m.importance
   + 0.15 * power(0.5, extract(epoch FROM (now() - m.created_at)) / 86400.0 / ${halfLifeParam})
   + 0.05 * least(1.0, ln(1 + m.reference_count) / ln(10)))`;

export async function createMemory(input: {
  content: string;
  kind: MemoryKind;
  contactId?: string | null;
  importance?: number;
  confidence?: number;
  sourceCallId?: string | null;
  supersedesId?: string | null;
}): Promise<MemoryRow> {
  const embedding = await tryEmbedText(input.content);
  const rows = await query<MemoryRow>(
    `INSERT INTO memories (contact_id, kind, content, importance, confidence, embedding, source_call_id, supersedes_id)
     VALUES ($1,$2,$3,$4,$5,$6::vector,$7,$8) RETURNING *`,
    [
      input.contactId ?? null,
      input.kind,
      input.content,
      input.importance ?? 0.5,
      input.confidence ?? 0.9,
      embedding ? toVectorLiteral(embedding) : null,
      input.sourceCallId ?? null,
      input.supersedesId ?? null,
    ],
  );
  if (input.supersedesId) {
    await query('UPDATE memories SET is_active = false, updated_at = now() WHERE id = $1', [
      input.supersedesId,
    ]);
  }
  return rows[0];
}

export async function listMemories(opts: {
  contactId?: string;
  kind?: MemoryKind;
  q?: string;
  active?: boolean;
  limit: number;
  offset: number;
}): Promise<{ rows: MemoryRow[]; total: number }> {
  // Semantic mode when q present (requires embeddings).
  if (opts.q && opts.q.trim()) {
    const vec = toVectorLiteral(await embedText(opts.q.trim()));
    const params: unknown[] = [vec, 90];
    const where: string[] = ['m.embedding IS NOT NULL'];
    if (opts.active !== undefined) where.push(`m.is_active = ${opts.active}`);
    if (opts.contactId) {
      params.push(opts.contactId);
      where.push(`m.contact_id = $${params.length}`);
    }
    if (opts.kind) {
      params.push(opts.kind);
      where.push(`m.kind = $${params.length}`);
    }
    params.push(opts.limit);
    const rows = await query<MemoryRow>(
      `SELECT m.*, c.name AS contact_name, ${SCORE_SQL('$1', '$2')} AS score
       FROM memories m LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE ${where.join(' AND ')}
       ORDER BY score DESC LIMIT $${params.length}`,
      params,
    );
    return { rows, total: rows.length };
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.active !== undefined) where.push(`m.is_active = ${opts.active}`);
  if (opts.contactId) {
    params.push(opts.contactId);
    where.push(`m.contact_id = $${params.length}`);
  }
  if (opts.kind) {
    params.push(opts.kind);
    where.push(`m.kind = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM memories m ${whereSql}`,
    params,
  );
  params.push(opts.limit, opts.offset);
  const rows = await query<MemoryRow>(
    `SELECT m.*, c.name AS contact_name
     FROM memories m LEFT JOIN contacts c ON c.id = m.contact_id
     ${whereSql}
     ORDER BY m.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: totalRow?.count ?? 0 };
}

export async function getMemory(id: string): Promise<MemoryRow | null> {
  return queryOne<MemoryRow>(
    `SELECT m.*, c.name AS contact_name FROM memories m
     LEFT JOIN contacts c ON c.id = m.contact_id WHERE m.id = $1`,
    [id],
  );
}

export async function updateMemory(
  id: string,
  patch: { content?: string; kind?: MemoryKind; importance?: number; isActive?: boolean },
): Promise<MemoryRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.content !== undefined) {
    add('content', patch.content);
    const embedding = await tryEmbedText(patch.content);
    add('embedding', embedding ? toVectorLiteral(embedding) : null);
  }
  if (patch.kind !== undefined) add('kind', patch.kind);
  if (patch.importance !== undefined) add('importance', patch.importance);
  if (patch.isActive !== undefined) add('is_active', patch.isActive);
  if (!sets.length) return getMemory(id);
  params.push(id);
  const rows = await query<MemoryRow>(
    `UPDATE memories SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const rows = await query('DELETE FROM memories WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

// ── Retrieval for calls ──────────────────────────────────────────────────────

/**
 * Pre-call / in-call memory retrieval: contact-scoped + global memories,
 * scored semantically against `queryText` when given, otherwise by
 * importance × recency. Bumps reinforcement counters on the returned rows.
 */
export async function retrieveMemories(opts: {
  contactId: string | null;
  queryText?: string;
  settings: Settings;
  limit?: number;
}): Promise<MemoryRow[]> {
  const k = opts.limit ?? opts.settings.memory.maxInjected;
  if (k <= 0) return [];
  const halfLife = opts.settings.memory.halfLifeDays;
  const minImportance = opts.settings.memory.minImportance;

  const scopeSql = opts.contactId
    ? '(m.contact_id = $SCOPE OR m.contact_id IS NULL)'
    : 'm.contact_id IS NULL';

  let rows: MemoryRow[] = [];
  if (opts.queryText && opts.queryText.trim()) {
    try {
      const vec = toVectorLiteral(await embedText(opts.queryText.trim()));
      const params: unknown[] = [vec, halfLife, minImportance];
      let scope = scopeSql;
      if (opts.contactId) {
        params.push(opts.contactId);
        scope = scope.replace('$SCOPE', `$${params.length}`);
      }
      params.push(k);
      rows = await query<MemoryRow>(
        `SELECT m.*, ${SCORE_SQL('$1', '$2')} AS score
         FROM memories m
         WHERE m.is_active AND m.embedding IS NOT NULL AND m.importance >= $3 AND ${scope}
         ORDER BY score DESC LIMIT $${params.length}`,
        params,
      );
    } catch {
      rows = []; // embedding unavailable — fall through to non-semantic
    }
  }

  if (rows.length === 0) {
    const params: unknown[] = [halfLife, minImportance];
    let scope = scopeSql;
    if (opts.contactId) {
      params.push(opts.contactId);
      scope = scope.replace('$SCOPE', `$${params.length}`);
    }
    params.push(k);
    rows = await query<MemoryRow>(
      `SELECT m.*,
              (0.6 * m.importance
               + 0.4 * power(0.5, extract(epoch FROM (now() - m.created_at)) / 86400.0 / $1)) AS score
       FROM memories m
       WHERE m.is_active AND m.importance >= $2 AND ${scope}
       ORDER BY score DESC LIMIT $${params.length}`,
      params,
    );
  }

  if (rows.length > 0) {
    query(
      `UPDATE memories SET reference_count = reference_count + 1, last_referenced_at = now()
       WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)],
    ).catch(() => {});
  }
  return rows;
}

/** Recent active memories for a contact — given to the post-call extractor for dedupe. */
export async function recentContactMemories(
  contactId: string | null,
  limit = 30,
): Promise<MemoryRow[]> {
  if (!contactId) return [];
  return query<MemoryRow>(
    `SELECT * FROM memories WHERE contact_id = $1 AND is_active
     ORDER BY created_at DESC LIMIT $2`,
    [contactId, limit],
  );
}
