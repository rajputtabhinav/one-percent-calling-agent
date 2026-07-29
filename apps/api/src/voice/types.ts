// Voice provider abstraction. The orchestrator only talks to this interface,
// so a relay pipeline (STT → LLM → TTS, e.g. ElevenLabs) can be swapped in
// without touching call logic. Primary implementation: openai-realtime.ts.

export interface VoiceToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface VoiceSessionOptions {
  apiKey: string;
  model: string;
  voice: string;
  instructions: string;
  temperature: number;
  tools: VoiceToolDef[];
  /** Telephony-native codec used both directions. */
  audioFormat: 'g711_ulaw';
  vad: { silenceDurationMs: number; threshold: number };
}

export interface VoiceUsage {
  totalTokens: number;
}

export interface VoiceEvents {
  /** Assistant audio chunk (base64, audioFormat encoding). */
  audio: { delta: string; itemId: string; responseId: string };
  user_speech_started: { audioStartMs: number };
  user_speech_stopped: { audioEndMs: number };
  /** Final transcription of a user utterance. */
  user_transcript: { text: string; itemId: string };
  ai_transcript_delta: { delta: string; responseId: string };
  ai_transcript_done: { text: string; responseId: string; itemId: string };
  tool_call: { toolCallId: string; name: string; args: Record<string, unknown> };
  response_started: { responseId: string };
  response_done: { responseId: string; usage: VoiceUsage; status: string };
  error: { message: string; fatal: boolean };
  closed: { reason: string };
}

export type VoiceEventName = keyof VoiceEvents;

export interface VoiceSession {
  start(): Promise<void>;
  sendAudio(b64: string): void;
  /** Ask the model to produce a response (greetings, nudges). */
  respond(instructions?: string): void;
  toolOutput(toolCallId: string, output: string): void;
  cancelResponse(): void;
  truncatePlayback(itemId: string, playedMs: number): void;
  updateInstructions(instructions: string): void;
  on<K extends VoiceEventName>(event: K, handler: (data: VoiceEvents[K]) => void): void;
  close(reason?: string): void;
  readonly active: boolean;
}
