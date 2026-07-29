import type { CreateCall } from '@onepct/shared';
import { buildGreetingDirective, buildSystemPrompt, applyIdentityTemplate } from '../../ai/prompts';
import { getOwner } from '../../auth/service';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { normalizePhone } from '../../lib/phone';
import { redis } from '../../redis';
import { hub } from '../../realtime/hub';
import { sessionManager } from '../../realtime/manager';
import type { CallPrep } from '../../realtime/types';
import { getTelephonyProvider } from '../../telephony/registry';
import {
  findOrCreateByPhone,
  getContact,
  getTimeline,
  type ContactRow,
} from '../contacts/repo';
import { readyDocumentTitles } from '../knowledge/service';
import { retrieveMemories } from '../memories/service';
import {
  getDefaultPersonality,
  getPersonality,
  type PersonalityRow,
} from '../personalities/repo';
import { retrieveAdvice } from '../reflections/repo';
import { getSettings } from '../settings/service';
import { createCall, getCall, lastSummariesForContact, updateCall, type CallRow } from './repo';

const prepKey = (callId: string) => `callprep:${callId}`;

/**
 * Assemble everything the digital human needs for this call — memories,
 * relationship context, past-call lessons, knowledge index, personality —
 * into Realtime instructions. Cached in Redis so webhooks answer instantly.
 */
export async function prepCallContext(call: CallRow): Promise<CallPrep> {
  const [settings, owner] = await Promise.all([getSettings(), getOwner()]);
  const contact: ContactRow | null = call.contact_id ? await getContact(call.contact_id) : null;

  let personality: PersonalityRow;
  if (call.personality_id) {
    personality = (await getPersonality(call.personality_id)) ?? (await getDefaultPersonality());
  } else {
    personality = await getDefaultPersonality();
  }

  const retrievalQuery =
    call.goal?.trim() ||
    (contact ? `phone call with ${contact.name}` : 'incoming phone call');

  const [memories, lastSummaries, advice, knowledgeTitles, timeline] = await Promise.all([
    retrieveMemories({
      contactId: contact?.id ?? null,
      queryText: retrievalQuery,
      settings,
    }).catch(() => []),
    contact ? lastSummariesForContact(contact.id, 3).catch(() => []) : Promise.resolve([]),
    retrieveAdvice({ contactId: contact?.id ?? null, queryText: retrievalQuery }).catch(() => []),
    readyDocumentTitles().catch(() => []),
    contact ? getTimeline(contact.id, 5).catch(() => []) : Promise.resolve([]),
  ]);

  const promptInputs = {
    agentName: owner?.agent_name ?? 'Aarav',
    ownerName: owner?.display_name ?? 'the owner',
    direction: call.direction,
    goal: call.goal,
    personality,
    contact,
    memories,
    lastSummaries,
    advice,
    knowledgeTitles,
    timelineHighlights: timeline
      .filter((e) => e.kind !== 'call')
      .slice(0, 4)
      .map((e) => `${new Date(e.createdAt).toDateString()}: ${e.description}`),
    settings,
    localTime: new Date().toLocaleString(),
  };

  let instructions = buildSystemPrompt(promptInputs);
  if (settings.prompt.identityTemplate.trim()) {
    instructions = applyIdentityTemplate(
      settings.prompt.identityTemplate,
      promptInputs,
      instructions,
    );
  }

  const prep: CallPrep = {
    instructions,
    greetingDirective: buildGreetingDirective({
      direction: call.direction,
      contactName: contact?.name ?? null,
      firstCall: (contact?.interaction_count ?? 0) === 0,
    }),
    voice: personality.voice || settings.voice.voice,
    temperature: settings.ai.temperature,
    realtimeModel: settings.voice.realtimeModel,
    miniModel: settings.ai.miniModel,
    agentName: owner?.agent_name ?? 'Aarav',
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    personalityId: personality.id,
    goal: call.goal,
    direction: call.direction,
    record: settings.call.record,
    maxDurationMinutes: settings.call.maxDurationMinutes,
    strategist: settings.ai.strategist,
    memoryRecall: memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      score: Math.round((m.score ?? 0) * 1000) / 1000,
    })),
  };

  await redis
    .set(prepKey(call.id), JSON.stringify(prep), 'EX', 3600)
    .catch((err) => logger.warn({ err }, 'prep cache write failed'));
  return prep;
}

