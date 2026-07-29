import { MEMORY_KINDS, type CallStatus, type EmotionTimelinePoint, type MemoryKind } from '@onepct/shared';
import { adaptationDirective, classifyEmotion, emotionTrend } from '../ai/emotion';
import { getOpenAIKey } from '../ai/openai';
import { generateStrategyThought } from '../ai/strategist';
import { ulawBytesToMs } from '../lib/g711';
import { logger } from '../lib/logger';
import { insertCallEvents, updateCall, type CallRow } from '../modules/calls/repo';
import { searchKnowledge } from '../modules/knowledge/service';
import { createMemory, retrieveMemories } from '../modules/memories/service';
import { getSettings } from '../modules/settings/service';
import { insertSegment, updateSegmentEmotion } from '../modules/transcripts/repo';
import { getTelephonyProvider } from '../telephony/registry';
import { OpenAIRealtimeVoice } from '../voice/openai-realtime';
import type { VoiceToolDef } from '../voice/types';
import { enqueuePostCall } from '../jobs/queue';
import { hub } from './hub';
import type { CallPrep, MediaAdapter } from './types';

const TOOLS: VoiceToolDef[] = [
  {
    name: 'search_memory',
    description:
      'Recall stored memories about this person or past conversations. Use when something rings a bell or you need background you were not given.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'what to recall' } },
      required: ['query'],
    },
  },
  {
    name: 'save_memory',
    description:
      'Silently store a new lasting fact, preference, commitment or life event you learned on this call. Never announce that you are saving it.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'standalone sentence: who + fact' },
        kind: { type: 'string', enum: [...MEMORY_KINDS] },
        importance: { type: 'number', description: '0..1, how important this is to remember' },
      },
      required: ['content'],
    },
  },
  {
    name: 'search_knowledge',
    description: "Search the owner's uploaded documents for factual information.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'log_follow_up',
    description: 'Record a follow-up action you promised during the call.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        when: { type: 'string', description: 'when it should happen, natural language' },
      },
      required: ['note'],
    },
  },
  {
    name: 'end_call',
    description:
      'Hang up the phone call. Call this ONLY after you have already said a natural goodbye.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: [],
    },
  },
];

const b64Bytes = (b64: string) =>
  Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/**
 * Orchestrates one live phone call: bridges provider media ⇄ voice engine,
 * persists transcripts, runs the emotion/adaptation/strategist sidecars,
 * executes tools, tracks latency, and finalizes into the post-call pipeline.
 */
export class CallSession {
  readonly callId: string;
  private call: CallRow;
  private prep: CallPrep;
  private onFinalized: () => void;

  private adapter: MediaAdapter | null = null;
  private voice: OpenAIRealtimeVoice | null = null;
  private providerCallSid: string | null;

  private callStartMs = 0;
  private seq = 0;
  private humanSegments = 0;
  private tokensUsed = 0;
  private transcriptTail: Array<{ speaker: 'human' | 'ai'; text: string }> = [];
  private followUps: Array<{ note: string; when: string | null }> = [];

  private assistantSpeaking = false;
  private lastAssistantItemId: string | null = null;
  private itemSentMs = new Map<string, number>();
  private itemPlayedMs = new Map<string, number>();
  private aiPartial = new Map<string, string>();
  private responseStartedAtMs = new Map<string, number>();

  private lastSpeechStartedAudioMs: number | null = null;
  private lastSpeechStoppedAudioMs: number | null = null;
  private lastSpeechStoppedWallMs: number | null = null;
  private latencySamples: number[] = [];
  private latencySampledFor = new Set<string>();

  private emotionHistory: EmotionTimelinePoint[] = [];
  private adaptationNotes: string[] = [];
  private lastAdaptationAt = 0;
  private lastStrategistAt = 0;

  private endAfterResponse = false;
  private ending = false;
  private finalized = false;

  private pendingEvents: Array<{ tsMs: number; type: string; payload: Record<string, unknown> }> =
    [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private wrapupTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: { call: CallRow; prep: CallPrep; onFinalized: () => void }) {
    this.call = opts.call;
    this.callId = opts.call.id;
    this.prep = opts.prep;
    this.providerCallSid = opts.call.provider_call_sid;
    this.onFinalized = opts.onFinalized;
  }

