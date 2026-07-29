import type { EmotionState, Speaker, TranscriptSearchHit, TranscriptSegmentDto } from '@onepct/shared';
import { query } from '../../db/pool';

export interface SegmentRow {
  id: string;
  call_id: string;
  seq: number;
  speaker: Speaker;
  text: string;
  started_ms: number;
  ended_ms: number | null;
  emotion: EmotionState | null;
}

export function toSegmentDto(r: SegmentRow): TranscriptSegmentDto {
  return {
    id: r.id,
    callId: r.call_id,
    seq: r.seq,
    speaker: r.speaker,
    text: r.text,
    startedMs: r.started_ms,
    endedMs: r.ended_ms,
    emotion: r.emotion,
  };
}

export async function insertSegment(input: {
  callId: string;
  seq: number;
  speaker: Speaker;
  text: string;
  startedMs: number;
  endedMs?: number | null;
}): Promise<SegmentRow> {
  const rows = await query<SegmentRow>(
    `INSERT INTO transcript_segments (call_id, seq, speaker, text, started_ms, ended_ms)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (call_id, seq) DO UPDATE SET text = EXCLUDED.text, ended_ms = EXCLUDED.ended_ms
     RETURNING *`,
    [input.callId, input.seq, input.speaker, input.text, input.startedMs, input.endedMs ?? null],
  );
  return rows[0];
}

export async function updateSegmentEmotion(id: string, emotion: EmotionState): Promise<void> {
  await query('UPDATE transcript_segments SET emotion = $2 WHERE id = $1', [
    id,
    JSON.stringify(emotion),
  ]);
}

export async function getTranscript(callId: string): Promise<SegmentRow[]> {
  return query<SegmentRow>(
    'SELECT * FROM transcript_segments WHERE call_id = $1 ORDER BY seq ASC',
    [callId],
  );
}

export async function searchTranscripts(q: string, limit = 30): Promise<TranscriptSearchHit[]> {
  const rows = await query<any>(
    `SELECT ts.id AS segment_id, ts.call_id, ts.speaker, ts.started_ms,
            ts_headline('simple', ts.text, websearch_to_tsquery('simple', $1),
                        'StartSel=⟦, StopSel=⟧, MaxWords=30, MinWords=10') AS snippet,
            cl.started_at AS call_started_at, cl.direction, cl.to_number, cl.from_number,
            c.name AS contact_name
     FROM transcript_segments ts
     JOIN calls cl ON cl.id = ts.call_id
     LEFT JOIN contacts c ON c.id = cl.contact_id
     WHERE ts.ts @@ websearch_to_tsquery('simple', $1)
     ORDER BY cl.created_at DESC, ts.seq ASC
     LIMIT $2`,
    [q, limit],
  );
  return rows.map((r) => ({
    callId: r.call_id,
    segmentId: r.segment_id,
    speaker: r.speaker,
    snippet: r.snippet,
    startedMs: r.started_ms,
    callStartedAt: r.call_started_at ? new Date(r.call_started_at).toISOString() : null,
    contactName: r.contact_name,
    direction: r.direction,
    toNumber: r.to_number,
    fromNumber: r.from_number,
  }));
}