export async function loadOrBuildPrep(call: CallRow): Promise<CallPrep> {
  const cached = await redis.get(prepKey(call.id)).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as CallPrep;
    } catch {
      /* rebuild below */
    }
  }
  return prepCallContext(call);
}

// ── Outbound dial ────────────────────────────────────────────────────────────

export async function initiateCall(input: CreateCall): Promise<CallRow> {
  const settings = await getSettings();
  if (!settings.telephony.fromNumber) {
    throw badRequest(
      'No outbound number configured — set Settings → Telephony → From number',
      'missing_from_number',
    );
  }
  const providerName = settings.telephony.provider;
  const provider = getTelephonyProvider(providerName);
  const to = normalizePhone(input.to, settings.telephony.defaultCountryCode);

  let contact: ContactRow;
  if (input.contactId) {
    const found = await getContact(input.contactId);
    if (!found) throw notFound('Contact');
    contact = found;
  } else {
    contact = await findOrCreateByPhone(to);
  }

  const personality = input.personalityId
    ? ((await getPersonality(input.personalityId)) ?? (await getDefaultPersonality()))
    : await getDefaultPersonality();

  const call = await createCall({
    direction: 'outbound',
    provider: providerName,
    contactId: contact.id,
    fromNumber: settings.telephony.fromNumber,
    toNumber: to,
    personalityId: personality.id,
    goal: input.goal ?? null,
    status: 'queued',
  });

  // Build the conversational context BEFORE dialing — the answer webhook and
  // media socket then start instantly from the Redis cache.
  await prepCallContext(call);

  try {
    const { providerCallSid } = await provider.startOutboundCall({
      callId: call.id,
      to,
      from: settings.telephony.fromNumber,
      record: input.record ?? settings.call.record,
      announceRecording: settings.call.announceRecording,
      maxDurationMinutes: settings.call.maxDurationMinutes,
    });
    await updateCall(call.id, { providerCallSid, status: 'ringing' });
    hub.broadcast('call.status', call.id, {
      status: 'ringing',
      direction: 'outbound',
      contactName: contact.name,
      to,
      from: settings.telephony.fromNumber,
      startedAt: null,
    });
  } catch (err) {
    const message = (err as Error).message;
    await updateCall(call.id, { status: 'failed', error: message, endedAt: new Date() });
    logger.error({ err, callId: call.id }, 'outbound dial failed');
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'dial_failed', message);
  }

  return (await getCall(call.id))!;
}

export async function hangupCall(callId: string): Promise<void> {
  const session = sessionManager.get(callId);
  if (session) {
    await session.hangupByOwner();
    return;
  }
  const call = await getCall(callId);
  if (!call) throw notFound('Call');
  if (['completed', 'failed', 'no_answer', 'busy', 'canceled'].includes(call.status)) return;
  if (call.provider_call_sid) {
    try {
      await getTelephonyProvider(call.provider).hangup(call.provider_call_sid);
    } catch (err) {
      logger.warn({ err, callId }, 'hangup without session failed');
    }
  }
  const finalStatus = call.status === 'in_progress' ? 'completed' : 'canceled';
  await updateCall(callId, { status: finalStatus, endedAt: new Date() });
  hub.broadcast('call.status', callId, {
    status: finalStatus,
    direction: call.direction,
    contactName: call.contact_name ?? null,
    to: call.to_number,
    from: call.from_number,
    startedAt: call.started_at ? new Date(call.started_at).toISOString() : null,
  });
}
