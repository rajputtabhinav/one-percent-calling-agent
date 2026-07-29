import type {
  CallDirection,
  CallDto,
  CallEventDto,
  CallStatus,
  CallSummaryDto,
  EmotionTimelinePoint,
  TelephonyProviderName,
} from '@onepct/shared';
import { query, queryOne } from '../../db/pool';

export interface CallRow {
  id: string;
  direction: CallDirection;
  status: CallStatus;
  provider: TelephonyProviderName;
  provider_call_sid: string | null;
  contact_id: string | null;
  from_number: string;
  to_number: string;
  personality_id: string | null;
  goal: string | null;
  started_at: Date | null;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number;
  latency_ms_avg: number | null;
  tokens_used: number;
  quality_score: number | null;
  emotion_timeline: EmotionTimelinePoint[];
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  // joined
  contact_name?: string | null;
  personality_name?: string | null;
  has_recording?: boolean;
  has_summary?: boolean;
  has_reflection?: boolean;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function toCallDto(r: CallRow): CallDto {
  return {
    id: r.id,
    direction: r.direction,
    status: r.status,
    provider: r.provider,
    providerCallSid: r.provider_call_sid,
    contactId: r.contact_id,
    contactName: r.contact_name ?? null,
    fromNumber: r.from_number,
    toNumber: r.to_number,
    personalityId: r.personality_id,
    personalityName: r.personality_name ?? null,
    goal: r.goal,
    startedAt: iso(r.started_at),
    answeredAt: iso(r.answered_at),
    endedAt: iso(r.ended_at),
    durationSeconds: r.duration_seconds,
    latencyMsAvg: r.latency_ms_avg,
    tokensUsed: r.tokens_used,
    qualityScore: r.quality_score,
    emotionTimeline: r.emotion_timeline ?? [],
    error: r.error,
    hasRecording: r.has_recording ?? false,
    hasSummary: r.has_summary ?? false,
    hasReflection: r.has_reflection ?? false,
    createdAt: iso(r.created_at)!,
  };
}

const JOINED_SELECT = `
  SELECT cl.*,
         c.name AS contact_name,
         p.name AS personality_name,
         (r.id IS NOT NULL AND r.status = 'ready') AS has_recording,
         (s.id IS NOT NULL) AS has_summary,
         (rf.id IS NOT NULL) AS has_reflection
  FROM calls cl
  LEFT JOIN contacts c ON c.id = cl.contact_id
  LEFT JOIN personalities p ON p.id = cl.personality_id
  LEFT JOIN recordings r ON r.call_id = cl.id
  LEFT JOIN call_summaries s ON s.call_id = cl.id
  LEFT JOIN reflections rf ON rf.call_id = cl.id`;

export async function createCall(input: {
  direction: CallDirection;
  provider: TelephonyProviderName;
  contactId: string | null;
  fromNumber: string;
  toNumber: string;
  personalityId: string | null;
  goal?: string | null;
  status?: CallStatus;
  providerCallSid?: string | null;
}): Promise<CallRow> {
  const rows = await query<CallRow>(
    `INSERT INTO calls (direction, provider, contact_id, from_number, to_number, personality_id, goal, status, provider_call_sid, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) RETURNING *`,
    [
      input.direction,
      input.provider,
      input.contactId,
      input.fromNumber,
      input.toNumber,
      input.personalityId,
      input.goal ?? null,
      input.status ?? 'queued',
      input.providerCallSid ?? null,
    ],
  );
  return rows[0];
}

export async function updateCall(
  id: string,
  patch: Partial<{
    status: CallStatus;
    providerCallSid: string;
    answeredAt: Date;
    endedAt: Date;
    durationSeconds: number;
    latencyMsAvg: number;
    tokensUsed: number;
    qualityScore: number;
    emotionTimeline: EmotionTimelinePoint[];
    error: string | null;
    metadata: Record<string, unknown>;
    contactId: string;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.status !== undefined) add('status', patch.status);
  if (patch.providerCallSid !== undefined) add('provider_call_sid', patch.providerCallSid);
  if (patch.answeredAt !== undefined) add('answered_at', patch.answeredAt);
  if (patch.endedAt !== undefined) add('ended_at', patch.endedAt);
  if (patch.durationSeconds !== undefined) add('duration_seconds', patch.durationSeconds);
  if (patch.latencyMsAvg !== undefined) add('latency_ms_avg', patch.latencyMsAvg);
  if (patch.tokensUsed !== undefined) add('tokens_used', patch.tokensUsed);
  if (patch.qualityScore !== undefined) add('quality_score', patch.qualityScore);
  if (patch.emotionTimeline !== undefined)
    add('emotion_timeline', JSON.stringify(patch.emotionTimeline));
  if (patch.error !== undefined) add('error', patch.error);
  if (patch.metadata !== undefined) add('metadata', JSON.stringify(patch.metadata));
  if (patch.contactId !== undefined) add('contact_id', patch.contactId);
  if (!sets.length) return;
  params.push(id);
  await query(`UPDATE calls SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

export async function getCall(id: string): Promise<CallRow | null> {
  return queryOne<CallRow>(`${JOINED_SELECT} WHERE cl.id = $1`, [id]);
}

export async function getCallByProviderSid(sid: string): Promise<CallRow | null> {
  return queryOne<CallRow>(`${JOINED_SELECT} WHERE cl.provider_call_sid = $1`, [sid]);
}

export interface CallListFilters {
  direction?: CallDirection;
  status?: CallStatus;
  contactId?: string;
  q?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export async function listCalls(
  f: CallListFilters,
): Promise<{ rows: CallRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, val: unknown) => {
    params.push(val);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.direction) add('cl.direction = ?', f.direction);
  if (f.status) add('cl.status = ?', f.status);
  if (f.contactId) add('cl.contact_id = ?', f.contactId);
  if (f.from) add('cl.created_at >= ?', f.from);
  if (f.to) add('cl.created_at <= ?', f.to);
  if (f.q?.trim()) {
    params.push(f.q.trim());
    const n = params.length;
    params.push(`%${f.q.trim()}%`);
    const m = params.length;
    where.push(
      `(cl.id IN (SELECT call_id FROM transcript_segments WHERE ts @@ websearch_to_tsquery('simple', $${n}))
        OR cl.to_number ILIKE $${m} OR cl.from_number ILIKE $${m} OR c.name ILIKE $${m})`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM calls cl LEFT JOIN contacts c ON c.id = cl.contact_id ${whereSql}`,
    params,
  );
  params.push(f.limit, f.offset);
  const rows = await query<CallRow>(
    `${JOINED_SELECT} ${whereSql} ORDER BY cl.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: totalRow?.count ?? 0 };
}

// ── Summaries ────────────────────────────────────────────────────────────────

export async function upsertSummary(input: {
  callId: string;
  summary: string;
  keyPoints: string[];
  followUps: string[];
  importantMemories: string[];
  model: string;
}): Promise<void> {
  await query(
    `INSERT INTO call_summaries (call_id, summary, key_points, follow_ups, important_memories, model)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (call_id) DO UPDATE SET
       summary = EXCLUDED.summary, key_points = EXCLUDED.key_points,
       follow_ups = EXCLUDED.follow_ups, important_memories = EXCLUDED.important_memories,
       model = EXCLUDED.model`,
    [
      input.callId,
      input.summary,
      JSON.stringify(input.keyPoints),
      JSON.stringify(input.followUps),
      JSON.stringify(input.importantMemories),
      input.model,
    ],
  );
}

export async function getSummary(callId: string): Promise<CallSummaryDto | null> {
  const r = await queryOne<any>('SELECT * FROM call_summaries WHERE call_id = $1', [callId]);
  if (!r) return null;
  return {
    id: r.id,
    callId: r.call_id,
    summary: r.summary,
    keyPoints: r.key_points ?? [],
    followUps: r.follow_ups ?? [],
    importantMemories: r.important_memories ?? [],
    model: r.model,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function lastSummariesForContact(
  contactId: string,
  limit = 3,
): Promise<Array<{ endedAt: string | null; summary: string }>> {
  const rows = await query<any>(
    `SELECT s.summary, cl.ended_at
     FROM call_summaries s JOIN calls cl ON cl.id = s.call_id
     WHERE cl.contact_id = $1
     ORDER BY cl.created_at DESC LIMIT $2`,
    [contactId, limit],
  );
  return rows.map((r) => ({
    endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    summary: r.summary,
  }));
}

// ── Call events (live-screen replay) ─────────────────────────────────────────

export async function insertCallEvents(
  callId: string,
  events: Array<{ tsMs: number; type: string; payload: Record<string, unknown> }>,
): Promise<void> {
  if (!events.length) return;
  const values: string[] = [];
  const params: unknown[] = [callId];
  for (const e of events) {
    params.push(e.tsMs, e.type, JSON.stringify(e.payload));
    const n = params.length;
    values.push(`($1, $${n - 2}, $${n - 1}, $${n})`);
  }
  await query(
    `INSERT INTO call_events (call_id, ts_ms, type, payload) VALUES ${values.join(',')}`,
    params,
  );
}

export async function getCallEvents(callId: string): Promise<CallEventDto[]> {
  const rows = await query<any>(
    'SELECT * FROM call_events WHERE call_id = $1 ORDER BY ts_ms ASC, id ASC LIMIT 2000',
    [callId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    callId: r.call_id,
    tsMs: r.ts_ms,
    type: r.type,
    payload: r.payload ?? {},
  }));
}
