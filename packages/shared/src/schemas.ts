import { z } from 'zod';
import { CALL_DIRECTIONS, CALL_STATUSES, MEMORY_KINDS } from './types';

// ── Auth ─────────────────────────────────────────────────────────────────────

export const SetupRequestSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(120).optional(),
  agentName: z.string().min(1).max(60).optional(),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// ── Contacts ─────────────────────────────────────────────────────────────────

export const CreateContactSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(4).max(32),
  relationshipLabel: z.string().max(80).nullish(),
  notes: z.string().max(4000).nullish(),
});
export type CreateContact = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.partial();
export type UpdateContact = z.infer<typeof UpdateContactSchema>;

// ── Calls ────────────────────────────────────────────────────────────────────

export const CreateCallSchema = z.object({
  to: z.string().min(4).max(32),
  contactId: z.string().uuid().optional(),
  personalityId: z.string().uuid().optional(),
  goal: z.string().max(2000).optional(),
  record: z.boolean().optional(),
});
export type CreateCall = z.infer<typeof CreateCallSchema>;

export const CallListQuerySchema = z.object({
  direction: z.enum(CALL_DIRECTIONS).optional(),
  status: z.enum(CALL_STATUSES).optional(),
  contactId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  from: z.string().optional(), // ISO date lower bound
  to: z.string().optional(), // ISO date upper bound
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CallListQuery = z.infer<typeof CallListQuerySchema>;

// ── Memories ─────────────────────────────────────────────────────────────────

export const CreateMemorySchema = z.object({
  content: z.string().min(1).max(2000),
  kind: z.enum(MEMORY_KINDS).default('fact'),
  contactId: z.string().uuid().nullish(),
  importance: z.number().min(0).max(1).default(0.5),
});
export type CreateMemory = z.infer<typeof CreateMemorySchema>;

export const UpdateMemorySchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  kind: z.enum(MEMORY_KINDS).optional(),
  importance: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMemory = z.infer<typeof UpdateMemorySchema>;

// ── Personalities ────────────────────────────────────────────────────────────

export const PersonalityStyleSchema = z.object({
  pace: z.number().min(0).max(1),
  warmth: z.number().min(0).max(1),
  formality: z.number().min(0).max(1),
  humor: z.number().min(0).max(1),
  empathy: z.number().min(0).max(1),
});

export const UpsertPersonalitySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(''),
  systemPrompt: z.string().min(1).max(8000),
  style: PersonalityStyleSchema,
  voice: z.string().min(1).max(40),
});
export type UpsertPersonality = z.infer<typeof UpsertPersonalitySchema>;

// ── Settings & secrets ───────────────────────────────────────────────────────

export const SecretPutSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(2000), // empty string deletes
});
export type SecretPut = z.infer<typeof SecretPutSchema>;

// ── Pagination helper ────────────────────────────────────────────────────────

export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;
