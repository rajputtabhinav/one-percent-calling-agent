import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@onepct/shared';
import { buildGreetingDirective, buildSystemPrompt, styleDirectives } from '../src/ai/prompts';
import type { ContactRow } from '../src/modules/contacts/repo';
import type { PersonalityRow } from '../src/modules/personalities/repo';

const personality: PersonalityRow = {
  id: 'p1',
  name: 'Friendly',
  description: '',
  system_prompt: 'You are warm and upbeat.',
  style: { pace: 0.5, warmth: 0.9, formality: 0.2, humor: 0.7, empathy: 0.8 },
  voice: 'marin',
  is_builtin: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const contact: ContactRow = {
  id: 'c1',
  name: 'Ravi Kumar',
  phone_e164: '+919876543210',
  relationship_label: 'college friend',
  notes: 'Lives in Pune',
  familiarity_score: 45,
  trust_score: 60,
  interaction_count: 7,
  first_interaction_at: new Date('2026-01-01'),
  last_interaction_at: new Date('2026-06-01'),
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-06-01'),
};

function build(settings: Settings = DEFAULT_SETTINGS, direction: 'inbound' | 'outbound' = 'outbound') {
  return buildSystemPrompt({
    agentName: 'Aarav',
    ownerName: 'Abhinav',
    direction,
    goal: 'Ask him about the wedding plans',
    personality,
    contact,
    memories: [
      {
        id: 'm1',
        contact_id: 'c1',
        kind: 'event',
        content: "Ravi's sister gets married in November",
        importance: 0.9,
        confidence: 0.9,
        source_call_id: null,
        last_referenced_at: null,
        reference_count: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    lastSummaries: [{ endedAt: '2026-06-01T10:00:00Z', summary: 'Talked about his new job.' }],
    advice: ['Let Ravi finish his sentences — he opens up when not rushed.'],
    knowledgeTitles: ['Wedding venue shortlist'],
    timelineHighlights: ['Tue Jun 02 2026: Crossed 5 calls together'],
    settings,
    localTime: 'Wed Jun 10 2026 14:00',
  });
}

describe('buildSystemPrompt', () => {
  it('contains identity, personality, memories, goal, and lessons', () => {
    const prompt = build();
    expect(prompt).toContain('You are Aarav');
    expect(prompt).toContain('You are warm and upbeat.');
    expect(prompt).toContain("Ravi's sister gets married in November");
    expect(prompt).toContain('Ask him about the wedding plans');
    expect(prompt).toContain('Let Ravi finish his sentences');
    expect(prompt).toContain('Wedding venue shortlist');
    expect(prompt).toContain('7 previous calls');
  });

  it('respects disclosure modes', () => {
    const onAsk = build();
    expect(onAsk).toContain('answer honestly in one short sentence');
    const always = build({
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_SETTINGS.ai, disclosure: 'always' },
    });
    expect(always).toContain('briefly mention that you are an AI');
    const never = build({
      ...DEFAULT_SETTINGS,
      ai: { ...DEFAULT_SETTINGS.ai, disclosure: 'never' },
    });
    expect(never).toContain('Never explicitly claim to be human');
  });

  it('switches framing for inbound calls', () => {
    const prompt = build(DEFAULT_SETTINGS, 'inbound');
    expect(prompt).toContain('ANSWERING THIS CALL');
    expect(prompt).not.toContain('WHY YOU ARE CALLING');
  });
});

describe('styleDirectives', () => {
  it('maps slider extremes to distinct directives', () => {
    const fast = styleDirectives({ pace: 0.9, warmth: 0.5, formality: 0.5, humor: 0.5, empathy: 0.5 });
    const slow = styleDirectives({ pace: 0.1, warmth: 0.5, formality: 0.5, humor: 0.5, empathy: 0.5 });
    expect(fast).toContain('brisk');
    expect(slow).toContain('slowly');
    expect(fast).not.toEqual(slow);
  });
});

describe('buildGreetingDirective', () => {
  it('introduces itself on first calls only', () => {
    expect(
      buildGreetingDirective({ direction: 'outbound', contactName: 'Ravi', firstCall: true }),
    ).toContain('introduce yourself');
    expect(
      buildGreetingDirective({ direction: 'outbound', contactName: 'Ravi', firstCall: false }),
    ).toContain('know each other');
    expect(buildGreetingDirective({ direction: 'inbound', contactName: null, firstCall: false })).toContain(
      'answer the phone',
    );
  });
});
