import { extractMemories } from '../ai/memory-extract';
import { reflectOnCall } from '../ai/reflect';
import { summarizeCall } from '../ai/summarize';
import { getOwner } from '../auth/service';
import { logger } from '../lib/logger';
import { rollupDay } from '../modules/analytics/repo';
import {
  getCall,
  getCallEvents,
  getSummary,
  updateCall,
  upsertSummary,
} from '../modules/calls/repo';
import {
  addRelationshipEvent,
  applyScoreDeltas,
  getContact,
} from '../modules/contacts/repo';
import { createMemory, recentContactMemories } from '../modules/memories/service';
import { upsertReflection } from '../modules/reflections/repo';
import { getSettings } from '../modules/settings/service';
import { getTranscript } from '../modules/transcripts/repo';
import { hub } from '../realtime/hub';

const MILESTONES = new Set([1, 5, 10, 25, 50, 100]);

/**
 * Post-call pipeline: summarize → extract memories → reflect → update
 * relationship → analytics rollup. Steps are individually fault-tolerant and
 * idempotent (upserts), so a retry never duplicates data.
 */
export async function runPostCall(callId: string): Promise<void> {
  const call = await getCall(callId);
  if (!call) return;
  const settings = await getSettings();
  const owner = await getOwner();
  const agentName = owner?.agent_name ?? 'AI';
  const contactName = call.contact_name ?? null;

  const segments = await getTranscript(callId);
  let summaryReady = false;
  let reflectionReady = false;

  if (segments.length >= 2) {
    let transcriptText = segments
      .map((s) => `${s.speaker === 'ai' ? agentName : (contactName ?? 'Caller')}: ${s.text}`)
      .join('\n');
    if (transcriptText.length > 24_000) {
      transcriptText = `…(earlier part truncated)\n${transcriptText.slice(-24_000)}`;
    }

    // 1 ── Summary
    let summaryText: string | null = null;
    try {
      const summary = await summarizeCall({
        transcriptText,
        contactName,
        goal: call.goal,
        model: settings.ai.chatModel,
      });
      await upsertSummary({ callId, ...summary, model: settings.ai.chatModel });
      summaryText = summary.summary;
      summaryReady = true;
    } catch (err) {
      logger.error({ err, callId }, 'postcall: summarize failed');
    }

    // 2 ── Memory extraction
    if (settings.memory.autoCapture) {
      try {
        const existing = await recentContactMemories(call.contact_id);
        const extracted = await extractMemories({
          transcriptText,
          contactName,
          existing: existing.map((m) => ({ id: m.id, content: m.content })),
          model: settings.ai.chatModel,
        });
        for (const m of extracted) {
          await createMemory({
            content: m.content,
            kind: m.kind,
            contactId: call.contact_id,
            importance: m.importance,
            sourceCallId: callId,
            supersedesId: m.supersedesId,
          });
        }
        if (extracted.length) logger.info({ callId, count: extracted.length }, 'memories extracted');
      } catch (err) {
        logger.error({ err, callId }, 'postcall: memory extraction failed');
      }
    }

    // 3 ── Reflection
    let reflectionScores: { conversationQuality: number; goalCompletion: number } | null = null;
    try {
      const events = await getCallEvents(callId);
      const preCallRecall = events.find(
        (e) => e.type === 'memory_recall' && (e.payload as any)?.trigger === 'pre_call',
      );
      const injectedMemories: string[] = Array.isArray((preCallRecall?.payload as any)?.memories)
        ? ((preCallRecall!.payload as any).memories as Array<{ content: string }>).map(
            (m) => m.content,
          )
        : [];
      const emotionCounts: Record<string, number> = {};
      for (const point of call.emotion_timeline ?? []) {
        emotionCounts[point.label] = (emotionCounts[point.label] ?? 0) + 1;
      }
      const emotionSummary = Object.entries(emotionCounts)
        .map(([label, n]) => `${label}×${n}`)
        .join(', ');

      const reflection = await reflectOnCall({
        transcriptText,
        contactName,
        goal: call.goal,
        injectedMemories,
        emotionSummary,
        model: settings.ai.chatModel,
      });
      await upsertReflection({ callId, ...reflection, model: settings.ai.chatModel });
      await updateCall(callId, {
        qualityScore: Math.round(reflection.scores.conversationQuality * 100),
      });
      reflectionScores = reflection.scores;
      reflectionReady = true;
    } catch (err) {
      logger.error({ err, callId }, 'postcall: reflection failed');
    }

    // 4 ── Relationship update
    if (call.contact_id) {
      try {
        const durMin = call.duration_seconds / 60;
        const humanSegs = segments.filter((s) => s.speaker === 'human').length;
        const depth = Math.min(1, humanSegs / 12);
        const famDelta =
          Math.round(Math.min(6, 0.8 + durMin * 0.6) * (0.5 + 0.5 * depth) * 10) / 10;
        const trustDelta = reflectionScores
          ? Math.max(
              -5,
              Math.min(
                5,
                (reflectionScores.conversationQuality - 0.5) * 4 +
                  (reflectionScores.goalCompletion - 0.5) * 2,
              ),
            )
          : 0.5;
        await applyScoreDeltas(
          call.contact_id,
          famDelta,
          Math.round(trustDelta * 10) / 10,
          call.ended_at ? new Date(call.ended_at) : new Date(),
        );
        const firstSentence = summaryText?.split(/(?<=[.!?])\s/)[0] ?? 'conversation';
        await addRelationshipEvent({
          contactId: call.contact_id,
          callId,
          kind: 'call',
          description: `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call (${Math.max(1, Math.round(durMin))} min): ${firstSentence}`,
          deltaFamiliarity: famDelta,
          deltaTrust: Math.round(trustDelta * 10) / 10,
        });
        const contact = await getContact(call.contact_id);
        if (contact && MILESTONES.has(contact.interaction_count)) {
          await addRelationshipEvent({
            contactId: call.contact_id,
            callId,
            kind: 'milestone',
            description: `Crossed ${contact.interaction_count} calls together`,
          });
        }
      } catch (err) {
        logger.error({ err, callId }, 'postcall: relationship update failed');
      }
    }
  }

  // 5 ── Analytics rollup (always)
  try {
    await rollupDay(new Date(call.created_at));
  } catch (err) {
    logger.error({ err, callId }, 'postcall: analytics rollup failed');
  }

  hub.broadcast('postcall.done', callId, { summaryReady, reflectionReady });
}

/** Used by routes to expose summary readiness without recomputing. */
export async function summaryExists(callId: string): Promise<boolean> {
  return (await getSummary(callId)) !== null;
}
