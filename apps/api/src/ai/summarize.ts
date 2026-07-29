import { chatJSON } from './openai';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  followUps: string[];
  importantMemories: string[];
}

const SYSTEM = `You summarize phone call transcripts for the caller's personal archive.
Return STRICT JSON:
{
  "summary": "2-4 sentence natural summary of what happened and the outcome",
  "keyPoints": ["the main things discussed, max 6"],
  "followUps": ["concrete commitments or next actions agreed on the call, with who/when if stated", ...],
  "importantMemories": ["lasting personal facts revealed on this call worth remembering", ...]
}
Empty arrays are fine. Be faithful — never invent details.`;

export async function summarizeCall(opts: {
  transcriptText: string;
  contactName: string | null;
  goal: string | null;
  model: string;
}): Promise<SummaryResult> {
  const result = await chatJSON<SummaryResult>({
    model: opts.model,
    system: SYSTEM,
    user: `Call with: ${opts.contactName ?? 'unknown'}\nCall goal: ${opts.goal ?? 'n/a'}\n\nTranscript:\n${opts.transcriptText}`,
    temperature: 0.2,
    maxTokens: 900,
  });
  return {
    summary: String(result.summary ?? '').slice(0, 2000),
    keyPoints: asStringArray(result.keyPoints, 6),
    followUps: asStringArray(result.followUps, 8),
    importantMemories: asStringArray(result.importantMemories, 8),
  };
}

export function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => (v as string).trim().slice(0, 500))
    .slice(0, max);
}
