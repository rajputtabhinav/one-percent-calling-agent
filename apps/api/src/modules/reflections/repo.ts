import type { ReflectionDto, ReflectionScores } from '@onepct/shared';
import { query, queryOne, toVectorLiteral } from '../../db/pool';
import { tryEmbedText } from '../../ai/openai';

export interface ReflectionRow {
  id: string;
  call_id: string;
  went_well: string[];
  went_poorly: string[];
  missed_opportunities: string[];
  memory_assessment: string;
  emotion_assessment: string;
  advice: string;
  scores: ReflectionScores;
  model: string;
  created_at: Date;
}

export function toReflectionDto(r: ReflectionRow): ReflectionDto {
  return {
    id: r.id,
    callId: r.call_id,
    wentWell: r.went_well ?? [],
    wentPoorly: r.went_poorly ?? [],
    missedOpportunities: r.missed_opportunities ?? [],
    memoryAssessment: r.memory_assessment,
    emotionAssessment: r.emotion_assessment,
    advice: r.advice,
    scores: {
      conversationQuality: r.scores?.conversationQuality ?? 0,
      emotionalIntelligence: r.scores?.emotionalIntelligence ?? 0,
      memoryEffectiveness: r.scores?.memoryEffectiveness ?? 0,
      goalCompletion: r.scores?.goalCompletion ?? 0,
    },
    model: r.model,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function upsertReflection(input: {
  callId: string;
  wentWell: string[];
  wentPoorly: string[];
  missedOpportunities: string[];
  memoryAssessment: string;
  emotionAssessment: string;
  advice: string;
  scores: ReflectionScores;
  model: string;
}): Promise<ReflectionRow> {
  const adviceEmbedding = input.advice ? await tryEmbedText(input.advice) : null;
  const rows = await query<ReflectionRow>(
    `INSERT INTO reflections (call_id, went_well, went_poorly, missed_opportunities,
                              memory_assessment, emotion_assessment, advice, advice_embedding, scores, model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10)
     ON CONFLICT (call_id) DO UPDATE SET
       went_well = EXCLUDED.went_well, went_poorly = EXCLUDED.went_poorly,
       missed_opportunities = EXCLUDED.missed_opportunities,
       memory_assessment = EXCLUDED.memory_assessment,
       emotion_assessment = EXCLUDED.emotion_assessment,
       advice = EXCLUDED.advice, advice_embedding = EXCLUDED.advice_embedding,
       scores = EXCLUDED.scores, model = EXCLUDED.model
     RETURNING *`,
    [
      input.callId,
      JSON.stringify(input.wentWell),
      JSON.stringify(input.wentPoorly),
      JSON.stringify(input.missedOpportunities),
      input.memoryAssessment,
      input.emotionAssessment,
      input.advice,
      adviceEmbedding ? toVectorLiteral(adviceEmbedding) : null,
      JSON.stringify(input.scores),
      input.model,
    ],
  );
  return rows[0];
}

export async function getReflectionByCall(callId: string): Promise<ReflectionRow | null> {
  return queryOne<ReflectionRow>('SELECT * FROM reflections WHERE call_id = $1', [callId]);
}

/**
 * Advice for an upcoming call: semantically closest past lessons (contact-scoped
 * first, global fallback). Returns plain advice strings.
 */
export async function retrieveAdvice(opts: {
  contactId: string | null;
  queryText: string;
  limit?: number;
}): Promise<string[]> {
  const k = opts.limit ?? 3;
  const vec = await tryEmbedText(opts.queryText || 'general phone conversation');
  if (vec) {
    const rows = await query<{ advice: string }>(
      `SELECT r.advice
       FROM reflections r
       JOIN calls cl ON cl.id = r.call_id
       WHERE r.advice <> '' AND r.advice_embedding IS NOT NULL
         AND ($2::uuid IS NULL OR cl.contact_id = $2 OR cl.contact_id IS NULL)
       ORDER BY r.advice_embedding <=> $1::vector
       LIMIT $3`,
      [toVectorLiteral(vec), opts.contactId, k],
    );
    if (rows.length) return rows.map((r) => r.advice);
  }
  const recent = await query<{ advice: string }>(
    `SELECT r.advice FROM reflections r
     JOIN calls cl ON cl.id = r.call_id
     WHERE r.advice <> '' AND ($1::uuid IS NULL OR cl.contact_id = $1)
     ORDER BY r.created_at DESC LIMIT $2`,
    [opts.contactId, k],
  );
  return recent.map((r) => r.advice);
}
