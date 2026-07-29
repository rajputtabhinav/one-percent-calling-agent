import type { CallDirection, MemoryKind } from '@onepct/shared';

/** Everything a live call session needs, computed before/at call start and
 *  cached in Redis (`callprep:{callId}`) so webhooks can answer instantly. */
export interface CallPrep {
  instructions: string;
  greetingDirective: string;
  voice: string;
  temperature: number;
  realtimeModel: string;
  miniModel: string;
  agentName: string;
  contactId: string | null;
  contactName: string | null;
  personalityId: string | null;
  goal: string | null;
  direction: CallDirection;
  record: boolean;
  maxDurationMinutes: number;
  strategist: boolean;
  memoryRecall: Array<{ id: string; kind: MemoryKind; content: string; score: number }>;
}

/** Provider-specific media socket wrapper (Twilio Media Streams / Exotel Voicebot). */
export interface MediaAdapter {
  readonly kind: 'twilio' | 'exotel';
  /** Send base64 μ-law audio to the caller. */
  sendAudio(b64Ulaw: string): void;
  /** Flush any audio the provider has buffered but not yet played (barge-in). */
  clear(): void;
  /** Optional playback progress marker (echoed back by the provider). */
  sendMark?(name: string): void;
  close(): void;
}
