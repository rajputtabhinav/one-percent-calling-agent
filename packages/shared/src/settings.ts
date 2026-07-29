import { z } from 'zod';

// Effective settings = DEFAULT_SETTINGS deep-merged with DB overrides.
// PUT /api/v1/settings accepts a deep-partial of SettingsSchema.

export const SettingsSchema = z.object({
  telephony: z.object({
    provider: z.enum(['twilio', 'exotel']),
    fromNumber: z.string().max(32),
    defaultCountryCode: z.string().regex(/^\+\d{1,4}$/),
  }),
  voice: z.object({
    voice: z.string().min(1).max(40),
    realtimeModel: z.string().min(1).max(80),
  }),
  ai: z.object({
    chatModel: z.string().min(1).max(80),
    miniModel: z.string().min(1).max(80),
    embeddingModel: z.string().min(1).max(80),
    disclosure: z.enum(['on_ask', 'always', 'never']),
    strategist: z.boolean(),
    temperature: z.number().min(0).max(1.5),
  }),
  call: z.object({
    record: z.boolean(),
    announceRecording: z.boolean(),
    maxDurationMinutes: z.number().int().min(1).max(180),
  }),
  inbound: z.object({
    enabled: z.boolean(),
    unknownPolicy: z.enum(['allow', 'reject']),
    greetingHint: z.string().max(500),
  }),
  memory: z.object({
    autoCapture: z.boolean(),
    maxInjected: z.number().int().min(0).max(50),
    minImportance: z.number().min(0).max(1),
    halfLifeDays: z.number().int().min(1).max(3650),
  }),
  prompt: z.object({
    // Optional owner-supplied skeleton. Supports {{agentName}}, {{ownerName}},
    // {{personality}}, {{context}} placeholders; empty = built-in template.
    identityTemplate: z.string().max(12000),
  }),
  personality: z.object({
    defaultId: z.string(), // uuid or '' = first builtin
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = z.object({
  telephony: SettingsSchema.shape.telephony.partial().optional(),
  voice: SettingsSchema.shape.voice.partial().optional(),
  ai: SettingsSchema.shape.ai.partial().optional(),
  call: SettingsSchema.shape.call.partial().optional(),
  inbound: SettingsSchema.shape.inbound.partial().optional(),
  memory: SettingsSchema.shape.memory.partial().optional(),
  prompt: SettingsSchema.shape.prompt.partial().optional(),
  personality: SettingsSchema.shape.personality.partial().optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = {
  telephony: { provider: 'twilio', fromNumber: '', defaultCountryCode: '+91' },
  voice: { voice: 'marin', realtimeModel: 'gpt-realtime' },
  ai: {
    chatModel: 'gpt-4o',
    miniModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    disclosure: 'on_ask',
    strategist: true,
    temperature: 0.8,
  },
  call: { record: true, announceRecording: false, maxDurationMinutes: 30 },
  inbound: { enabled: true, unknownPolicy: 'allow', greetingHint: '' },
  memory: { autoCapture: true, maxInjected: 12, minImportance: 0.3, halfLifeDays: 90 },
  prompt: { identityTemplate: '' },
  personality: { defaultId: '' },
};

export const SECRET_KEYS = [
  'openai.apiKey',
  'twilio.accountSid',
  'twilio.authToken',
  'exotel.sid',
  'exotel.apiKey',
  'exotel.apiToken',
  'exotel.subdomain',
  'exotel.flowId',
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
