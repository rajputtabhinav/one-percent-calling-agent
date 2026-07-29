// Core entity DTOs as returned by the API (camelCase, ISO timestamps).

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_STATUSES = [
  'queued',
  'ringing',
  'in_progress',
  'completed',
  'failed',
  'no_answer',
  'busy',
  'canceled',
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const TELEPHONY_PROVIDERS = ['twilio', 'exotel', 'sip'] as const;
export type TelephonyProviderName = (typeof TELEPHONY_PROVIDERS)[number];

export const MEMORY_KINDS = [
  'fact',
  'preference',
  'event',
  'relationship',
  'identity',
  'commitment',
  'other',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const EMOTION_LABELS = [
  'happy',
  'excited',
  'neutral',
  'confused',
  'stressed',
  'frustrated',
  'angry',
  'sad',
] as const;
export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export const REALTIME_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'marin',
  'sage',
  'shimmer',
  'verse',
] as const;
export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

export interface OwnerDto {
  id: string;
  username: string;
  displayName: string;
  agentName: string;
}

export interface ContactDto {
  id: string;
  name: string;
  phoneE164: string;
  relationshipLabel: string | null;
  notes: string | null;
  familiarityScore: number;
  trustScore: number;
  interactionCount: number;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalityStyle {
  pace: number;
  warmth: number;
  formality: number;
  humor: number;
  empathy: number;
}

export interface PersonalityDto {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  style: PersonalityStyle;
  voice: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmotionState {
  label: EmotionLabel;
  intensity: number; // 0..1
  valence: number; // -1..1
  arousal: number; // 0..1
}

export interface EmotionTimelinePoint extends EmotionState {
  tsMs: number;
}

export interface CallDto {
  id: string;
  direction: CallDirection;
  status: CallStatus;
  provider: TelephonyProviderName;
  providerCallSid: string | null;
  contactId: string | null;
  contactName: string | null;
  fromNumber: string;
  toNumber: string;
  personalityId: string | null;
  personalityName: string | null;
  goal: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  latencyMsAvg: number | null;
  tokensUsed: number;
  qualityScore: number | null;
  emotionTimeline: EmotionTimelinePoint[];
  error: string | null;
  hasRecording: boolean;
  hasSummary: boolean;
  hasReflection: boolean;
  createdAt: string;
}

export interface RecordingDto {
  id: string;
  callId: string;
  durationSeconds: number;
  sizeBytes: number;
  channels: number;
  format: string;
  status: 'pending' | 'ready' | 'failed';
  createdAt: string;
  // joined for list views
  direction: CallDirection | null;
  contactName: string | null;
  toNumber: string | null;
  fromNumber: string | null;
  callStartedAt: string | null;
}

export type Speaker = 'human' | 'ai';

export interface TranscriptSegmentDto {
  id: string;
  callId: string;
  seq: number;
  speaker: Speaker;
  text: string;
  startedMs: number;
  endedMs: number | null;
  emotion: EmotionState | null;
}

export interface TranscriptSearchHit {
  callId: string;
  segmentId: string;
  speaker: Speaker;
  snippet: string;
  startedMs: number;
  callStartedAt: string | null;
  contactName: string | null;
  direction: CallDirection;
  toNumber: string;
  fromNumber: string;
}

export interface CallSummaryDto {
  id: string;
  callId: string;
  summary: string;
  keyPoints: string[];
  followUps: string[];
  importantMemories: string[];
  model: string;
  createdAt: string;
}

export interface MemoryDto {
  id: string;
  contactId: string | null;
  contactName: string | null;
  kind: MemoryKind;
  content: string;
  importance: number;
  confidence: number;
  sourceCallId: string | null;
  lastReferencedAt: string | null;
  referenceCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  score?: number; // present on semantic search results
}

export interface ReflectionScores {
  conversationQuality: number;
  emotionalIntelligence: number;
  memoryEffectiveness: number;
  goalCompletion: number;
}

export interface ReflectionDto {
  id: string;
  callId: string;
  wentWell: string[];
  wentPoorly: string[];
  missedOpportunities: string[];
  memoryAssessment: string;
  emotionAssessment: string;
  advice: string;
  scores: ReflectionScores;
  model: string;
  createdAt: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface KnowledgeSearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  seq: number;
  content: string;
  score: number;
}

export interface RelationshipEventDto {
  id: string;
  contactId: string;
  callId: string | null;
  kind: string;
  description: string;
  deltaFamiliarity: number;
  deltaTrust: number;
  createdAt: string;
}

export interface CallEventDto {
  id: string;
  callId: string;
  tsMs: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface AuditLogDto {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface SecretStatusDto {
  key: string;
  configured: boolean;
  preview: string | null; // e.g. "sk-…h3Fa"
  source: 'db' | 'env' | null;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  totalCalls: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
  callsLast7Days: number;
  avgQualityScore: number | null;
  avgLatencyMs: number | null;
  totalMemories: number;
  activeMemories: number;
  totalContacts: number;
  totalDocuments: number;
  tokensUsed: number;
}

export interface TimeseriesPoint {
  day: string; // YYYY-MM-DD
  inbound: number;
  outbound: number;
  durationSeconds: number;
}

export interface EmotionTrendPoint {
  day: string;
  distribution: Partial<Record<EmotionLabel, number>>;
}

export interface QualityTrendPoint {
  day: string;
  conversationQuality: number | null;
  emotionalIntelligence: number | null;
  memoryEffectiveness: number | null;
  calls: number;
}

export interface RelationshipGrowthRow {
  contactId: string;
  name: string;
  familiarityScore: number;
  trustScore: number;
  interactionCount: number;
  lastInteractionAt: string | null;
  familiarityDelta30d: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
