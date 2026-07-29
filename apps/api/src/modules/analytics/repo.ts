import type {
  AnalyticsOverview,
  EmotionTrendPoint,
  QualityTrendPoint,
  RelationshipGrowthRow,
  TimeseriesPoint,
} from '@onepct/shared';
import { query, queryOne } from '../../db/pool';

export async function getOverview(): Promise<AnalyticsOverview> {
  const calls = await queryOne<any>(`
    SELECT count(*)::int AS total,
           coalesce(sum(duration_seconds),0)::int AS duration_total,
           coalesce(avg(nullif(duration_seconds,0)),0)::float AS avg_duration,
           count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last7,
           avg(quality_score)::float AS avg_quality,
           avg(latency_ms_avg)::float AS avg_latency,
           coalesce(sum(tokens_used),0)::int AS tokens
    FROM calls WHERE status = 'completed'`);
  const memories = await queryOne<any>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS active FROM memories`,
  );
  const contacts = await queryOne<any>(`SELECT count(*)::int AS total FROM contacts`);
  const documents = await queryOne<any>(`SELECT count(*)::int AS total FROM documents`);
  return {
    totalCalls: calls?.total ?? 0,
    totalDurationSeconds: calls?.duration_total ?? 0,
    avgDurationSeconds: Math.round(calls?.avg_duration ?? 0),
    callsLast7Days: calls?.last7 ?? 0,
    avgQualityScore: calls?.avg_quality != null ? Math.round(calls.avg_quality) : null,
    avgLatencyMs: calls?.avg_latency != null ? Math.round(calls.avg_latency) : null,
    totalMemories: memories?.total ?? 0,
    activeMemories: memories?.active ?? 0,
    totalContacts: contacts?.total ?? 0,
    totalDocuments: documents?.total ?? 0,
    tokensUsed: calls?.tokens ?? 0,
  };
}

export async function getTimeseries(days: number): Promise<TimeseriesPoint[]> {
  const rows = await query<any>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            coalesce(count(cl.id) FILTER (WHERE cl.direction = 'inbound'),0)::int AS inbound,
            coalesce(count(cl.id) FILTER (WHERE cl.direction = 'outbound'),0)::int AS outbound,
            coalesce(sum(cl.duration_seconds),0)::int AS duration_seconds
     FROM generate_series(current_date - ($1::int - 1), current_date, '1 day') AS d(day)
     LEFT JOIN calls cl ON cl.created_at::date = d.day
     GROUP BY d.day ORDER BY d.day`,
    [days],
  );
  return rows.map((r) => ({
    day: r.day,
    inbound: r.inbound,
    outbound: r.outbound,
    durationSeconds: r.duration_seconds,
  }));
}

export async function getEmotionTrends(days: number): Promise<EmotionTrendPoint[]> {
  const rows = await query<any>(
    `SELECT to_char(cl.created_at::date, 'YYYY-MM-DD') AS day,
            e.value->>'label' AS label, count(*)::int AS n
     FROM calls cl, jsonb_array_elements(cl.emotion_timeline) AS e(value)
     WHERE cl.created_at > now() - ($1::int || ' days')::interval
     GROUP BY 1, 2 ORDER BY 1`,
    [days],
  );
  const byDay = new Map<string, EmotionTrendPoint>();
  for (const r of rows) {
    const point = byDay.get(r.day) ?? { day: r.day, distribution: {} };
    (point.distribution as Record<string, number>)[r.label] = r.n;
    byDay.set(r.day, point);
  }
  return [...byDay.values()];
}

export async function getQualityTrends(days: number): Promise<QualityTrendPoint[]> {
  const rows = await query<any>(
    `SELECT to_char(cl.created_at::date, 'YYYY-MM-DD') AS day,
            avg((r.scores->>'conversationQuality')::float) AS cq,
            avg((r.scores->>'emotionalIntelligence')::float) AS eq,
            avg((r.scores->>'memoryEffectiveness')::float) AS me,
            count(*)::int AS calls
     FROM reflections r JOIN calls cl ON cl.id = r.call_id
     WHERE cl.created_at > now() - ($1::int || ' days')::interval
     GROUP BY 1 ORDER BY 1`,
    [days],
  );
  return rows.map((r) => ({
    day: r.day,
    conversationQuality: r.cq != null ? Math.round(r.cq * 100) / 100 : null,
    emotionalIntelligence: r.eq != null ? Math.round(r.eq * 100) / 100 : null,
    memoryEffectiveness: r.me != null ? Math.round(r.me * 100) / 100 : null,
    calls: r.calls,
  }));
}

export async function getRelationshipGrowth(): Promise<RelationshipGrowthRow[]> {
  const rows = await query<any>(
    `SELECT c.id, c.name, c.familiarity_score, c.trust_score, c.interaction_count, c.last_interaction_at,
            coalesce((SELECT sum(delta_familiarity) FROM relationship_events re
                      WHERE re.contact_id = c.id AND re.created_at > now() - interval '30 days'), 0) AS fam_delta
     FROM contacts c
     WHERE c.interaction_count > 0
     ORDER BY c.familiarity_score DESC LIMIT 20`,
  );
  return rows.map((r) => ({
    contactId: r.id,
    name: r.name,
    familiarityScore: Math.round(r.familiarity_score * 10) / 10,
    trustScore: Math.round(r.trust_score * 10) / 10,
    interactionCount: r.interaction_count,
    lastInteractionAt: r.last_interaction_at
      ? new Date(r.last_interaction_at).toISOString()
      : null,
    familiarityDelta30d: Math.round(r.fam_delta * 10) / 10,
  }));
}

/** Idempotent per-day rollup — recomputed from source tables. */
export async function rollupDay(day: Date): Promise<void> {
  await query(
    `INSERT INTO analytics_daily (day, calls_total, calls_inbound, calls_outbound, duration_total_s,
                                  avg_quality, memories_created, tokens_used, updated_at)
     SELECT $1::date,
            count(cl.id)::int,
            count(cl.id) FILTER (WHERE cl.direction = 'inbound')::int,
            count(cl.id) FILTER (WHERE cl.direction = 'outbound')::int,
            coalesce(sum(cl.duration_seconds),0)::int,
            avg(cl.quality_score),
            (SELECT count(*)::int FROM memories m WHERE m.created_at::date = $1::date),
            coalesce(sum(cl.tokens_used),0)::int,
            now()
     FROM calls cl WHERE cl.created_at::date = $1::date
     ON CONFLICT (day) DO UPDATE SET
       calls_total = EXCLUDED.calls_total, calls_inbound = EXCLUDED.calls_inbound,
       calls_outbound = EXCLUDED.calls_outbound, duration_total_s = EXCLUDED.duration_total_s,
       avg_quality = EXCLUDED.avg_quality, memories_created = EXCLUDED.memories_created,
       tokens_used = EXCLUDED.tokens_used, updated_at = now()`,
    [day],
  );
}
