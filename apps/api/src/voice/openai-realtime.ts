import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../lib/logger';
import type {
  VoiceEventName,
  VoiceEvents,
  VoiceSession,
  VoiceSessionOptions,
} from './types';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';

/**
 * Speech-to-speech session on the OpenAI Realtime API over WebSocket.
 * μ-law in, μ-law out — no transcoding on the Twilio path.
 */
export class OpenAIRealtimeVoice implements VoiceSession {
  private ws: WebSocket | null = null;
  private emitter = new EventEmitter();
  private opts: VoiceSessionOptions;
  private closed = false;
  private startResolve: (() => void) | null = null;
  private startReject: ((err: Error) => void) | null = null;
  private activeResponseId: string | null = null;

  constructor(opts: VoiceSessionOptions) {
    this.opts = opts;
    this.emitter.setMaxListeners(30);
  }

  get active(): boolean {
    return !this.closed && this.ws?.readyState === WebSocket.OPEN;
  }

  on<K extends VoiceEventName>(event: K, handler: (data: VoiceEvents[K]) => void): void {
    this.emitter.on(event, handler);
  }

  private emit<K extends VoiceEventName>(event: K, data: VoiceEvents[K]): void {
    this.emitter.emit(event, data);
  }

  async start(): Promise<void> {
    const url = `${OPENAI_REALTIME_URL}?model=${encodeURIComponent(this.opts.model)}`;
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    const ws = this.ws;
    ws.on('message', (raw) => this.handleMessage(String(raw)));
    ws.on('error', (err) => {
      logger.error({ err: err.message }, 'realtime ws error');
      this.startReject?.(err);
      this.startReject = null;
      this.emit('error', { message: err.message, fatal: true });
    });
    ws.on('close', (code) => {
      const wasClosed = this.closed;
      this.closed = true;
      if (!wasClosed) this.emit('closed', { reason: `ws_close_${code}` });
    });

    await new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
      const timer = setTimeout(() => reject(new Error('realtime session start timeout')), 15000);
      this.emitter.once('__session_created', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.opts.instructions,
        voice: this.opts.voice,
        input_audio_format: this.opts.audioFormat,
        output_audio_format: this.opts.audioFormat,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: this.opts.vad.threshold,
          prefix_padding_ms: 300,
          silence_duration_ms: this.opts.vad.silenceDurationMs,
        },
        tools: this.opts.tools.map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        tool_choice: 'auto',
        temperature: this.opts.temperature,
        max_response_output_tokens: 4096,
      },
    });
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  sendAudio(b64: string): void {
    this.send({ type: 'input_audio_buffer.append', audio: b64 });
  }

  respond(instructions?: string): void {
    this.send({
      type: 'response.create',
      ...(instructions ? { response: { instructions } } : {}),
    });
  }

  toolOutput(toolCallId: string, output: string): void {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: toolCallId, output },
    });
    this.send({ type: 'response.create' });
  }

  cancelResponse(): void {
    if (this.activeResponseId) {
      this.send({ type: 'response.cancel' });
    }
  }

  truncatePlayback(itemId: string, playedMs: number): void {
    this.send({
      type: 'conversation.item.truncate',
      item_id: itemId,
      content_index: 0,
      audio_end_ms: Math.max(0, Math.floor(playedMs)),
    });
  }

  updateInstructions(instructions: string): void {
    this.send({ type: 'session.update', session: { instructions } });
  }

  close(reason = 'closed'): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws?.close(1000, reason.slice(0, 100));
    } catch {
      /* already closing */
    }
    this.emit('closed', { reason });
  }

  // ── Server event dispatch ──────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type as string) {
      case 'session.created':
        this.emitter.emit('__session_created');
        break;

      case 'input_audio_buffer.speech_started':
        this.emit('user_speech_started', { audioStartMs: msg.audio_start_ms ?? 0 });
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emit('user_speech_stopped', { audioEndMs: msg.audio_end_ms ?? 0 });
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(msg.transcript ?? '').trim();
        if (text) this.emit('user_transcript', { text, itemId: msg.item_id ?? '' });
        break;
      }

      case 'response.created':
        this.activeResponseId = msg.response?.id ?? null;
        this.emit('response_started', { responseId: this.activeResponseId ?? '' });
        break;

      case 'response.audio.delta':
        this.emit('audio', {
          delta: msg.delta ?? '',
          itemId: msg.item_id ?? '',
          responseId: msg.response_id ?? '',
        });
        break;

      case 'response.audio_transcript.delta':
        this.emit('ai_transcript_delta', {
          delta: msg.delta ?? '',
          responseId: msg.response_id ?? '',
        });
        break;

      case 'response.audio_transcript.done':
        this.emit('ai_transcript_done', {
          text: String(msg.transcript ?? '').trim(),
          responseId: msg.response_id ?? '',
          itemId: msg.item_id ?? '',
        });
        break;

      case 'response.function_call_arguments.done': {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(msg.arguments ?? '{}');
        } catch {
          /* tolerate malformed args */
        }
        this.emit('tool_call', {
          toolCallId: msg.call_id ?? '',
          name: msg.name ?? '',
          args,
        });
        break;
      }

      case 'response.done': {
        const responseId = msg.response?.id ?? '';
        if (this.activeResponseId === responseId) this.activeResponseId = null;
        this.emit('response_done', {
          responseId,
          status: msg.response?.status ?? 'completed',
          usage: { totalTokens: msg.response?.usage?.total_tokens ?? 0 },
        });
        break;
      }

      case 'error': {
        const message = msg.error?.message ?? 'unknown realtime error';
        // response.cancel races are benign — don't surface them.
        const benign = /no active response|cancellation failed|already shorter/i.test(message);
        if (!benign) {
          logger.warn({ message }, 'realtime api error event');
          this.emit('error', { message, fatal: false });
        }
        break;
      }

      default:
        break;
    }
  }
}
