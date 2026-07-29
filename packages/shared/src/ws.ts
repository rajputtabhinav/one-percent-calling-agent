import type {
  CallDirection,
  CallStatus,
  EmotionLabel,
  MemoryKind,
  Speaker,
} from './types';

// ── Dashboard WebSocket protocol ─────────────────────────────────────────────
// Server → client events; every message is a DashboardEvent envelope.

export interface CallStatusEvent {
  status: CallStatus;
  direction: CallDirection;
  contactName: string | null;
  to: string;
  from: string;
  startedAt: string | null;
}

export interface TranscriptPartialEvent {
  speaker: Speaker;
  text: string;
}

export interface TranscriptSegmentEvent {
  id: string;
  speaker: Speaker;
  text: string;
  startedMs: number;
  endedMs: number | null;
}

export interface EmotionUpdateEvent {
  label: EmotionLabel;
  intensity: number;
  valence: number;
  arousal: number;
  trend: 'improving' | 'steady' | 'declining';
}

export interface ThoughtEvent {
  kind: 'strategy' | 'observation';
  text: string;
}

export interface MemoryRecallEvent {
  trigger: 'pre_call' | 'tool';
  memories: Array<{ id: string; kind: MemoryKind; content: string; score: number }>;
}

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  durationMs?: number;
}

export interface AdaptationEvent {
  reason: string;
  directive: string;
}

export interface LatencyEvent {
  turnMs: number;
  avgMs: number;
}

export interface CallEndedEvent {
  durationSeconds: number;
  status: CallStatus;
}

export interface PostcallDoneEvent {
  summaryReady: boolean;
  reflectionReady: boolean;
}

export interface DashboardEventMap {
  'call.status': CallStatusEvent;
  'transcript.partial': TranscriptPartialEvent;
  'transcript.segment': TranscriptSegmentEvent;
  'emotion.update': EmotionUpdateEvent;
  thought: ThoughtEvent;
  'memory.recall': MemoryRecallEvent;
  tool: ToolEvent;
  adaptation: AdaptationEvent;
  latency: LatencyEvent;
  'call.ended': CallEndedEvent;
  'postcall.done': PostcallDoneEvent;
}

export type DashboardEventType = keyof DashboardEventMap;

export type DashboardEvent = {
  [K in DashboardEventType]: {
    type: K;
    callId: string;
    tsMs: number;
    data: DashboardEventMap[K];
  };
}[DashboardEventType];

// Client → server
export type DashboardClientMessage =
  | { type: 'subscribe'; callId: string | '*' }
  | { type: 'unsubscribe'; callId: string | '*' }
  | { type: 'ping' };
