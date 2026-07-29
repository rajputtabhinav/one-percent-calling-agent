import { EMOTION_LABELS, type EmotionLabel, type EmotionState } from '@onepct/shared';
import { chatJSON } from './openai';
import { logger } from '../lib/logger';

const SYSTEM = `You analyze the emotional state of a phone-call participant from their latest utterance.
Return STRICT JSON: {"label": one of ${EMOTION_LABELS.join('|')}, "intensity": 0..1, "valence": -1..1, "arousal": 0..1}.
"intensity" = how strongly the emotion is expressed. "valence" = negative↔positive. "arousal" = calm↔activated.
Judge from wording, not topic. Short neutral utterances are {"label":"neutral","intensity":0.2,"valence":0,"arousal":0.2}.`;

/** Classify one utterance. Never throws — returns null on any failure. */
export async function classifyEmotion(opts: {
  text: string;
  recentContext: string;
  model: string;
}): Promise<EmotionState | null> {
  try {
    const result = await chatJSON<EmotionState>({
      model: opts.model,
      system: SYSTEM,
      user: `Recent conversation:\n${opts.recentContext}\n\nLatest utterance to analyze:\n"${opts.text}"`,
      temperature: 0,
      maxTokens: 80,
    });
    if (!EMOTION_LABELS.includes(result.label as EmotionLabel)) return null;
    return {
      label: result.label,
      intensity: clamp01(result.intensity),
      valence: Math.max(-1, Math.min(1, Number(result.valence) || 0)),
      arousal: clamp01(result.arousal),
    };
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'emotion classify failed');
    return null;
  }
}

const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));

/** Live speaking-style adaptation directive for a detected emotional state. */
export function adaptationDirective(state: EmotionState): { reason: string; directive: string } | null {
  const strong = state.intensity >= 0.55;
  switch (state.label) {
    case 'angry':
      return strong
        ? {
            reason: 'Caller sounds angry',
            directive:
              'They are upset. Lower your energy, slow down, acknowledge their frustration explicitly before anything else, and do not defend or argue. Short, calm sentences.',
          }
        : null;
    case 'frustrated':
      return strong
        ? {
            reason: 'Caller sounds frustrated',
            directive:
              'They are getting frustrated. Stop explaining, acknowledge the annoyance, and move directly to what helps. Be brief.',
          }
        : null;
    case 'stressed':
      return strong
        ? {
            reason: 'Caller sounds stressed',
            directive:
              'They sound stressed. Speak slower and softer, reassure them, and take things one small step at a time.',
          }
        : null;
    case 'sad':
      return state.intensity >= 0.45
        ? {
            reason: 'Caller sounds down',
            directive:
              'They sound low. Soften your tone, slow down, acknowledge the feeling gently, and do not rush to fix things or change subject.',
          }
        : null;
    case 'confused':
      return strong
        ? {
            reason: 'Caller sounds confused',
            directive:
              'They are confused. Simplify: shorter sentences, one idea at a time, check understanding with a quick question.',
          }
        : null;
    case 'excited':
    case 'happy':
      return state.intensity >= 0.7
        ? {
            reason: 'Caller is energized',
            directive: 'They are in a great mood — match their energy, be playful, let the warmth show.',
          }
        : null;
    default:
      return null;
  }
}

export function emotionTrend(
  history: Array<{ valence: number }>,
): 'improving' | 'steady' | 'declining' {
  if (history.length < 3) return 'steady';
  const recent = history.slice(-2).reduce((s, e) => s + e.valence, 0) / 2;
  const earlier =
    history.slice(0, -2).slice(-3).reduce((s, e) => s + e.valence, 0) /
    Math.max(1, history.slice(0, -2).slice(-3).length);
  if (recent - earlier > 0.18) return 'improving';
  if (earlier - recent > 0.18) return 'declining';
  return 'steady';
}
