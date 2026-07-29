import type { ReflectionScores } from '@onepct/shared';
import { chatJSON } from './openai';
import { asStringArray } from './summarize';

export interface ReflectionResult {
  wentWell: string[];
  wentPoorly: string[];
  missedOpportunities: string[];
  memoryAssessment: string;
  emotionAssessment: string;
  advice: string;
  scores: ReflectionScores;
}

const SYSTEM = `You are the self-critique module of an AI phone agent. Analyze the finished call and be brutally honest about the AGENT's performance (speaker "AI").
Return STRICT JSON:
{
  "wentWell": ["specific things the agent did well", max 4],
  "wentPoorly": ["specific failures: awkward phrasing, missed cues, talking too much, robotic moments", max 4],
  "missedOpportunities": ["moments the agent should have used differently — unexplored topics, unasked questions, unused memories", max 4],
  "memoryAssessment": "1-2 sentences: did the agent use its injected memories well? Did it forget or misuse anything?",
  "emotionAssessment": "1-2 sentences: how well did the agent read and respond to the caller's emotions?",
  "advice": "ONE concrete, reusable instruction (max 40 words) the agent should apply on the NEXT call with this person — written as an imperative",
  "scores": {"conversationQuality": 0..1, "emotionalIntelligence": 0..1, "memoryEffectiveness": 0..1, "goalCompletion": 0..1}
}`;

export async function reflectOnCall(opts: {
  transcriptText: string;
  contactName: string | null;
  goal: string | null;
  injectedMemories: string[];
  emotionSummary: string;
  model: string;
}): Promise<ReflectionResult> {
  const result = await chatJSON<ReflectionResult>({
    model: opts.model,
    system: SYSTEM,
    user: [
      `Call with: ${opts.contactName ?? 'unknown'}`,
      `Goal: ${opts.goal ?? 'friendly conversation'}`,
      `Memories the agent had available: ${opts.injectedMemories.length ? opts.injectedMemories.join(' | ') : 'none'}`,
      `Detected caller emotions: ${opts.emotionSummary || 'none recorded'}`,
      '',
      `Transcript:\n${opts.transcriptText}`,
    ].join('\n'),
    temperature: 0.3,
    maxTokens: 900,
  });
  const s = result.scores ?? ({} as ReflectionScores);
  const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));
  return {
    wentWell: asStringArray(result.wentWell, 4),
    wentPoorly: asStringArray(result.wentPoorly, 4),
    missedOpportunities: asStringArray(result.missedOpportunities, 4),
    memoryAssessment: String(result.memoryAssessment ?? '').slice(0, 600),
    emotionAssessment: String(result.emotionAssessment ?? '').slice(0, 600),
    advice: String(result.advice ?? '').slice(0, 400),
    scores: {
      conversationQuality: clamp(s.conversationQuality),
      emotionalIntelligence: clamp(s.emotionalIntelligence),
      memoryEffectiveness: clamp(s.memoryEffectiveness),
      goalCompletion: clamp(s.goalCompletion),
    },
  };
}