  get isActive(): boolean {
    return !this.finalized;
  }

  snapshot() {
    return {
      callId: this.callId,
      direction: this.prep.direction,
      contactName: this.prep.contactName,
      to: this.call.to_number,
      from: this.call.from_number,
      startedAt: this.callStartMs ? new Date(this.callStartMs).toISOString() : null,
    };
  }

  setProviderCallSid(sid: string): void {
    this.providerCallSid = sid;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async attachMedia(adapter: MediaAdapter, providerCallSid?: string): Promise<void> {
    this.adapter = adapter;
    if (providerCallSid) this.providerCallSid = providerCallSid;
    this.callStartMs = Date.now();

    hub.broadcast('call.status', this.callId, {
      status: 'in_progress',
      direction: this.prep.direction,
      contactName: this.prep.contactName,
      to: this.call.to_number,
      from: this.call.from_number,
      startedAt: new Date(this.callStartMs).toISOString(),
    });
    this.recordEvent('state', { state: 'media_connected', provider: adapter.kind });

    if (this.prep.memoryRecall.length) {
      hub.broadcast('memory.recall', this.callId, {
        trigger: 'pre_call',
        memories: this.prep.memoryRecall,
      });
      this.recordEvent('memory_recall', {
        trigger: 'pre_call',
        memories: this.prep.memoryRecall,
      });
    }

    const apiKey = await getOpenAIKey();
    const voice = new OpenAIRealtimeVoice({
      apiKey,
      model: this.prep.realtimeModel,
      voice: this.prep.voice,
      instructions: this.prep.instructions,
      temperature: this.prep.temperature,
      tools: TOOLS,
      audioFormat: 'g711_ulaw',
      vad: { silenceDurationMs: 500, threshold: 0.5 },
    });
    this.voice = voice;
    this.wireVoice(voice);
    await voice.start();
    voice.respond(this.prep.greetingDirective);
    this.recordEvent('state', { state: 'voice_session_started', model: this.prep.realtimeModel });

    this.flushTimer = setInterval(() => this.flushEvents(), 2500);
    const maxMs = this.prep.maxDurationMinutes * 60_000;
    this.wrapupTimer = setTimeout(() => {
      this.voice?.respond(
        'You are nearly out of time on this call. Start wrapping up naturally now — do not mention a timer.',
      );
    }, Math.max(30_000, maxMs - 60_000));
    this.maxDurTimer = setTimeout(() => void this.end('max_duration'), maxMs);
  }

  /** Caller → model audio (base64 μ-law). */
  onProviderAudio(b64: string): void {
    this.voice?.sendAudio(b64);
  }

  /** Provider echoed a playback mark (`m|itemId|ms`). */
  onProviderMark(name: string): void {
    const parts = name.split('|');
    if (parts.length === 3 && parts[0] === 'm') {
      this.itemPlayedMs.set(parts[1], Number(parts[2]) || 0);
    }
  }

  onMediaClosed(): void {
    if (!this.ending) void this.end('media_closed', { hangup: false });
  }

  /** Owner pressed hang-up in the UI. */
  async hangupByOwner(): Promise<void> {
    await this.end('owner_hangup');
  }

  /** Provider status webhook says the call is over. */
  async externalFinalize(status: CallStatus): Promise<void> {
    if (this.finalized) return;
    this.ending = true;
    this.clearTimers();
    this.adapter?.close();
    this.voice?.close('call_ended');
    await this.finalize(status);
  }

  // ── Voice event wiring ─────────────────────────────────────────────────────

  private wireVoice(voice: OpenAIRealtimeVoice): void {
    voice.on('audio', ({ delta, itemId, responseId }) => {
      if (this.ending || !this.adapter) return;
      this.adapter.sendAudio(delta);
      this.assistantSpeaking = true;
      this.lastAssistantItemId = itemId;
      const sent = (this.itemSentMs.get(itemId) ?? 0) + ulawBytesToMs(b64Bytes(delta));
      this.itemSentMs.set(itemId, sent);
      this.adapter.sendMark?.(`m|${itemId}|${sent}`);

      if (this.lastSpeechStoppedWallMs && !this.latencySampledFor.has(responseId)) {
        this.latencySampledFor.add(responseId);
        const turnMs = Date.now() - this.lastSpeechStoppedWallMs;
        if (turnMs > 0 && turnMs < 20_000) {
          this.latencySamples.push(turnMs);
          const avgMs = Math.round(
            this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length,
          );
          hub.broadcast('latency', this.callId, { turnMs, avgMs });
          this.recordEvent('latency', { turnMs, avgMs });
        }
      }
    });

    voice.on('user_speech_started', ({ audioStartMs }) => {
      this.lastSpeechStartedAudioMs = audioStartMs;
      if (this.assistantSpeaking) this.handleBargeIn();
    });

    voice.on('user_speech_stopped', ({ audioEndMs }) => {
      this.lastSpeechStoppedAudioMs = audioEndMs;
      this.lastSpeechStoppedWallMs = Date.now();
    });

    voice.on('user_transcript', ({ text }) => {
      void this.handleUserUtterance(text);
    });

    voice.on('ai_transcript_delta', ({ delta, responseId }) => {
      const cur = (this.aiPartial.get(responseId) ?? '') + delta;
      this.aiPartial.set(responseId, cur);
      if (!this.responseStartedAtMs.has(responseId)) {
        this.responseStartedAtMs.set(responseId, this.nowMs());
      }
      hub.broadcast('transcript.partial', this.callId, { speaker: 'ai', text: cur });
    });

    voice.on('ai_transcript_done', ({ text, responseId }) => {
      this.aiPartial.delete(responseId);
      if (!text) return;
      const startedMs = this.responseStartedAtMs.get(responseId) ?? this.nowMs();
      this.responseStartedAtMs.delete(responseId);
      void this.persistSegment('ai', text, startedMs, this.nowMs());
    });

    voice.on('tool_call', (tc) => void this.handleToolCall(tc));

    voice.on('response_done', ({ usage }) => {
      this.tokensUsed += usage.totalTokens;
      this.assistantSpeaking = false;
      if (this.endAfterResponse && !this.ending) {
        // Let the farewell drain through the telephony buffer before hanging up.
        setTimeout(() => void this.end('agent_end_call'), 2800);
      }
    });

    voice.on('error', ({ message, fatal }) => {
      this.recordEvent('state', { state: 'voice_error', message });
      if (fatal && !this.ending) void this.end('voice_error');
    });

    voice.on('closed', ({ reason }) => {
      if (!this.ending) void this.end(`voice_closed:${reason}`);
    });
  }

  private handleBargeIn(): void {
    if (!this.adapter || !this.voice) return;
    this.adapter.clear();
    this.voice.cancelResponse();
    const itemId = this.lastAssistantItemId;
    if (itemId) {
      const playedMs =
        this.itemPlayedMs.get(itemId) ?? Math.max(0, (this.itemSentMs.get(itemId) ?? 0) - 400);
      this.voice.truncatePlayback(itemId, playedMs + 60);
    }
    this.assistantSpeaking = false;
    this.recordEvent('state', { state: 'interrupted' });
    hub.broadcast('thought', this.callId, {
      kind: 'observation',
      text: 'Caller interrupted — yielding immediately.',
    });
  }

  // ── Transcript & sidecars ──────────────────────────────────────────────────

  private async handleUserUtterance(text: string): Promise<void> {
    const startedMs = this.lastSpeechStartedAudioMs ?? this.nowMs();
    const endedMs = this.lastSpeechStoppedAudioMs ?? this.nowMs();
    const segment = await this.persistSegment('human', text, startedMs, endedMs);
    this.humanSegments += 1;
    if (segment) void this.classifyAndAdapt(segment.id, text);
    void this.maybeStrategize();
  }

  private async persistSegment(
    speaker: 'human' | 'ai',
    text: string,
    startedMs: number,
    endedMs: number,
  ): Promise<{ id: string } | null> {
    const seq = this.seq++;
    this.transcriptTail.push({ speaker, text });
    if (this.transcriptTail.length > 12) this.transcriptTail.shift();
    try {
      const row = await insertSegment({
        callId: this.callId,
        seq,
        speaker,
        text,
        startedMs: Math.max(0, Math.round(startedMs)),
        endedMs: Math.max(0, Math.round(endedMs)),
      });
      hub.broadcast('transcript.segment', this.callId, {
        id: row.id,
        speaker,
        text,
        startedMs: row.started_ms,
        endedMs: row.ended_ms,
      });
      return row;
    } catch (err) {
      logger.error({ err, callId: this.callId }, 'transcript insert failed');
      return null;
    }
  }

  private tailText(): string {
    return this.transcriptTail
      .map((t) => `${t.speaker === 'ai' ? 'AI' : 'Caller'}: ${t.text}`)
      .join('\n');
  }

  private async classifyAndAdapt(segmentId: string, text: string): Promise<void> {
    const state = await classifyEmotion({
      text,
      recentContext: this.tailText(),
      model: this.prep.miniModel,
    });
    if (!state || this.finalized) return;
    updateSegmentEmotion(segmentId, state).catch(() => {});
    this.emotionHistory.push({ ...state, tsMs: this.nowMs() });
    const trend = emotionTrend(this.emotionHistory);
    hub.broadcast('emotion.update', this.callId, { ...state, trend });
    this.recordEvent('emotion', { ...state, trend });

    const adapt = adaptationDirective(state);
    if (adapt && Date.now() - this.lastAdaptationAt > 20_000 && this.voice?.active) {
      this.lastAdaptationAt = Date.now();
      this.adaptationNotes.push(adapt.directive);
      if (this.adaptationNotes.length > 2) this.adaptationNotes.shift();
      this.voice.updateInstructions(
        `${this.prep.instructions}\n\n# LIVE ADAPTATION — apply right now\n- ${this.adaptationNotes.join('\n- ')}`,
      );
      hub.broadcast('adaptation', this.callId, adapt);
      this.recordEvent('adaptation', { ...adapt });
    }
  }

  private async maybeStrategize(): Promise<void> {
    if (!this.prep.strategist || this.finalized) return;
    if (Date.now() - this.lastStrategistAt < 15_000) return;
    this.lastStrategistAt = Date.now();
    const thought = await generateStrategyThought({
      transcriptTail: this.tailText(),
      goal: this.prep.goal,
      model: this.prep.miniModel,
    });
    if (thought && !this.finalized) {
      hub.broadcast('thought', this.callId, { kind: 'strategy', text: thought });
      this.recordEvent('thought', { kind: 'strategy', text: thought });
    }
  }

  // ── Tools ──────────────────────────────────────────────────────────────────

  private async handleToolCall(tc: {
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
  }): Promise<void> {
    const t0 = Date.now();
    let result = '';
    try {
      result = await this.executeTool(tc.name, tc.args);
    } catch (err) {
      result = `Tool failed: ${(err as Error).message}`;
    }
    this.voice?.toolOutput(tc.toolCallId, result);
    const durationMs = Date.now() - t0;
    hub.broadcast('tool', this.callId, {
      name: tc.name,
      args: tc.args,
      result: result.slice(0, 300),
      durationMs,
    });
    this.recordEvent('tool_call', {
      name: tc.name,
      args: tc.args,
      result: result.slice(0, 500),
      durationMs,
    });
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'search_memory': {
        const settings = await getSettings();
        const rows = await retrieveMemories({
          contactId: this.prep.contactId,
          queryText: String(args.query ?? ''),
          settings,
          limit: 5,
        });
        if (!rows.length) return 'No stored memories match that.';
        hub.broadcast('memory.recall', this.callId, {
          trigger: 'tool',
          memories: rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            content: r.content,
            score: Math.round((r.score ?? 0) * 1000) / 1000,
          })),
        });
        return rows.map((r) => `- (${r.kind}) ${r.content}`).join('\n');
      }
      case 'save_memory': {
        const content = String(args.content ?? '').trim();
        if (!content) return 'Nothing to save.';
        const kind = MEMORY_KINDS.includes(args.kind as MemoryKind)
          ? (args.kind as MemoryKind)
          : 'fact';
        await createMemory({
          content,
          kind,
          contactId: this.prep.contactId,
          importance: Math.max(0, Math.min(1, Number(args.importance) || 0.6)),
          sourceCallId: this.callId,
        });
        return 'Saved.';
      }
      case 'search_knowledge': {
        const hits = await searchKnowledge(String(args.query ?? ''), 4);
        if (!hits.length) return 'No relevant information found in the knowledge base.';
        return hits.map((h) => `[${h.documentTitle}] ${h.content}`).join('\n---\n');
      }
      case 'log_follow_up': {
        const note = String(args.note ?? '').trim();
        if (!note) return 'Nothing to log.';
        const when = args.when ? String(args.when) : null;
        this.followUps.push({ note, when });
        await createMemory({
          content: `Committed: ${note}${when ? ` (${when})` : ''}`,
          kind: 'commitment',
          contactId: this.prep.contactId,
          importance: 0.7,
          sourceCallId: this.callId,
        });
        return 'Noted.';
      }
      case 'end_call':
        this.endAfterResponse = true;
        return 'Understood — the call will hang up after you finish this sentence. Say your goodbye now if you have not already.';
      default:
        return `Unknown tool: ${name}`;
    }
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  private async end(reason: string, opts: { hangup?: boolean } = {}): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    this.clearTimers();
    this.recordEvent('state', { state: 'ending', reason });

    if (opts.hangup !== false && this.providerCallSid) {
      try {
        await getTelephonyProvider(this.call.provider).hangup(this.providerCallSid);
      } catch (err) {
        logger.warn({ err, callId: this.callId }, 'provider hangup failed');
      }
    }
    this.adapter?.close();
    this.voice?.close(reason);
    await this.finalize('completed');
  }

  private async finalize(status: CallStatus): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    this.clearTimers();

    const durationSeconds = this.callStartMs
      ? Math.max(0, Math.round((Date.now() - this.callStartMs) / 1000))
      : 0;
    const latencyMsAvg = this.latencySamples.length
      ? Math.round(this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length)
      : undefined;

    try {
      await updateCall(this.callId, {
        status,
        endedAt: new Date(),
        durationSeconds,
        ...(latencyMsAvg !== undefined ? { latencyMsAvg } : {}),
        tokensUsed: this.tokensUsed,
        emotionTimeline: this.emotionHistory,
        metadata: {
          ...this.call.metadata,
          followUps: this.followUps,
        },
      });
    } catch (err) {
      logger.error({ err, callId: this.callId }, 'finalize updateCall failed');
    }

    this.recordEvent('state', { state: 'finalized', status, durationSeconds });
    await this.flushEvents();
    hub.broadcast('call.ended', this.callId, { durationSeconds, status });

    if (this.humanSegments > 0) {
      enqueuePostCall(this.callId).catch((err) =>
        logger.error({ err, callId: this.callId }, 'postcall enqueue failed'),
      );
    }
    this.onFinalized();
  }

  private clearTimers(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.wrapupTimer) clearTimeout(this.wrapupTimer);
    if (this.maxDurTimer) clearTimeout(this.maxDurTimer);
    this.flushTimer = this.wrapupTimer = this.maxDurTimer = null;
  }

  private recordEvent(type: string, payload: Record<string, unknown>): void {
    this.pendingEvents.push({ tsMs: this.nowMs(), type, payload });
  }

  private async flushEvents(): Promise<void> {
    const batch = this.pendingEvents.splice(0);
    if (!batch.length) return;
    try {
      await insertCallEvents(this.callId, batch);
    } catch (err) {
      logger.warn({ err, callId: this.callId }, 'call_events flush failed');
    }
  }

  private nowMs(): number {
    return this.callStartMs ? Math.max(0, Date.now() - this.callStartMs) : 0;
  }
}
